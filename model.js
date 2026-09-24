(() => {
  'use strict';

  const states = {
    confirmed: { label:'已确认', icon:'circle-check', className:'confirmed' },
    candidate: { label:'候选', icon:'circle-help', className:'candidate' },
    pending: { label:'待确认', icon:'clock-3', className:'pending' },
    optional: { label:'可选', icon:'circle-dashed', className:'optional' },
    cancelled: { label:'已取消', icon:'circle-off', className:'cancelled' }
  };
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9\u0400-\u04ff\u4e00-\u9fff]+/g,'');
  const clock = value => /^\d{1,2}:\d{2}$/.test(String(value || ''));
  const dateParts = value => {
    const match = String(value || '').match(/^(\d{1,2})[./](\d{1,2})$/);
    return match ? [Number(match[1]),Number(match[2])] : null;
  };
  const dateKey = value => {
    const parts = dateParts(value);
    return parts ? `2026-${String(parts[0]).padStart(2,'0')}-${String(parts[1]).padStart(2,'0')}` : '';
  };
  const todayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  };
  const dayIndexForToday = data => (data.days || []).findIndex(day => dateKey(day.date) === todayKey());
  const statusOf = value => {
    if (states[value?.status]) return value.status;
    if (value?.cancelled) return 'cancelled';
    if (value?.confirmed === true || /已购|已出票|已确认/.test(value?.badge || '')) return 'confirmed';
    if (/(候选)/.test(`${value?.title || ''} ${value?.badge || ''}`)) return 'candidate';
    if (/(可选|备用|视情况)/.test(`${value?.title || ''} ${value?.badge || ''}`)) return 'optional';
    return 'pending';
  };
  const getStatusLabel = value => states[typeof value === 'string' ? value : statusOf(value)]?.label || states.pending.label;
  const getStatusClass = value => states[typeof value === 'string' ? value : statusOf(value)]?.className || states.pending.className;
  const getStatusIcon = value => states[typeof value === 'string' ? value : statusOf(value)]?.icon || states.pending.icon;

  function resolveLeg(data,item,dayIndex) {
    const legs = data.legs || [];
    if (item?.legId) return legs.find(leg => leg.id === item.legId) || null;
    const day = data.days?.[dayIndex];
    const candidates = legs.filter(leg => day?.legs?.includes(leg.id));
    const title = normalize(item?.title);
    const byCode = candidates.find(leg => leg.code && normalize(leg.code).length >= 4 && title.includes(normalize(leg.code)));
    if (byCode) return byCode;
    if (/公路转场/.test(item?.title || '')) return candidates.find(leg => leg.mode === 'road') || null;
    return null;
  }

  function linkedPlaces(data,item,dayIndex) {
    const places = data.savedPlaces || [];
    const ids = new Set(item?.placeIds || []);
    const day = data.days?.[dayIndex];
    const cityIds = (data.cities || []).filter(city => day?.city?.includes(city.name)).map(city => city.id);
    if (day?.cityId && !cityIds.includes(day.cityId)) cityIds.push(day.cityId);
    const words = value => (String(value || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length >= 3 && !['the','and','of','hotel','city'].includes(word));
    for (const [label,query] of item?.maps || []) {
      const terms = [normalize(label),normalize(query)].filter(term => term.length >= 3);
      const queryWords = words(query);
      const matches = places.filter(place =>
        (!cityIds.length || cityIds.includes(place.cityId)) &&
        (terms.some(term => term === normalize(place.name) || term.startsWith(normalize(place.name)) && normalize(place.name).length >= 6) ||
        (() => {
          const placeWords = words(place.name);
          const overlap = placeWords.filter(word => queryWords.includes(word)).length;
          return overlap >= 2 && overlap / Math.min(placeWords.length,queryWords.length) >= .7;
        })())
      );
      if (matches.length === 1) ids.add(matches[0].id);
    }
    return places.filter(place => ids.has(place.id));
  }

  function hotelForCity(city,data) {
    if (!city) return null;
    const relatedDays = (data.days || []).filter(day => day.cityId === city.id && day.hotel && day.hotel !== '—' && day.hotel !== '机上');
    const first = relatedDays[0];
    const checkIn = city.checkIn || first?.date || '';
    const arrivalIndex = (data.days || []).findIndex(day => day.date === checkIn);
    const nextDay = data.days?.[arrivalIndex + Number(city.nights || relatedDays.length)];
    const mapQuery = city.hotelMapQuery || [city.hotel,city.name,city.country].filter(Boolean).join(' ');
    return {
      id:city.hotelId || `${city.id}-hotel`,
      displayName:city.hotel || first?.hotel || '住宿待确认',
      bookingName:city.hotelBookingName || '',
      mapQuery,
      checkIn,
      checkOut:city.checkOut || nextDay?.date || '',
      nights:Number(city.nights || relatedDays.length || 0),
      breakfast:city.breakfast || '待确认'
    };
  }

  function validate(data) {
    const warnings = [];
    const report = (day,id,reason) => warnings.push(`${day || '全程'} / ${id || '数据'}: ${reason}`);
    const cities = new Set((data.cities || []).map(city => city.id));
    const legs = new Map((data.legs || []).map(leg => [leg.id,leg]));
    const places = new Set((data.savedPlaces || []).map(place => place.id));
    const hotels = new Set((data.cities || []).map(city => city.hotelId || `${city.id}-hotel`));
    const seen = new Set();
    for (const [type,items] of [['city',data.cities],['leg',data.legs],['place',data.savedPlaces],['day',data.todoDays]]) {
      for (const item of items || []) {
        if (!item.id) continue;
        const key = `${type}:${item.id}`;
        if (seen.has(key)) report('',item.id,`${type} ID 重复`);
        seen.add(key);
      }
    }
    (data.cities || []).forEach(city => {
      for (const index of city.dayIds || []) if (!data.days?.[index]) report('',city.id,`dayIds ${index} 越界`);
      if (city.hotelAliasOf && !hotels.has(city.hotelAliasOf)) report('',city.id,`hotel alias ${city.hotelAliasOf} 不存在`);
    });
    (data.savedPlaces || []).forEach(place => {
      if (place.cityId && !cities.has(place.cityId)) report('',place.id,`cityId ${place.cityId} 不存在`);
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) report('',place.id,'地图坐标缺失');
    });
    (data.days || []).forEach((day,index) => {
      if (day.cityId && !cities.has(day.cityId)) report(day.date,`day-${index}`,`cityId ${day.cityId} 不存在`);
      if (day.hotelId && !hotels.has(day.hotelId)) report(day.date,`day-${index}`,`hotelId ${day.hotelId} 不存在`);
      for (const id of day.legs || []) if (!legs.has(id)) report(day.date,`day-${index}`,`leg ${id} 不存在`);
      if (index && dateKey(day.date)) {
        const previous = Date.parse(`${dateKey(data.days[index-1].date)}T00:00:00Z`);
        const current = Date.parse(`${dateKey(day.date)}T00:00:00Z`);
        if (Number.isFinite(previous) && current-previous !== 86400000) report(day.date,`day-${index}`,'日期不连续');
      }
    });
    (data.legs || []).forEach(leg => {
      if (leg.map?.some(id => !cities.has(id))) report(leg.date,leg.id,'地图城市引用不存在');
      if (leg.originPlaceId && !places.has(leg.originPlaceId)) report(leg.date,leg.id,`originPlaceId ${leg.originPlaceId} 不存在`);
      if (leg.destinationPlaceId && !places.has(leg.destinationPlaceId)) report(leg.date,leg.id,`destinationPlaceId ${leg.destinationPlaceId} 不存在`);
      if (clock(leg.dep) && clock(leg.arr) && leg.arr < leg.dep && !leg.nextDay) report(leg.date,leg.id,'抵达早于出发，缺少 nextDay');
      if (leg.confirmed && /待定|待确认|candidate|optional/i.test(`${leg.note || ''} ${leg.status || ''}`)) report(leg.date,leg.id,'已确认交通仍含待确认文案');
    });
    (data.todoDays || []).forEach((day,dayIndex) => {
      if (!data.days?.[dayIndex]) report(day.date,day.id,'找不到对应的日历日期');
      const timed = [];
      const itemIds = new Set();
      (day.items || []).forEach((item,itemIndex) => {
        const id = item.id || `item-${itemIndex}`;
        if (item.id && itemIds.has(item.id)) report(day.date,item.id,'待办 ID 重复');
        if (item.id) itemIds.add(item.id);
        if (item.legId && !legs.has(item.legId)) report(day.date,id,`legId ${item.legId} 不存在`);
        for (const placeId of item.placeIds || []) if (!places.has(placeId)) report(day.date,id,`placeId ${placeId} 不存在`);
        if (item.cityId && !cities.has(item.cityId)) report(day.date,id,`cityId ${item.cityId} 不存在`);
        if (item.hotelId && !hotels.has(item.hotelId)) report(day.date,id,`hotelId ${item.hotelId} 不存在`);
        if (item.status === 'confirmed' && /候选|可选|待定|待确认/i.test(`${item.title || ''} ${item.note || ''}`)) report(day.date,id,'已确认事项仍含待确认文案');
        const leg = resolveLeg(data,item,dayIndex);
        if (leg && clock(leg.dep) && /^\d{1,2}:\d{2}–/.test(item.time || '') && item.time.slice(0,5) !== leg.dep) report(day.date,id,`Todo ${item.time} 与交通 ${leg.code} ${leg.dep} 冲突`);
        if (item.placeIds?.length && !item.maps?.length) report(day.date,id,'地点引用无地图入口');
        for (const [label,query] of item.maps || []) if (!label || !query) report(day.date,id,'地图名称或搜索词缺失');
        const match = String(item.time || '').match(/^(\d{1,2}):(\d{2})[–-](\d{1,2}):(\d{2})$/);
        if (match && !leg) timed.push({id,start:Number(match[1])*60+Number(match[2]),end:Number(match[3])*60+Number(match[4])});
      });
      timed.sort((a,b) => a.start-b.start);
      for (let i=1;i<timed.length;i++) if (timed[i].start < timed[i-1].end) report(day.date,timed[i].id,`与 ${timed[i-1].id} 时间重叠`);
    });
    warnings.forEach(message => console.warn(`[TREK data] ${message}`));
    return warnings;
  }

  window.TrekModel = { states,normalize,dateKey,todayKey,dayIndexForToday,statusOf,getStatusLabel,getStatusClass,getStatusIcon,resolveLeg,linkedPlaces,hotelForCity,validate };
})();
