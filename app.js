(async () => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = (value) => window.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const cloud = window.TrekCloud;
  const baseData = window.TREK_DATA;
  const model = window.TrekModel;
  let cloudError = '';
  let remoteData = null;
  try {
    await cloud?.init();
    remoteData = await cloud?.loadData();
  } catch (error) {
    cloudError = error.message || '云端行程暂时无法读取';
  }
  const validRemote = remoteData?.cities?.length && remoteData?.legs?.length && remoteData?.days?.length;
  const defaultLegs = Object.fromEntries((baseData.legs || []).map(leg => [leg.id,leg]));
  let data = validRemote ? {
    ...baseData,
    ...remoteData,
    legs: remoteData.legs.map(leg => {
      const original = defaultLegs[leg.id];
      const sameTrip = original && ['date','dep','arr','from','to'].every(field => original[field] === leg[field]);
      return sameTrip ? { ...original,...leg } : leg;
    }),
    savedPlaces: baseData.savedPlaces || []
  } : baseData;
  model.validate(data);
  const glyph = { rail:'train-front', road:'car-front', flight:'plane' };
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons = () => window.lucide?.createIcons();
  const cityById = Object.fromEntries(data.cities.map(c => [c.id,c]));
  const legById = Object.fromEntries(data.legs.map(l => [l.id,l]));
  const photo = {src:'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Registan_square_Samarkand.jpg/1280px-Registan_square_Samarkand.jpg',page:'https://commons.wikimedia.org/wiki/File:Registan_square_Samarkand.jpg'};
  let selected = null;
  let map;
  let cityMarkers = {};
  let tileLayer;
  let routeLayer;
  let todayRouteLayer;
  let cityLayer;
  let savedLayersByCity = {};
  let savedMarkersById = {};
  let savedVisible = false;
  let pendingPlace = null;
  let placeFilter = 'all';
  let placeDecisionSaving = false;
  let mapTimeout;
  let previousFocus;
  let selectedTodayDay = model.dayIndexForToday(data);
  if (selectedTodayDay < 0) {
    const remembered = Number(sessionStorage.getItem('trek-selected-day'));
    selectedTodayDay = Number.isInteger(remembered) && remembered >= 0 && remembered < data.days.length ? remembered : 0;
  }
  let routeDayIndex = model.dayIndexForToday(data);
  let todayRouteVisible = routeDayIndex >= 0;
  if (routeDayIndex < 0) routeDayIndex = selectedTodayDay;

  const placeStatuses = {
    must: { label:'必去', icon:'star', marker:'star' },
    route: { label:'顺路', icon:'route', marker:'route' },
    optional: { label:'备选', icon:'circle-dashed', marker:'circle-dashed' },
    drop: { label:'已放弃', icon:'circle-off', marker:'circle-off' }
  };

  const status = (value) => `<span class="status status-${model.getStatusClass(value)}">${icon(model.getStatusIcon(value))}${model.getStatusLabel(value)}</span>`;
  const legTime = (leg) => `${escape(leg.dep)} → ${leg.nextDay?'次日 ':''}${escape(leg.arr)}`;
  const miniLeg = (leg) => leg ? `<button class="traffic-mini" data-leg="${escape(leg.id)}" title="${escape(leg.from)} → ${escape(leg.to)} · ${escape(leg.code)} ${legTime(leg)}">${icon(glyph[leg.mode] || 'route')}<strong>${escape(leg.code)}</strong><span>${legTime(leg)}</span></button>` : '';
  const hotelLink = (c) => googleMapsLink(model.hotelForCity(c,data)?.mapQuery || c.hotel);
  const googleMapsLink = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const linkedPlaces = (item,dayIndex) => model.linkedPlaces(data,item,dayIndex);
  const resolveTodoLeg = (item,dayIndex) => model.resolveLeg(data,item,dayIndex);
  let todoSaving = false;
  let selectedTodoDay = selectedTodayDay;
  let selectedTodoItem = 0;
  let timelineDrag = null;
  let timelineResize = null;
  let timelinePress = null;
  let openTodoPopup = null;
  let packingSaving = false;
  let selectedPackingBag = 0;
  let packingShowPendingOnly = false;
  let packingDrag = null;

  function renderCities() {
    $('#city-list').innerHTML = `<button class="city-stop overview-stop" data-city-overview aria-pressed="${selected===null}"><span class="stop-number">${icon('route')}</span><span><span class="stop-name">行程总览</span><span class="stop-meta">6 城 · 完整路线</span></span>${icon('chevron-right')}</button>` + data.cities.map((c,i)=>`<button class="city-stop" data-city="${c.id}" aria-pressed="${c.id===selected}" style="--stop-color:${c.color}"><span class="stop-number">${String(i+1).padStart(2,'0')}</span><span><span class="stop-name">${c.name}</span><span class="stop-meta">${c.dates} · ${c.nights} 晚</span></span>${icon('chevron-right')}</button>`).join('');
  }

  function placeCategory(place) {
    const value = `${place.name} ${place.note || ''}`.toLowerCase();
    if (/hotel|villas|apart|mercure|kosh havuz|住宿|酒店|民宿/.test(value)) return ['住宿','bed-double'];
    if (/airport|机场|station|stantsiya|火车站/.test(value)) return ['交通','train-front'];
    if (/restaurant|cafe|coffee|pizza|plov|osh|somsa|teahouse|bistro|gelato|抓饭|餐厅|烤包子|牛排|烤肉|烤鱼|冰激淋/.test(value)) return ['餐饮','utensils'];
    if (/museum|mosque|madrasah|palace|fortress|observatory|necropolis|cemetery|minaret|cathedral|monument|complex|registan|civilization|theater|theatre|statue|ark|现代主义|陵墓|清真寺|博物馆|天文台|教堂|剧院|雕像|宫|塔|古城/.test(value)) return ['人文','landmark'];
    if (/bozor|bazar|market|workshop|jewelry|handicraft|kanishka|ucell|7saber|集市|商店|纪念品|手工/.test(value)) return ['购物','shopping-bag'];
    return ['休闲','map-pin'];
  }

  function placeIntroduction(place, city) {
    const [category] = placeCategory(place);
    const isHotel = normalizePlaceName(place.name).includes(normalizePlaceName(city.hotel)) || normalizePlaceName(city.hotel).includes(normalizePlaceName(place.name));
    const descriptions = {
      '住宿': isHotel ? `本次${city.name}的住宿地点，是每日出发、返程与距离判断的基准点。` : `位于${city.name}的住宿备选，可用于比较位置、交通和周边游览便利度。`,
      '交通': `${city.name}行程中的交通节点，适合提前核对接驳方式、出发时间与行李安排。`,
      '餐饮': `${city.name}的餐饮收藏点，可根据附近景点和当天节奏安排正餐、咖啡或短暂休息。`,
      '人文': `${city.name}的人文参观点，适合纳入同区域步行线路，并在出发前核对开放安排。`,
      '购物': `${city.name}的购物与生活体验点，可用于采购补给、逛市集或寻找本地纪念品。`,
      '休闲': `${city.name}的休闲或实用停靠点，可作为主线行程之间的弹性补充。`
    };
    return descriptions[category];
  }

  function normalizePlaceName(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g,'');
  }

  function placeDuration(place) {
    const [category] = placeCategory(place);
    const value = `${place.name} ${place.note || ''}`.toLowerCase();
    if (category === '住宿') return '住宿节点';
    if (category === '交通') return '按交通时间';
    if (/museum|博物馆|艺术馆/.test(value)) return '1.5–3 小时';
    if (/palace|fortress|ark|registan|complex|陵墓|古城|宫/.test(value)) return '1–2 小时';
    if (/mosque|madrasah|cathedral|monument|minaret|清真寺|教堂|塔/.test(value)) return '30–60 分钟';
    if (category === '餐饮') return /coffee|cafe|gelato|冰激淋/.test(value) ? '30–60 分钟' : '1–1.5 小时';
    if (category === '购物') return '30–90 分钟';
    return '30–90 分钟';
  }

  function placeVisitAdvice(place) {
    const note = String(place.note || '').toLowerCase();
    if (/预约|提前.*订|提前.*约/.test(note)) return '原备注提示需要提前预约或订位。';
    if (/交通不便|司机等|返程/.test(note)) return '交通便利度需提前确认，并安排好返程。';
    if (/\d{1,2}[:.]\d{2}|\d{1,2}\s*(am|pm)|只在|only|开放时间|表演|灯光秀/.test(note)) return '原备注包含时段信息，出发前请再次核对。';
    if (/free|免费/.test(note)) return '原备注标为免费，现场政策仍建议复核。';
    return '尚无明确预约信息，出发前通过 Google Maps 核对营业状态。';
  }

  function haversineKm(a,b) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(b.lat-a.lat), dLon = radians(b.lon-a.lon);
    const lat1 = radians(a.lat), lat2 = radians(b.lat);
    const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }

  function hotelRelation(place,city) {
    const hotelName = normalizePlaceName(city.hotel);
    const hotel = data.savedPlaces.find(item => item.cityId === city.id && (normalizePlaceName(item.name).includes(hotelName) || hotelName.includes(normalizePlaceName(item.name))));
    if (!hotel) return `与 ${city.hotel} 的距离尚待确认`;
    const distance = haversineKm({lat:hotel.lat,lon:hotel.lon},{lat:place.lat,lon:place.lon});
    if (distance < .05) return `即本次住宿：${city.hotel}`;
    const movement = distance <= 1.2 ? '通常可结合步行' : distance <= 4 ? '适合短途打车' : '建议预留车辆与往返时间';
    return `距 ${city.hotel} 直线约 ${distance < 1 ? distance.toFixed(1) : distance.toFixed(1)} km · ${movement}`;
  }

  function scheduledItems(placeId) {
    return (data.todoDays || []).flatMap((day,dayIndex) => (day.items || []).flatMap((item,itemIndex) =>
      linkedPlaces(item,dayIndex).some(place => place.id === placeId) ? [{day,dayIndex,item,itemIndex}] : []
    ));
  }

  function scheduledRelation(place) {
    const entries = scheduledItems(place.id);
    return entries.length ? `已安排：${entries.map(entry => `${entry.day.date} ${entry.item.time || '时间待定'}`).join('、')}` : '尚未加入精确待办，可从本卡片直接安排。';
  }

  function placeMapsQuery(place) {
    const city = cityById[place.cityId];
    return [place.name,city?.name,city?.country].filter(Boolean).join(' · ');
  }

  function placeMapsLink(place) {
    if (place.googleMapsUrl) return place.googleMapsUrl;
    return googleMapsLink(placeMapsQuery(place));
  }

  function placeDecision(placeId) {
    return data.placeDecisions?.[placeId] || { status:'', pinned:false };
  }

  function placeStatusOptions(selectedStatus) {
    return `<option value="">未设置</option>` + Object.entries(placeStatuses).map(([value,item]) => `<option value="${value}" ${value===selectedStatus?'selected':''}>${item.label}</option>`).join('');
  }

  function placeMarkerHtml(place) {
    const city = cityById[place.cityId];
    const decision = placeDecision(place.id);
    const statusIcon = placeStatuses[decision.status]?.marker || 'map-pin';
    return `<div class="saved-pin place-status-${decision.status || 'unset'} ${decision.pinned?'is-pinned':''}" style="--pin-color:${city?.color||'#206b5c'}">${icon(decision.pinned?'pin':statusIcon)}</div>`;
  }

  function placePopupHtml(place) {
    const decision = placeDecision(place.id);
    const statusText = placeStatuses[decision.status]?.label || '未设置';
    const scheduled = scheduledItems(place.id);
    return `<h3>${escape(place.name)}</h3><p class="popup-decision">行程状态：${escape(statusText)}${decision.pinned?' · 已置顶':''}</p><p>${escape(place.note||'原收藏清单未填写备注。')}</p>${scheduled.map(entry => `<button type="button" data-jump-todo-day="${entry.dayIndex}" data-jump-todo-item="${entry.itemIndex}">查看 ${escape(entry.day.date)} 行程</button>`).join('')}<a href="${placeMapsLink(place)}" target="_blank" rel="noopener">在 Google Maps 打开</a>`;
  }

  function updatePlaceMarker(placeId) {
    const place = data.savedPlaces.find(item => item.id === placeId);
    const marker = savedMarkersById[placeId];
    if (!place || !marker || !window.L) return;
    marker.setIcon(L.divIcon({className:'saved-place-marker',html:placeMarkerHtml(place),iconSize:[24,24],iconAnchor:[12,12]}));
    marker.setPopupContent(placePopupHtml(place));
    refreshIcons();
  }

  async function updatePlaceDecision(placeId, changes) {
    if (!cloud?.state().editor) {
      renderCityDetail();
      openLogin();
      return;
    }
    if (placeDecisionSaving) return;
    const previous = copy(placeDecision(placeId));
    data.placeDecisions ||= {};
    data.placeDecisions[placeId] = { ...previous, ...changes };
    if (!data.placeDecisions[placeId].status && !data.placeDecisions[placeId].pinned) delete data.placeDecisions[placeId];
    placeDecisionSaving = true;
    renderCityDetail();
    updatePlaceMarker(placeId);
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      const current = placeDecision(placeId);
      const message = changes.pinned !== undefined
        ? (current.pinned ? '地点已置顶并同步。' : '已取消置顶并同步。')
        : `已设为“${placeStatuses[current.status]?.label || '未设置'}”并同步。`;
      showStatus(message);
    } catch (error) {
      if (!previous.status && !previous.pinned) delete data.placeDecisions[placeId];
      else data.placeDecisions[placeId] = previous;
      updatePlaceMarker(placeId);
      showStatus(error.message || '地点状态保存失败，请稍后重试。');
    } finally {
      placeDecisionSaving = false;
      renderCityDetail();
    }
  }

  function renderCityDetail() {
    if (!selected) {
      $('#city-detail').innerHTML = `<div class="route-overview-detail"><div><p class="detail-eyebrow">UZBEKISTAN × KAZAKHSTAN / 2026</p><div class="detail-title-row"><h2>双国六城路线</h2><span>塔什干 → 阿克套</span></div><p class="overview-copy">从乌兹别克斯坦的丝路古城一路向西，最终抵达哈萨克斯坦阿克套的里海岸边。选择城市后可查看当地全部收藏地点。</p></div><div class="overview-city-links">${data.cities.map((c,i)=>`<button type="button" data-city="${c.id}"><span>${String(i+1).padStart(2,'0')}</span>${escape(c.name)}${icon('arrow-right')}</button>`).join('')}</div></div>`;
      refreshIcons();
      return;
    }
    const c = cityById[selected];
    const next = data.legs.find(l=>l.map?.[0]===c.id);
    const cityPlaces = data.savedPlaces.filter(p=>p.cityId===c.id);
    const decisionCounts = Object.fromEntries(Object.keys(placeStatuses).map(status => [status,cityPlaces.filter(place => placeDecision(place.id).status===status).length]));
    const pinnedCount = cityPlaces.filter(place => placeDecision(place.id).pinned).length;
    const localPlaces = cityPlaces
      .filter(place => placeFilter==='all' || (placeFilter==='pinned' ? placeDecision(place.id).pinned : placeDecision(place.id).status===placeFilter))
      .sort((a,b) => Number(placeDecision(b.id).pinned)-Number(placeDecision(a.id).pinned));
    const side = c.id==='samarkand'
      ? `<figure class="city-photo"><img src="${photo.src}" width="1280" height="720" alt="撒马尔罕雷吉斯坦广场的三座经学院"><figcaption><a href="${photo.page}" target="_blank" rel="noopener">Ekrem Canli / Wikimedia Commons</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a> · 已裁切</figcaption></figure>`
      : `<div class="detail-side"><p><strong>${next?'下一程':'返程'}</strong><br>${next?escape(next.from)+' → '+escape(next.to):'阿克套 → 奇姆肯特 → 上海'}</p><small>${next?escape(next.date)+' · '+escape(next.code)+'<br>'+legTime(next):'10.05 · DV710 + DV461<br>10.06 04:55 抵达上海'}</small></div>`;
    const placeCards = localPlaces.map((p,index) => {
      const [category,categoryIcon] = placeCategory(p);
      const decision = placeDecision(p.id);
      const statusItem = placeStatuses[decision.status];
      const scheduled = scheduledItems(p.id);
      return `<article class="saved-place-card ${statusItem?`has-place-status status-${decision.status}`:''} ${decision.pinned?'is-pinned':''}" data-place-card="${p.id}"><div class="place-card-top"><span class="place-index">${String(index+1).padStart(2,'0')}</span><span class="place-category">${icon(categoryIcon)}${category}</span><button type="button" class="place-pin-button" data-place-pin="${p.id}" aria-pressed="${Boolean(decision.pinned)}" title="${decision.pinned?'取消置顶':'置顶地点'}">${icon(decision.pinned?'pin-off':'pin')}<span>${decision.pinned?'已置顶':'置顶'}</span></button></div><h3>${escape(p.name)}</h3><div class="place-decision-row"><label><span>行程状态</span><select data-place-status="${p.id}" aria-label="${escape(p.name)}的行程状态" ${placeDecisionSaving?'disabled':''}>${placeStatusOptions(decision.status)}</select></label>${statusItem?`<span class="place-status-badge status-${decision.status}">${icon(statusItem.icon)}${statusItem.label}</span>`:'<span class="place-status-badge status-unset">未设置</span>'}</div>${scheduled.length?`<div class="place-scheduled">${scheduled.map(entry => `<button type="button" data-jump-todo-day="${entry.dayIndex}" data-jump-todo-item="${entry.itemIndex}">${icon('calendar-check')}已安排 ${escape(entry.day.date)}</button>`).join('')}</div>`:''}<p class="place-intro">${escape(placeIntroduction(p,c))}</p><dl class="place-facts"><div><dt>建议停留</dt><dd>${escape(placeDuration(p))}</dd></div><div><dt>行前提示</dt><dd>${escape(placeVisitAdvice(p))}</dd></div><div><dt>位置关系</dt><dd>${escape(hotelRelation(p,c))}</dd></div><div><dt>当前行程</dt><dd>${escape(scheduledRelation(p))}</dd></div></dl><div class="place-note"><strong>原备注</strong><p>${escape(p.note || '原收藏清单未填写备注。')}</p></div><div class="place-card-actions"><button type="button" data-focus-place="${p.id}">${icon('locate-fixed')}地图定位</button><button type="button" data-schedule-place="${p.id}">${icon('calendar-plus')}安排</button><a href="${placeMapsLink(p)}" target="_blank" rel="noopener">${icon('map-pin')}Google Maps${icon('arrow-up-right')}</a></div></article>`;
    }).join('');
    const filterButton = (value,label,count,filterIcon) => `<button type="button" data-place-filter="${value}" aria-pressed="${placeFilter===value}">${filterIcon?icon(filterIcon):''}<span>${label}</span><b>${count}</b></button>`;
    const quickFilters = filterButton('all','全部',cityPlaces.length,'layout-grid') + Object.entries(placeStatuses).map(([value,item]) => filterButton(value,item.label,decisionCounts[value],item.icon)).join('') + filterButton('pinned','置顶',pinnedCount,'pin');
    const emptyState = `<div class="place-filter-empty">当前筛选没有地点。<button type="button" data-place-filter="all">查看全部收藏</button></div>`;
    $('#city-detail').innerHTML = `<div class="city-overview-grid"><div><p class="detail-eyebrow">${c.en} / ${c.country}</p><div class="detail-title-row"><h2>${c.name}</h2><span>${c.theme}</span></div><div class="highlights">${c.highlights.map(h=>`<span>${escape(h)}</span>`).join('')}</div><a class="hotel-line" href="${hotelLink(c)}" target="_blank" rel="noopener">${icon('bed-double')}${escape(c.hotel)}</a><div class="day-links">${c.dayIds.map(i=>`<button data-day="${i}">${data.days[i].date} ${data.days[i].week}${icon('arrow-up-right')}</button>`).join('')}</div></div>${side}</div><section class="saved-places-section"><div class="saved-summary"><div><strong>已收藏 ${cityPlaces.length} 个地点</strong><span>${placeFilter==='all'?'用状态和置顶辅助现场决策':`当前显示 ${localPlaces.length} 个`}</span></div><button id="show-saved" type="button">${icon(savedVisible?'map-pin-off':'map-pin')}${savedVisible?'隐藏地图标记':'显示地图标记'}</button></div><nav class="place-quick-filters" aria-label="收藏地点快捷筛选">${quickFilters}</nav><div class="saved-places-grid">${placeCards || emptyState}</div></section>`;
    refreshIcons();
  }

  function selectCity(id, move = true) {
    if (!cityById[id]) return;
    selected = id;
    savedVisible = true;
    todayRouteVisible = false;
    renderCities();
    renderCityDetail();
    renderRouteDaySelect();
    if (move && map) applyMapMode();
  }

  function showOverview() {
    selected = null;
    savedVisible = false;
    todayRouteVisible = false;
    renderCities();
    renderCityDetail();
    renderRouteDaySelect();
    applyMapMode();
  }

  function legDetail(l) {
    if (!l) return '<p>交通资料暂不可用。</p>';
    return `<section class="dialog-leg"><h3>${icon(glyph[l.mode] || 'route')}${escape(l.code)} ${status(l)}</h3><div class="leg-stations"><div><time>${escape(l.dep)}</time><span>${escape(l.from)}</span><small>${escape(l.originalFrom||'')}</small></div>${icon('arrow-right')}<div><time>${escape(l.arr)}</time><span>${escape(l.to)}</span><small>${l.nextDay?'次日抵达':escape(l.originalTo||'')}</small></div></div>${leaveReminder(l)}<p class="leg-note">${escape(l.date)}${l.duration?' · '+escape(l.duration):''}${l.who?' · '+escape(l.who):''}</p>${l.note?`<p class="leg-note">${escape(l.note)}</p>`:''}<div class="leg-map-links"><a href="${googleMapsLink(l.originMapQuery || l.from)}" target="_blank" rel="noopener">${icon('map-pin')}出发地地图</a><a href="${googleMapsLink(l.destinationMapQuery || l.to)}" target="_blank" rel="noopener">${icon('map-pin')}目的地地图</a></div></section>`;
  }

  function leaveReminder(leg) {
    if (!leg?.leaveHotelTime && !leg?.arriveTerminalTime) return '';
    return `<div class="leave-reminder"><strong>${icon('alarm-clock')}出发提醒</strong>${leg.leaveHotelTime?`<span>离开酒店 <b>${escape(leg.leaveHotelTime)}</b></span>`:''}${leg.arriveTerminalTime?`<span>到站 / 机场 <b>${escape(leg.arriveTerminalTime)}</b></span>`:''}<span>${escape(leg.mode === 'rail' ? '火车' : leg.mode === 'flight' ? '航班' : '转场')} <b>${escape(leg.dep)}</b></span></div>`;
  }

  function openDialog(title, body, context=null) {
    previousFocus = document.activeElement;
    openTodoPopup = context;
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = body;
    refreshIcons();
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  }
  function openDay(index) {
    const d = data.days[index];
    openDialog(`${d.date} ${d.week} · Day ${index+1}`, `<p class="dialog-subtitle">${escape(d.city)}</p>${[['上午',d.am],['下午',d.pm],['晚上',d.night]].map(([k,v])=>`<div class="day-period"><span>${k}</span><p>${escape(v)}</p></div>`).join('')}<p class="leg-note">${escape(d.note)}</p><p class="dialog-hotel">${icon('bed-double')} ${escape(d.hotel)}</p>${(d.legs || []).map(id=>legDetail(legById[id])).join('')}`);
  }

  function renderCalendar() {
    const cell = (text,cls='') => `<td><div class="cell-content"><span class="${cls}" title="${escape(text)}">${escape(text)}</span></div></td>`;
    const cityCell = (d) => `<td><div class="cell-content city-cell"><span class="city-cell-name" title="${escape(d.city)}">${escape(d.city)}</span>${d.local?`<span class="local-move">${escape(d.local)}</span>`:''}${d.legs?.length?`<details class="traffic-details"><summary title="展开交通详情" aria-label="展开交通详情">${icon('route')}<span>${d.legs.length} 段交通</span></summary><div class="traffic-detail-list">${d.legs.map(id=>miniLeg(legById[id])).join('')}</div></details>`:''}</div></td>`;
    $('#calendar-body').innerHTML = data.days.map((d,i)=>`<tr><td><button class="date-button" data-day="${i}" title="查看 ${d.date} 完整日程"><strong>${d.date}</strong><small>${d.week} · Day ${i+1}</small><span>查看详情</span></button></td>${cityCell(d)}${cell(d.hotel)}${cell(d.am)}${cell(d.pm)}${cell(d.night)}${cell(d.note,'cell-note')}</tr>`).join('');
    $('#calendar-cards').innerHTML = data.days.map((day,index) => {
      const legCards = (day.legs || []).map(id => {
        const leg = legById[id];
        return leg ? `<button type="button" class="calendar-mobile-leg" data-leg="${escape(id)}">${icon(glyph[leg.mode] || 'route')}<span><b>${escape(leg.code)}</b> ${escape(leg.from)} → ${escape(leg.to)}</span><time>${legTime(leg)}</time>${status(leg)}</button>` : '';
      }).join('');
      const period = (label,value) => `<div class="calendar-mobile-period"><dt>${label}</dt><dd>${escape(value || '—')}</dd></div>`;
      return `<article class="calendar-day-card ${model.dateKey(day.date)===model.todayKey()?'is-today':''}"><header><div><span>DAY ${String(index+1).padStart(2,'0')}</span><h3>${escape(day.date)} <small>${escape(day.week)}</small></h3></div><strong>${escape(day.city)}</strong></header><dl>${period('上午',day.am)}${period('下午',day.pm)}${period('晚上 / 日落',day.night)}</dl>${legCards?`<section class="calendar-mobile-transport"><h4>TRANSPORT / 交通</h4>${legCards}</section>`:''}<div class="calendar-mobile-hotel">${icon('bed-double')}<span>${escape(day.hotel || '—')}</span></div>${day.note?`<p class="calendar-mobile-note">${escape(day.note)}</p>`:''}<button type="button" class="calendar-todo-link" data-jump-todo-day="${index}">查看当天待办 ${icon('arrow-right')}</button></article>`;
    }).join('');
    refreshIcons();
  }

  function renderTravel() {
    $('#transport-list').innerHTML = data.legs.map(l=>`<article class="travel-leg mode-${escape(l.mode)}"><header><span>${escape(l.date)} · ${escape(l.mode==='flight'?'航班':l.mode==='rail'?'火车':'公路')}</span>${status(l)}</header><button type="button" class="travel-leg-main" data-leg="${escape(l.id)}"><span class="travel-leg-code">${icon(glyph[l.mode] || 'route')}${escape(l.code)}</span><span class="travel-leg-points"><span><small>出发</small><b>${escape(l.dep)}</b>${escape(l.from)}</span>${icon('arrow-right')}<span><small>抵达</small><b>${l.nextDay?'次日 ':''}${escape(l.arr)}</b>${escape(l.to)}</span></span>${l.duration?`<small>${escape(l.duration)}</small>`:''}</button>${leaveReminder(l)}<div class="travel-leg-links"><a href="${googleMapsLink(l.originMapQuery || l.from)}" target="_blank" rel="noopener">${icon('map-pin')}出发地</a><a href="${googleMapsLink(l.destinationMapQuery || l.to)}" target="_blank" rel="noopener">${icon('map-pin')}目的地</a></div></article>`).join('');
    $('#hotel-list').innerHTML = data.cities.map((city,index)=>{
      const hotel = model.hotelForCity(city,data);
      return `<article class="travel-hotel"><span class="number">0${index+1}</span><div><h4>${escape(hotel.displayName)}</h4><p>${escape(city.name)} · ${escape(hotel.checkIn)} 入住 → ${escape(hotel.checkOut || '待确认')} 退房</p><dl><div><dt>住宿</dt><dd>${hotel.nights} 晚</dd></div><div><dt>早餐</dt><dd>${escape(hotel.breakfast)}</dd></div></dl><a href="${googleMapsLink(hotel.mapQuery)}" target="_blank" rel="noopener">${icon('map-pin')}Google Maps${icon('arrow-up-right')}</a></div></article>`;
    }).join('');
    refreshIcons();
  }

  function effectiveTodoTime(item,dayIndex) {
    const leg = resolveTodoLeg(item,dayIndex);
    return leg && /^\d{1,2}:\d{2}$/.test(leg.dep) && /^\d{1,2}:\d{2}$/.test(leg.arr)
      ? `${leg.dep}–${leg.nextDay?'次日 ':''}${leg.arr}` : item.time || '';
  }

  function displayTodoTitle(item,dayIndex) {
    const leg = resolveTodoLeg(item,dayIndex);
    return leg && leg.mode !== 'road' ? `${leg.from} → ${leg.to} · ${leg.code}` : item.title;
  }

  function todoClockState(item,dayIndex) {
    if (item.done) return 'done';
    if (model.dateKey(data.days?.[dayIndex]?.date) !== model.todayKey()) return '';
    const time = parseTimelineTime(effectiveTodoTime(item,dayIndex));
    if (!time) return '';
    const now = new Date();
    const minutes = now.getHours()*60+now.getMinutes();
    return minutes < time.start ? 'future' : minutes < time.end ? 'current' : 'past';
  }

  function renderToday() {
    const day = data.days?.[selectedTodayDay];
    const todoDay = data.todoDays?.[selectedTodayDay];
    if (!day || !todoDay) return;
    const actualToday = model.dayIndexForToday(data) === selectedTodayDay;
    const entries = (todoDay.items || []).map((item,itemIndex) => ({item,itemIndex,time:parseTimelineTime(effectiveTodoTime(item,selectedTodayDay))}));
    const ordered = entries.filter(entry => entry.time).sort((a,b) => a.time.start-b.time.start);
    const current = actualToday ? ordered.find(entry => todoClockState(entry.item,selectedTodayDay)==='current') : null;
    const upcoming = ordered.filter(entry => !entry.item.done && (!actualToday || todoClockState(entry.item,selectedTodayDay)==='future'));
    const next = upcoming[0] || null;
    const later = upcoming.slice(1,4);
    const hotel = day.hotel && day.hotel !== '—' && day.hotel !== '机上' ? model.hotelForCity(cityById[day.cityId],data) : null;
    const movement = (day.legs || []).map(id => legById[id]).filter(Boolean);
    const nextFocus = current || next;
    const nextPlace = nextFocus && linkedPlaces(nextFocus.item,selectedTodayDay)[0];
    const nextLeg = nextFocus && resolveTodoLeg(nextFocus.item,selectedTodayDay);
    const nextMapQuery = nextFocus?.item.maps?.[0]?.[1] || nextLeg?.originMapQuery || nextLeg?.from;
    const nextMap = nextPlace ? `<button type="button" class="today-next-map" data-todo-map-place="${escape(nextPlace.id)}">${icon('locate-fixed')}地图上查看下一站</button>` : nextMapQuery ? `<a class="today-next-map" href="${googleMapsLink(nextMapQuery)}" target="_blank" rel="noopener">${icon('map-pin')}导航到下一站</a>` : '';
    const eventLine = (entry,label) => entry ? `<button type="button" class="today-event" data-jump-todo-day="${selectedTodayDay}" data-jump-todo-item="${entry.itemIndex}"><span>${label}</span><time>${escape(effectiveTodoTime(entry.item,selectedTodayDay))}</time><strong>${escape(displayTodoTitle(entry.item,selectedTodayDay))}</strong>${status(resolveTodoLeg(entry.item,selectedTodayDay) || entry.item)}${icon('chevron-right')}</button>` : '';
    $('#today-content').innerHTML = `<div class="today-heading"><div><p class="eyebrow">TREK / TODAY</p><h2>${escape(day.date)} <small>${escape(day.week)}</small></h2><p>${escape(day.city)}</p></div><label>日期<select id="today-day-select" aria-label="选择行程日期">${data.days.map((entry,index)=>`<option value="${index}" ${index===selectedTodayDay?'selected':''}>${escape(entry.date)} ${escape(entry.week)} · ${escape(entry.city)}</option>`).join('')}</select></label></div>${!actualToday?'<p class="today-preview">所选日期的行程预览</p>':''}<div class="today-core"><section class="today-where"><h3>今晚住哪</h3>${hotel?`<strong>${escape(hotel.displayName)}</strong><a href="${googleMapsLink(hotel.mapQuery)}" target="_blank" rel="noopener">${icon('map-pin')}打开酒店地图</a>`:`<strong>${escape(day.hotel || '—')}</strong>`}</section><section class="today-next"><h3>${current?'正在进行':'下一件事'}</h3>${eventLine(current || next,current?'NOW':'NEXT') || '<p>今天没有更多固定时间的事项。</p>'}${nextMap}</section></div>${current&&next?`<section class="today-upcoming"><h3>接下来</h3>${eventLine(next,'NEXT')}${later.slice(0,2).map(entry=>eventLine(entry,'LATER')).join('')}</section>`:later.length?`<section class="today-upcoming"><h3>接下来</h3>${later.map(entry=>eventLine(entry,'LATER')).join('')}</section>`:''}${movement.length?`<section class="today-movement"><h3>当天交通</h3>${movement.map(leg=>`<div class="today-movement-row"><div>${icon(glyph[leg.mode] || 'route')}<strong>${escape(leg.code)}</strong>${status(leg)}</div><p>${escape(leg.from)} → ${escape(leg.to)} · ${legTime(leg)}</p>${leaveReminder(leg)}<button type="button" data-leg="${escape(leg.id)}">查看交通详情 ${icon('arrow-right')}</button></div>`).join('')}</section>`:''}<div class="today-actions"><button type="button" class="primary-button" data-today-route="${selectedTodayDay}">${icon('route')}查看当日路线</button><button type="button" class="secondary-button" data-jump-todo-day="${selectedTodayDay}">${icon('list-checks')}当天待办</button></div>`;
    refreshIcons();
  }

  function packingBagById(bagId) {
    return data.bringLists?.find(bag => bag.id === bagId);
  }

  function normalizePackingData() {
    if (!Array.isArray(data.bringLists)) data.bringLists = copy(baseData.bringLists || []);
    const defaults = baseData.bringLists || [];
    data.bringLists.forEach((bag,index) => {
      const fallback = defaults[index] || {};
      bag.id ||= fallback.id || `bag-${index+1}`;
      bag.name ||= fallback.name || `背包${index+1}`;
      bag.owner = fallback.owner || bag.owner || `旅伴${index+1}`;
      bag.ownerAccount = fallback.ownerAccount || bag.ownerAccount || '';
      if (!Array.isArray(bag.items)) bag.items = [];
    });
  }

  function packingItemKey(label) {
    return String(label || '').toLowerCase().replace(/[（(][^）)]*[）)]/g,'').replace(/[×x*]\s*\d+/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,'');
  }

  function packingDuplicateKeys(bags) {
    const owners = new Map();
    bags.forEach(bag => bag.items.forEach(item => {
      const key = packingItemKey(item.label);
      if (!key) return;
      if (!owners.has(key)) owners.set(key,new Set());
      owners.get(key).add(bag.id);
    }));
    return new Set([...owners].filter(([,bagIds]) => bagIds.size > 1).map(([key]) => key));
  }

  function currentPackingBag() {
    const email = String(cloud?.state().user?.email || '').toLowerCase();
    return data.bringLists?.find(bag => String(bag.ownerAccount || '').toLowerCase() === email) || null;
  }

  function renderPacking() {
    normalizePackingData();
    const bags = data.bringLists;
    const editor = Boolean(cloud?.state().editor);
    const signedInBag = currentPackingBag();
    const duplicateKeys = packingDuplicateKeys(bags);
    selectedPackingBag = Math.max(0,Math.min(selectedPackingBag,bags.length-1));
    const total = bags.reduce((sum,bag) => sum + bag.items.length,0);
    const done = bags.reduce((sum,bag) => sum + bag.items.filter(item => item.done).length,0);
    const sharedItems = bags.flatMap(bag => bag.items.map(item => ({bag,item}))).filter(entry => entry.item.shared);
    const sharedWaiting = sharedItems.filter(({item}) => !item.done || !item.verified).length;
    const duplicateLabels = [...new Map(bags.flatMap(bag => bag.items.map(item => [packingItemKey(item.label),item.label])).filter(([key]) => duplicateKeys.has(key))).values()];
    $('#packing-total').innerHTML = `<strong>${done} / ${total}</strong><span>已装好</span><div class="packing-progress"><i style="width:${total ? done/total*100 : 0}%"></i></div>`;
    $('#packing-checkboard').innerHTML = `<div class="packing-check-intro"><span class="packing-check-icon">${icon('users-round')}</span><div><h3>协作核对</h3><p>共同用品由携带者装包，另一人确认；重复项自动提示。</p></div><button type="button" class="packing-filter-toggle" data-packing-filter-pending aria-pressed="${packingShowPendingOnly}">${icon('list-filter')}<span>${packingShowPendingOnly?'显示全部':'只看待装'}</span></button></div><div class="packing-check-metrics"><span><strong>${sharedItems.length}</strong>共同用品</span><span class="${sharedWaiting?'has-alert':''}"><strong>${sharedWaiting}</strong>待互核</span><span class="${duplicateLabels.length?'has-note':''}"><strong>${duplicateLabels.length}</strong>重复项</span></div>${duplicateLabels.length ? `<div class="packing-duplicates"><span>重复携带</span>${duplicateLabels.map(label => `<b>${escape(label)}</b>`).join('')}</div>` : ''}`;
    const sortedSharedItems = sharedItems.slice().sort((a,b) => Number(a.item.done && a.item.verified)-Number(b.item.done && b.item.verified) || Number(a.item.done)-Number(b.item.done));
    $('#packing-shared-pins').innerHTML = `<header><div><span class="packing-shared-pin-icon">${icon('pin')}</span><div><h3>共同用品</h3><p>置顶查看携带人和核对状态</p></div></div><strong>${sharedItems.filter(({item})=>item.done && item.verified).length}/${sharedItems.length}</strong></header><div class="packing-shared-pin-list">${sortedSharedItems.length ? sortedSharedItems.map(({bag,item}) => {
      const state = item.verified ? ['已互核','verified','badge-check'] : item.done ? ['待旅伴核对','verify','shield-check'] : ['待装','pending','circle'];
      return `<button type="button" class="packing-shared-pin ${state[1]}" data-packing-focus="${escape(item.id)}" data-packing-bag="${escape(bag.id)}"><span class="packing-shared-state">${icon(state[2])}${state[0]}</span><strong>${escape(item.label)}</strong><span class="packing-shared-provider">${escape(bag.owner)} 提供 · ${escape(item.group || '背包里')}</span>${icon('chevron-right')}</button>`;
    }).join('') : `<p class="packing-shared-empty">将物品设为共同用品后，会集中显示在这里。</p>`}</div>`;
    $('#packing-bag-nav').innerHTML = bags.map((bag,index) => `<button type="button" data-packing-bag-index="${index}" aria-pressed="${index===selectedPackingBag}">${icon('backpack')}<span>${escape(bag.owner)} · ${escape(bag.name)}</span><b>${bag.items.filter(item => item.done).length}/${bag.items.length}</b></button>`).join('');
    $('#packing-lists').innerHTML = bags.map((bag,bagIndex) => {
      const bagDone = bag.items.filter(item => item.done).length;
      const groups = [...new Set(['随身','背包里',...bag.items.map(item => item.group).filter(Boolean)])];
      const items = groups.map(group => {
        const groupItems = bag.items.filter(item => item.group === group);
        const visibleItems = packingShowPendingOnly ? groupItems.filter(item => !item.done) : groupItems;
        const groupContent = visibleItems.length ? visibleItems.map(item => {
          const duplicate = duplicateKeys.has(packingItemKey(item.label));
          const peerCanVerify = editor && item.shared && item.done && (!signedInBag || signedInBag.id !== bag.id);
          const sharedState = item.shared ? (item.verified ? '已互核' : item.done ? '待旅伴核对' : '二人共用') : '';
          const badges = `${item.shared?`<span class="packing-item-badge shared ${item.verified?'verified':''}">${icon(item.verified?'badge-check':'users')}${sharedState}</span>`:''}${duplicate?`<span class="packing-item-badge duplicate">${icon('copy')}两边重复</span>`:''}`;
          const verify = peerCanVerify ? `<button type="button" class="packing-verify ${item.verified?'is-verified':''}" data-packing-verify="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" aria-pressed="${Boolean(item.verified)}" title="${item.verified?'取消互核':'确认旅伴已携带'}" ${packingSaving?'disabled':''}>${icon(item.verified?'badge-check':'shield-check')}<span>${item.verified?'已核对':'核对'}</span></button>` : '';
          const dragHandle = editor && !packingShowPendingOnly ? `<button type="button" class="packing-drag-handle" data-packing-drag="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" aria-label="按住拖动 ${escape(item.label)}" title="按住拖动排序" ${packingSaving?'disabled':''}>${icon('grip-vertical')}</button>` : '';
          const nextGroup = item.group === '随身' ? '背包里' : '随身';
          const menu = editor ? `<details class="packing-item-menu"><summary aria-label="管理 ${escape(item.label)}" title="管理物品">${icon('more-horizontal')}</summary><div><button type="button" data-packing-edit="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" ${packingSaving?'disabled':''}>${icon('pencil-line')}修改名称</button><button type="button" data-packing-group="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" data-packing-group-target="${escape(nextGroup)}" ${packingSaving?'disabled':''}>${icon(item.group==='随身'?'backpack':'hand')}移到${escape(nextGroup)}</button><button type="button" data-packing-shared="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" aria-pressed="${Boolean(item.shared)}" ${packingSaving?'disabled':''}>${icon('users')}${item.shared?'改为个人用品':'设为共同用品'}</button><button type="button" data-packing-move="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" ${packingSaving?'disabled':''}>${icon('arrow-right-left')}移给另一人</button><button type="button" class="is-danger" data-packing-delete="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" ${packingSaving?'disabled':''}>${icon('trash-2')}删除</button></div></details>` : '';
          return `<div class="packing-item ${item.done?'is-done':''} ${item.shared?'is-shared':''}" data-packing-item="${escape(item.id)}" data-packing-item-bag="${escape(bag.id)}" data-packing-item-group="${escape(group)}"><button type="button" class="packing-check" data-packing-toggle="${escape(item.id)}" data-packing-bag="${escape(bag.id)}" aria-pressed="${Boolean(item.done)}" title="${editor?'切换装包状态':'登录后更新状态'}" ${packingSaving?'disabled':''}>${icon(item.done?'circle-check-big':'circle')}</button><div class="packing-item-copy"><span>${escape(item.label)}</span>${badges?`<small>${badges}</small>`:''}</div>${verify||dragHandle||menu?`<div class="packing-row-actions">${verify}${dragHandle}${menu}</div>`:''}</div>`;
        }).join('') : `<div class="packing-group-empty">${icon(group==='随身'?'hand':'backpack')}<span>${packingShowPendingOnly && groupItems.length?'本组已全部装好':`暂无${escape(group)}物品`}</span></div>`;
        return `<section class="packing-group"><header><h4>${escape(group)}</h4><span>${groupItems.filter(item => item.done).length}/${groupItems.length}</span></header><div>${groupContent}</div></section>`;
      }).join('');
      const addForm = editor ? `<form class="packing-add" data-packing-add="${escape(bag.id)}"><label><span>分类</span><select name="group"><option>随身</option><option>背包里</option></select></label><label class="packing-add-name"><span>新增物品</span><input name="label" maxlength="80" placeholder="输入物品名称" required></label><button type="submit" class="secondary-button" ${packingSaving?'disabled':''}>${icon('plus')}添加</button></form>` : `<button type="button" class="packing-login secondary-button" data-packing-login>${icon('log-in')}登录后编辑清单</button>`;
      return `<article class="packing-bag ${bagIndex===selectedPackingBag?'is-active':''}" data-packing-bag-panel="${bagIndex}"><header class="packing-bag-header"><div><span class="packing-bag-icon">${icon('backpack')}</span><div><h3>${escape(bag.owner)} <span>${escape(bag.name)}</span></h3><p>${bag.items.length} 件 · ${bag.items.filter(item => item.group==='随身').length} 件随身</p></div></div><strong>${bagDone}/${bag.items.length || 0}</strong></header>${items}${addForm}</article>`;
    }).join('');
    refreshIcons();
  }

  async function persistPacking(revert,message) {
    packingSaving = true;
    renderPacking();
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      showStatus(message);
    } catch (error) {
      revert();
      showStatus(error.message || '行李清单保存失败，已恢复原状态。');
    } finally {
      packingSaving = false;
      renderPacking();
    }
  }

  function togglePackingItem(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === button.dataset.packingToggle);
    if (!item) return;
    const previous = { done:Boolean(item.done), verified:Boolean(item.verified), verifiedBy:item.verifiedBy || '' };
    item.done = !previous.done;
    if (!item.done) {
      item.verified = false;
      item.verifiedBy = '';
    }
    persistPacking(() => { Object.assign(item,previous); },item.done ? `${item.label} 已装好。` : `${item.label} 已恢复为待装。`);
  }

  function focusPackingItem(button) {
    const bagIndex = data.bringLists.findIndex(bag => bag.id === button.dataset.packingBag);
    if (bagIndex < 0) return;
    selectedPackingBag = bagIndex;
    packingShowPendingOnly = false;
    renderPacking();
    requestAnimationFrame(() => {
      const item = document.querySelector(`[data-packing-item="${CSS.escape(button.dataset.packingFocus)}"]`);
      if (!item) return;
      item.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
      item.classList.add('is-focused');
      setTimeout(() => item.classList.remove('is-focused'),1600);
    });
  }

  function openPackingItemEditor(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === button.dataset.packingEdit);
    if (!bag || !item) return;
    openDialog('编辑行李物品', `<form class="packing-item-editor" data-packing-edit-form="${escape(item.id)}" data-packing-bag="${escape(bag.id)}"><p>${escape(bag.owner)} · ${escape(bag.name)} · ${escape(item.group || '背包里')}</p><label><span>物品名称</span><input name="label" data-packing-edit-label maxlength="80" value="${escape(item.label)}" autocomplete="off" required></label><button type="submit" class="primary-button">${icon('save')}保存修改</button></form>`);
    requestAnimationFrame(() => {
      const input = $('[data-packing-edit-label]');
      input?.focus();
      input?.select();
    });
  }

  function savePackingItemEdit(form) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(form.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === form.dataset.packingEditForm);
    const label = new FormData(form).get('label')?.trim();
    if (!bag || !item || !label) return;
    if (label === item.label) {
      $('#detail-dialog').close();
      return;
    }
    const previous = item.label;
    item.label = label;
    $('#detail-dialog').close();
    persistPacking(() => { item.label = previous; },`${previous} 已修改为 ${label}。`);
  }

  function movePackingItem(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const source = packingBagById(button.dataset.packingBag);
    const destination = data.bringLists.find(bag => bag.id !== source?.id);
    const itemIndex = source?.items.findIndex(item => item.id === button.dataset.packingMove) ?? -1;
    if (!source || !destination || itemIndex < 0) return;
    const [item] = source.items.splice(itemIndex,1);
    const previousVerification = { verified:Boolean(item.verified), verifiedBy:item.verifiedBy || '' };
    item.verified = false;
    item.verifiedBy = '';
    destination.items.push(item);
    persistPacking(() => {
      const movedIndex = destination.items.findIndex(entry => entry.id === item.id);
      if (movedIndex >= 0) destination.items.splice(movedIndex,1);
      Object.assign(item,previousVerification);
      source.items.splice(itemIndex,0,item);
    },`${item.label} 已交给${destination.owner}携带。`);
  }

  function changePackingGroup(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === button.dataset.packingGroup);
    const target = button.dataset.packingGroupTarget;
    if (!bag || !item || !['随身','背包里'].includes(target) || item.group === target) return;
    const previousGroup = item.group;
    const previousIndex = bag.items.indexOf(item);
    item.group = target;
    bag.items.splice(previousIndex,1);
    const targetIndexes = bag.items.map((entry,index) => entry.group === target ? index : -1).filter(index => index >= 0);
    bag.items.splice(targetIndexes.length ? targetIndexes.at(-1)+1 : bag.items.length,0,item);
    persistPacking(() => {
      const currentIndex = bag.items.indexOf(item);
      if (currentIndex >= 0) bag.items.splice(currentIndex,1);
      item.group = previousGroup;
      bag.items.splice(previousIndex,0,item);
    },`${item.label} 已移到${target}。`);
  }

  function togglePackingShared(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === button.dataset.packingShared);
    if (!item) return;
    const previous = { shared:Boolean(item.shared), verified:Boolean(item.verified), verifiedBy:item.verifiedBy || '' };
    item.shared = !previous.shared;
    item.verified = false;
    item.verifiedBy = '';
    persistPacking(() => { Object.assign(item,previous); },item.shared ? `${item.label} 已标为二人共用，由${bag.owner}携带。` : `${item.label} 已改为${bag.owner}的个人用品。`);
  }

  function verifyPackingItem(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === button.dataset.packingVerify);
    if (!bag || !item?.shared || !item.done) return;
    const signedInBag = currentPackingBag();
    if (signedInBag?.id === bag.id) return showStatus('共同用品需要由另一位旅伴核对。');
    const previous = { verified:Boolean(item.verified), verifiedBy:item.verifiedBy || '' };
    item.verified = !previous.verified;
    item.verifiedBy = item.verified ? String(cloud?.state().user?.email || '') : '';
    persistPacking(() => { Object.assign(item,previous); },item.verified ? `${item.label} 已由旅伴核对。` : `${item.label} 已取消互核。`);
  }

  function deletePackingItem(button) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(button.dataset.packingBag);
    const itemIndex = bag?.items.findIndex(item => item.id === button.dataset.packingDelete) ?? -1;
    if (!bag || itemIndex < 0) return;
    const item = bag.items[itemIndex];
    if (!window.confirm(`确认从${bag.name}删除“${item.label}”？`)) return;
    bag.items.splice(itemIndex,1);
    persistPacking(() => { bag.items.splice(itemIndex,0,item); },`${item.label} 已从${bag.name}删除。`);
  }

  function addPackingItem(form) {
    if (!cloud?.state().editor) return openLogin();
    if (packingSaving) return;
    const bag = packingBagById(form.dataset.packingAdd);
    const label = new FormData(form).get('label')?.trim();
    const group = new FormData(form).get('group') || '背包里';
    if (!bag || !label) return;
    const item = { id:`${bag.id}-${Date.now().toString(36)}`, group, label, done:false, shared:false, verified:false };
    bag.items.push(item);
    persistPacking(() => {
      const index = bag.items.findIndex(entry => entry.id === item.id);
      if (index >= 0) bag.items.splice(index,1);
    },`${label} 已加入${bag.name}。`);
  }

  function clearPackingDragVisuals() {
    document.querySelectorAll('.packing-item.is-dragging,.packing-item.is-drop-before,.packing-item.is-drop-after').forEach(element => element.classList.remove('is-dragging','is-drop-before','is-drop-after'));
    document.body.classList.remove('is-packing-dragging');
  }

  function startPackingDrag(event) {
    const handle = event.target.closest('[data-packing-drag][data-packing-bag]');
    if (!handle || !cloud?.state().editor || packingSaving || packingShowPendingOnly) return;
    const itemElement = handle.closest('[data-packing-item]');
    const bag = packingBagById(handle.dataset.packingBag);
    const item = bag?.items.find(entry => entry.id === handle.dataset.packingDrag);
    if (!itemElement || !bag || !item) return;
    packingDrag = {
      pointerId:event.pointerId,
      handle,
      itemElement,
      bag,
      item,
      group:item.group,
      startX:event.clientX,
      startY:event.clientY,
      targetId:null,
      before:true,
      active:false,
      previousItems:bag.items.slice(),
      timer:setTimeout(() => {
        if (!packingDrag || packingDrag.pointerId !== event.pointerId) return;
        packingDrag.active = true;
        itemElement.classList.add('is-dragging');
        document.body.classList.add('is-packing-dragging');
        navigator.vibrate?.(15);
      },280)
    };
    handle.setPointerCapture?.(event.pointerId);
  }

  function movePackingDrag(event) {
    if (!packingDrag || packingDrag.pointerId !== event.pointerId) return;
    const drag = packingDrag;
    if (!drag.active) {
      if (Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY) > 9) {
        clearTimeout(drag.timer);
        packingDrag = null;
      }
      return;
    }
    event.preventDefault();
    drag.itemElement.style.transform = `translateY(${event.clientY-drag.startY}px)`;
    document.querySelectorAll('.packing-item.is-drop-before,.packing-item.is-drop-after').forEach(element => element.classList.remove('is-drop-before','is-drop-after'));
    const target = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-packing-item]');
    if (target && target !== drag.itemElement && target.dataset.packingItemBag === drag.bag.id && target.dataset.packingItemGroup === drag.group) {
      drag.targetId = target.dataset.packingItem;
      drag.before = event.clientY < target.getBoundingClientRect().top + target.getBoundingClientRect().height/2;
      target.classList.add(drag.before?'is-drop-before':'is-drop-after');
    } else {
      drag.targetId = null;
    }
    if (event.clientY < 96) window.scrollBy(0,-12);
    else if (event.clientY > innerHeight-72) window.scrollBy(0,12);
  }

  function finishPackingDrag(event,cancel=false) {
    if (!packingDrag || packingDrag.pointerId !== event.pointerId) return;
    const drag = packingDrag;
    packingDrag = null;
    clearTimeout(drag.timer);
    try { drag.handle.releasePointerCapture?.(event.pointerId); } catch {}
    drag.itemElement.style.transform = '';
    clearPackingDragVisuals();
    if (cancel || !drag.active || !drag.targetId) return;
    const sourceIndex = drag.bag.items.findIndex(item => item.id === drag.item.id);
    if (sourceIndex < 0) return;
    const [item] = drag.bag.items.splice(sourceIndex,1);
    const targetIndex = drag.bag.items.findIndex(entry => entry.id === drag.targetId);
    if (targetIndex < 0) {
      drag.bag.items.splice(0,drag.bag.items.length,...drag.previousItems);
      return;
    }
    drag.bag.items.splice(targetIndex + (drag.before?0:1),0,item);
    const unchanged = drag.bag.items.every((entry,index) => entry.id === drag.previousItems[index]?.id);
    if (unchanged) return;
    persistPacking(() => { drag.bag.items.splice(0,drag.bag.items.length,...drag.previousItems); },`${item.label} 的顺序已更新。`);
  }

  function parseTimelineTime(value) {
    const text = String(value || '').replace(/：/g,':').replace(/[—-]/g,'–').trim();
    const range = text.match(/(\d{1,2}):(\d{2})\s*–\s*(次日\s*)?(\d{1,2}):(\d{2})/);
    if (range) {
      const start = Number(range[1]) * 60 + Number(range[2]);
      let end = Number(range[4]) * 60 + Number(range[5]);
      if (range[3] || end <= start) end += 1440;
      return { start, end, duration:end-start, exact:true };
    }
    if (/左右|约|以后|日落|待定|最终|返回/.test(text) || /^次日/.test(text)) return null;
    const single = text.match(/^(\d{1,2}):(\d{2})$/);
    if (!single) return null;
    const start = Number(single[1]) * 60 + Number(single[2]);
    return { start, end:start+45, duration:45, exact:false };
  }

  function formatClock(minutes) {
    const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
  }

  function formatTimelineRange(start,duration) {
    const end = start + duration;
    return `${formatClock(start)}–${end >= 1440 ? '次日 ' : ''}${formatClock(end)}`;
  }

  function timelineMode(item) {
    const value = `${item.title} ${item.badge || ''}`;
    if (/CA\d|DV\d|C6211|航班|机场|飞/.test(value)) return 'flight';
    if (/\d{3}[ФЖ]А|Afrosiyob|火车|高铁|站/.test(value)) return 'rail';
    if (/Yandex|酒店出发|前往|一日游|骑马/.test(value)) return 'road';
    return 'visit';
  }

  function layoutTimelineEvents(items,dayIndex) {
    const events = items.map((item,itemIndex) => ({ item,itemIndex,displayTime:effectiveTodoTime(item,dayIndex),time:parseTimelineTime(effectiveTodoTime(item,dayIndex)) })).filter(event => event.time).sort((a,b) => a.time.start-b.time.start || a.time.end-b.time.end);
    let group = [];
    let groupEnd = -1;
    const finishGroup = () => {
      if (!group.length) return;
      const laneEnds = [];
      group.forEach(event => {
        let lane = laneEnds.findIndex(end => end <= event.time.start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = event.time.end;
        event.lane = lane;
      });
      group.forEach(event => { event.lanes = laneEnds.length; });
      group = [];
    };
    events.forEach(event => {
      if (group.length && event.time.start >= groupEnd) finishGroup();
      group.push(event);
      groupEnd = Math.max(groupEnd,event.time.end);
    });
    finishGroup();
    return events;
  }

  function timelineBounds(events) {
    if (!events.length) return { startHour:8, endHour:20 };
    const earliest = Math.min(...events.map(event => event.time.start));
    const latest = Math.max(...events.map(event => Math.min(event.time.end,1440)));
    const startHour = Math.max(0,Math.min(8,Math.floor(earliest/60)-1));
    const endHour = Math.min(24,Math.max(startHour+8,Math.ceil(latest/60)+1));
    return { startHour, endHour };
  }

  function nearestTodoItem() {
    const now = new Date();
    const candidates = [];
    (data.todoDays || []).forEach((day,dayIndex) => {
      const [month,date] = day.date.split('/').map(Number);
      day.items.forEach((item,itemIndex) => {
        const parsed = parseTimelineTime(effectiveTodoTime(item,dayIndex));
        if (!parsed) return;
        const start = new Date(2026,month-1,date,0,0,0,0);
        start.setMinutes(parsed.start);
        const end = new Date(start.getTime()+parsed.duration*60000);
        const distance = now < start ? start-now : now > end ? now-end : 0;
        candidates.push({day,dayIndex,item,itemIndex,start,end,distance});
      });
    });
    return candidates.sort((a,b) => a.distance-b.distance || a.start-b.start)[0] || null;
  }

  function nearestTimeLabel(entry) {
    const now = new Date();
    if (now >= entry.start && now <= entry.end) return '正在进行';
    const future = entry.start > now;
    const minutes = Math.max(1,Math.round(Math.abs(entry.start-now)/60000));
    if (minutes < 60) return `${minutes} 分钟${future?'后':'前'}`;
    const hours = Math.round(minutes/60);
    if (hours < 24) return `${hours} 小时${future?'后':'前'}`;
    return `${Math.round(hours/24)} 天${future?'后':'前'}`;
  }

  function renderNearestTodo() {
    const entry = nearestTodoItem();
    if (!entry) return '<aside class="todo-nearest"><p>暂无明确时间的安排</p></aside>';
    return `<button type="button" class="todo-nearest" data-open-todo-day="${entry.dayIndex}" data-open-todo-item="${entry.itemIndex}"><span class="todo-nearest-kicker">最近安排 <b>${nearestTimeLabel(entry)}</b></span><time>${escape(entry.day.date)} ${escape(entry.day.week)} · ${escape(effectiveTodoTime(entry.item,entry.dayIndex))}</time><strong>${escape(displayTodoTitle(entry.item,entry.dayIndex))}</strong><span class="todo-nearest-action">查看详情 ${icon('chevron-right')}</span></button>`;
  }

  function todoPlacePicker(dayIndex,item) {
    const schedule = data.days?.[dayIndex];
    const cityIds = data.cities.filter(city => schedule?.city?.includes(city.name)).map(city => city.id);
    if (!cityIds.length && schedule?.cityId) cityIds.push(schedule.cityId);
    const linkedPlaces = model.linkedPlaces(data,item,dayIndex);
    const groups = cityIds.map(cityId => {
      const city = cityById[cityId];
      const places = data.savedPlaces.filter(place => place.cityId === cityId).sort((a,b) => {
        const aDecision = placeDecision(a.id), bDecision = placeDecision(b.id);
        if (Boolean(aDecision.pinned) !== Boolean(bDecision.pinned)) return aDecision.pinned ? -1 : 1;
        const order = {must:0,route:1,optional:2,drop:3};
        return (order[aDecision.status] ?? 4)-(order[bDecision.status] ?? 4) || a.name.localeCompare(b.name,'zh-CN');
      });
      if (!places.length) return '';
      const options = places.map(place => {
        const decision = placeDecision(place.id);
        const tags = [decision.pinned?'置顶':'',placeStatuses[decision.status]?.label || ''].filter(Boolean);
        const selected = linkedPlaces.some(item => item.id === place.id);
        return `<option value="${escape(place.id)}" ${selected?'disabled':''}>${escape([selected?'已添加':'',...tags,place.name].filter(Boolean).join(' · '))}</option>`;
      }).join('');
      return `<optgroup label="${escape(city.name)}">${options}</optgroup>`;
    }).join('');
    if (!groups) return '';
    const chips = linkedPlaces.map(place => `<span class="todo-place-chip" data-inline-todo-place-id="${escape(place.id)}">${icon('map-pin')}<span>${escape(place.name)}</span><button type="button" data-remove-inline-todo-place="${escape(place.id)}" aria-label="移除 ${escape(place.name)}" title="移除地点">${icon('x')}</button></span>`).join('');
    return `<div class="todo-place-picker"><label>调用本日城市收藏地点<select data-inline-todo-place><option value="">选择并添加地点</option>${groups}</select></label><div class="todo-selected-places" data-inline-todo-places>${chips || '<small>尚未关联收藏地点</small>'}</div></div>`;
  }

  function applyInlineTodoPlace(select) {
    const place = data.savedPlaces.find(item => item.id === select.value);
    if (!place) return;
    const panel = select.closest('.todo-event-detail');
    const selected = panel?.querySelector('[data-inline-todo-places]');
    if (!selected || selected.querySelector(`[data-inline-todo-place-id="${CSS.escape(place.id)}"]`)) {
      select.value = '';
      return;
    }
    const title = panel?.querySelector('[data-inline-todo-title]');
    const note = panel?.querySelector('[data-inline-todo-note]');
    selected.querySelector('small')?.remove();
    selected.insertAdjacentHTML('beforeend',`<span class="todo-place-chip" data-inline-todo-place-id="${escape(place.id)}">${icon('map-pin')}<span>${escape(place.name)}</span><button type="button" data-remove-inline-todo-place="${escape(place.id)}" aria-label="移除 ${escape(place.name)}" title="移除地点">${icon('x')}</button></span>`);
    select.querySelector(`option[value="${CSS.escape(place.id)}"]`)?.setAttribute('disabled','');
    select.value = '';
    if (title?.value.trim() === '新待办事项') title.value = place.name;
    if (note && !note.value.trim() && place.note) note.value = place.note;
    refreshIcons();
  }

  function removeInlineTodoPlace(button) {
    const panel = button.closest('.todo-event-detail');
    const placeId = button.dataset.removeInlineTodoPlace;
    button.closest('[data-inline-todo-place-id]')?.remove();
    const option = panel?.querySelector(`[data-inline-todo-place] option[value="${CSS.escape(placeId)}"]`);
    if (option) option.disabled = false;
    const selected = panel?.querySelector('[data-inline-todo-places]');
    if (selected && !selected.querySelector('[data-inline-todo-place-id]')) selected.innerHTML = '<small>尚未关联收藏地点</small>';
  }

  function renderTodoDetail(day,item,itemIndex,editor,dayIndex,isNew=false) {
    const references = linkedPlaces(item,dayIndex);
    const maps = (item.maps || []).map(([label,query]) => `<a href="${googleMapsLink(query)}" target="_blank" rel="noopener">${icon('map-pin')}${escape(label)}${icon('arrow-up-right')}</a>`).join('') + references.filter(place => !(item.maps || []).some(([label]) => model.normalize(label) === model.normalize(place.name))).map(place => `<a href="${placeMapsLink(place)}" target="_blank" rel="noopener">${icon('map-pin')}${escape(place.name)}${icon('arrow-up-right')}</a>`).join('');
    const referenceButtons = references.map(place => `<span class="todo-place-actions"><button type="button" data-todo-map-place="${escape(place.id)}">${icon('locate-fixed')}地图定位</button><button type="button" data-todo-saved-place="${escape(place.id)}">${icon('bookmark')}收藏详情</button></span>`).join('');
    const leg = resolveTodoLeg(item,dayIndex);
    const source = item.source ? `<a class="todo-source" href="${escape(item.source)}" target="_blank" rel="noopener">${escape(item.sourceLabel || '官方信息')}${icon('arrow-up-right')}</a>` : '';
    const createAttribute = isNew ? 'data-create-todo="true"' : '';
    const copyEditor = editor ? `<div class="todo-inline-editor">${todoPlacePicker(dayIndex,item)}<label>事项内容<input type="text" data-inline-todo-title value="${escape(item.title)}" maxlength="120"></label><label>备注<textarea data-inline-todo-note rows="3" maxlength="500">${escape(item.note || '')}</textarea></label><button type="button" class="secondary-button" data-save-todo-day="${dayIndex}" data-save-todo-copy="${itemIndex}" ${createAttribute} ${todoSaving?'disabled':''}>${icon('save')}${isNew?'新增事项':'保存事项'}</button></div>` : `<h3>${escape(displayTodoTitle(item,dayIndex))}${item.badge?`<span>${escape(item.badge)}</span>`:''}</h3><p class="todo-detail-note">${escape(item.note || '暂无备注')}</p>`;
    const stateButton = isNew ? '' : `<button type="button" class="todo-state" data-todo-day="${day.id}" data-todo-item="${itemIndex}" aria-pressed="${Boolean(item.done)}" title="${editor?'切换完成状态':'登录后更新状态'}" ${todoSaving?'disabled':''}>${icon(item.done?'circle-check-big':'circle')}<span>${item.done?'已完成':'标记完成'}</span></button>`;
    const deleteButton = isNew || !editor ? '' : `<button type="button" class="danger-button todo-delete" data-delete-todo-day="${dayIndex}" data-delete-todo-item="${itemIndex}" ${todoSaving?'disabled':''}>${icon('trash-2')}删除事项</button>`;
    const actions = stateButton || deleteButton ? `<div class="todo-detail-actions">${stateButton}${deleteButton}</div>` : '';
    return `<div class="todo-event-detail todo-dialog-detail" aria-live="polite"><p class="todo-detail-kicker">${escape(day.date)} ${escape(day.week)} ${status(leg || item)}</p><time>${escape(effectiveTodoTime(item,dayIndex))}</time>${copyEditor}${leg?leaveReminder(leg):''}${leg&&editor?`<button type="button" class="todo-edit-leg" data-edit-leg="${escape(leg.id)}">${icon('pencil-line')}修改交通时间与提醒</button>`:''}${maps?`<div class="todo-detail-maps">${maps}</div>`:''}${referenceButtons}${source}${actions}</div>`;
  }

  function refreshTodoPopup() {
    if (!openTodoPopup || !$('#detail-dialog').open) return;
    const {dayIndex,itemIndex,isNew,draft} = openTodoPopup;
    const day = data.todoDays?.[dayIndex];
    const item = isNew ? draft : day?.items?.[itemIndex];
    if (!day || !item) return $('#detail-dialog').close();
    $('#dialog-title').textContent = isNew ? '新增待办' : '待办详情';
    $('#dialog-body').innerHTML = renderTodoDetail(day,item,itemIndex,Boolean(cloud?.state().editor),dayIndex,Boolean(isNew));
    refreshIcons();
  }

  function openTodoItem(dayIndex,itemIndex,selectOnTimeline=false) {
    const day = data.todoDays?.[dayIndex];
    const item = day?.items?.[itemIndex];
    if (!day || !item) return;
    if (selectOnTimeline && dayIndex === selectedTodoDay) {
      selectedTodoItem = itemIndex;
      renderTodo();
    }
    openDialog('待办详情',renderTodoDetail(day,item,itemIndex,Boolean(cloud?.state().editor),dayIndex),{dayIndex,itemIndex});
  }

  function openNewTodoAt(dayIndex,start) {
    if (!cloud?.state().editor) return openLogin();
    const day = data.todoDays?.[dayIndex];
    if (!day) return;
    const draft = {time:formatTimelineRange(start,60),title:'新待办事项',maps:[],note:'',badge:'',sourceLabel:'',source:'',done:false};
    openDialog('新增待办',renderTodoDetail(day,draft,-1,true,dayIndex,true),{dayIndex,itemIndex:-1,isNew:true,draft});
    requestAnimationFrame(() => $('[data-inline-todo-title]')?.select());
  }

  function renderTodo() {
    const days = data.todoDays || [];
    const total = days.reduce((sum,day) => sum + day.items.length, 0);
    const done = days.reduce((sum,day) => sum + day.items.filter(item => item.done).length, 0);
    const editor = Boolean(cloud?.state().editor);
    selectedTodoDay = Math.max(0,Math.min(selectedTodoDay,days.length-1));
    const day = days[selectedTodoDay];
    if (!day) return;
    selectedTodoItem = Math.max(0,Math.min(selectedTodoItem,day.items.length-1));
    const events = layoutTimelineEvents(day.items,selectedTodoDay);
    const nextTimedItem = model.dateKey(data.days?.[selectedTodoDay]?.date) === model.todayKey()
      ? events.find(event => todoClockState(event.item,selectedTodoDay)==='future' && !event.item.done)?.itemIndex : -1;
    const flexible = day.items.map((item,itemIndex) => ({item,itemIndex})).filter(entry => !parseTimelineTime(effectiveTodoTime(entry.item,selectedTodoDay)));
    const {startHour,endHour} = timelineBounds(events);
    const hourHeight = matchMedia('(max-width:700px)').matches ? 58 : 64;
    const timelineHeight = (endHour-startHour)*hourHeight;
    const dayDone = day.items.filter(item => item.done).length;
    const lines = Array.from({length:endHour-startHour+1},(_,index) => {
      const hour = startHour+index;
      return `<div class="todo-hour" style="top:${index*hourHeight}px"><time>${String(hour).padStart(2,'0')}:00</time><i></i></div>`;
    }).join('');
    const blocks = events.map(event => {
      const visibleEnd = Math.min(event.time.end,endHour*60);
      const top = (event.time.start-startHour*60)/60*hourHeight;
      const height = Math.max(44,(visibleEnd-event.time.start)/60*hourHeight);
      const gap = event.lanes > 1 ? 4 : 0;
      const left = event.lane/event.lanes*100;
      const width = 100/event.lanes;
      const item = event.item;
      const leg = resolveTodoLeg(item,selectedTodoDay);
      const temporal = todoClockState(item,selectedTodoDay);
      return `<article class="todo-timeline-event mode-${leg?.mode || timelineMode(item)} ${item.done?'is-done':''} ${temporal?`is-${temporal}`:''} ${nextTimedItem===event.itemIndex?'is-next':''} status-${model.getStatusClass(leg || item)} ${leg?'is-transport':''} ${selectedTodoItem===event.itemIndex?'is-selected':''}" data-timeline-select="${event.itemIndex}" style="top:${top}px;height:${height}px;left:calc(${left}% + ${event.lane?gap:0}px);width:calc(${width}% - ${event.lanes>1?gap:0}px)" aria-label="${escape(event.displayTime)} ${escape(displayTodoTitle(item,selectedTodoDay))}"><div class="todo-event-copy"><time>${escape(event.displayTime)} ${temporal==='current'?'· NOW':nextTimedItem===event.itemIndex?'· NEXT':''}</time><h3>${escape(displayTodoTitle(item,selectedTodoDay))}</h3>${leg?.leaveHotelTime?`<small>离开酒店 ${escape(leg.leaveHotelTime)}</small>`:''}</div>${leg?'':`<button type="button" class="todo-resize-handle" data-resize-day="${selectedTodoDay}" data-resize-item="${event.itemIndex}" title="${editor?'上下拖动调整时长':'登录后调整时长'}" aria-label="${editor?'上下拖动调整时长':'登录后调整时长'}" ${todoSaving?'disabled':''}>${icon('grip-horizontal')}</button>`}<button type="button" class="todo-event-state" data-todo-day="${day.id}" data-todo-item="${event.itemIndex}" aria-pressed="${Boolean(item.done)}" title="${editor?'切换完成状态':'登录后更新状态'}" ${todoSaving?'disabled':''}>${icon(item.done?'circle-check-big':'circle')}</button>${leg?'':`<button type="button" class="todo-drag-handle" data-drag-day="${selectedTodoDay}" data-drag-item="${event.itemIndex}" title="${editor?'拖动调整时间':'登录后拖动调整'}" aria-label="${editor?'拖动调整时间':'登录后拖动调整'}" ${todoSaving?'disabled':''}>${icon('grip-vertical')}</button>`}</article>`;
    }).join('');
    const flexibleHtml = flexible.length ? `<section class="todo-flexible"><header><div>${icon('clock-3')}<h3>弹性事项</h3></div><span>未设置完整起止时间</span></header>${flexible.map(({item,itemIndex}) => `<button type="button" class="todo-flexible-item ${selectedTodoItem===itemIndex?'is-selected':''}" data-timeline-select="${itemIndex}"><time>${escape(item.time)}</time><span>${escape(item.title)}</span>${icon('chevron-right')}</button>`).join('')}</section>` : '';
    $('#todo-summary').innerHTML = `<strong>${done} / ${total}</strong><span>已完成</span><div class="todo-progress" aria-label="已完成 ${done} 项，共 ${total} 项"><i style="width:${total ? done/total*100 : 0}%"></i></div>`;
    $('#todo-day-nav').innerHTML = days.map((entry,index) => `<button type="button" data-todo-anchor="${entry.id}" data-todo-index="${index}" aria-pressed="${index===selectedTodoDay}"><strong>${escape(entry.date)}</strong><span>${escape(entry.week)}</span></button>`).join('');
    $('#todo-list').innerHTML = `<section class="todo-timeline-day" id="todo-${day.id}"><header class="todo-timeline-header"><div><p>${escape(day.date)}</p><h2>${escape(day.week)}</h2></div><span>${dayDone} / ${day.items.length} 完成</span></header><div class="todo-timeline-layout"><div class="todo-timeline-main"><div class="todo-timeline" style="height:${timelineHeight}px;--hour-height:${hourHeight}px" data-start-hour="${startHour}" data-end-hour="${endHour}" title="长按空白时间新增待办">${lines}<div class="todo-events-layer">${blocks}</div></div>${flexibleHtml}</div>${renderNearestTodo()}</div></section>`;
    renderToday();
    refreshIcons();
  }

  async function toggleTodo(button) {
    if (!cloud?.state().editor) return openLogin();
    if (todoSaving) return;
    const day = data.todoDays.find(item => item.id === button.dataset.todoDay);
    const item = day?.items[Number(button.dataset.todoItem)];
    if (!item) return;
    const previous = Boolean(item.done);
    item.done = !previous;
    todoSaving = true;
    renderTodo();
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      showStatus(item.done ? '已标记完成，进度已同步。' : '已恢复为未完成，进度已同步。');
    } catch (error) {
      item.done = previous;
      showStatus(error.message || '状态保存失败，请稍后重试。');
    } finally {
      todoSaving = false;
      renderTodo();
      refreshTodoPopup();
    }
  }

  async function saveTodoCopy(button) {
    if (!cloud?.state().editor) return openLogin();
    if (todoSaving) return;
    const dayIndex = Number(button.dataset.saveTodoDay);
    const itemIndex = Number(button.dataset.saveTodoCopy);
    const creating = button.dataset.createTodo === 'true';
    const day = data.todoDays?.[dayIndex];
    const item = creating ? (openTodoPopup?.draft ? copy(openTodoPopup.draft) : null) : day?.items?.[itemIndex];
    const panel = button.closest('.todo-event-detail');
    const title = panel?.querySelector('[data-inline-todo-title]')?.value.trim();
    const note = panel?.querySelector('[data-inline-todo-note]')?.value.trim() || '';
    const placeIds = [...(panel?.querySelectorAll('[data-inline-todo-place-id]') || [])].map(entry => entry.dataset.inlineTodoPlaceId);
    const chosenPlaces = placeIds.map(placeId => data.savedPlaces.find(entry => entry.id === placeId)).filter(Boolean);
    if (!day || !item || !title) {
      showStatus('事项内容不能为空。');
      panel?.querySelector('[data-inline-todo-title]')?.focus();
      return;
    }
    const previous = { title:item.title, note:item.note, maps:copy(item.maps || []), placeIds:copy(item.placeIds || []) };
    item.title = title;
    item.note = note;
    const savedPlaceLabels = new Set(data.savedPlaces.map(place => normalizePlaceName(place.name)));
    const remainingMaps = (item.maps || []).filter(([label]) => !savedPlaceLabels.has(normalizePlaceName(label)));
    item.maps = [...chosenPlaces.map(place => [place.name,placeMapsQuery(place)]),...remainingMaps];
    item.placeIds = chosenPlaces.map(place => place.id);
    let createdIndex = -1;
    if (creating) {
      createdIndex = day.items.length;
      day.items.push(item);
      selectedTodoDay = dayIndex;
      selectedTodoItem = createdIndex;
      openTodoPopup = {dayIndex,itemIndex:createdIndex};
    }
    todoSaving = true;
    button.disabled = true;
    renderTodo();
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      showStatus(creating ? '新待办已加入时间轴，并同步给同行成员。' : '事项文字已更新，并同步给同行成员。');
    } catch (error) {
      if (creating) {
        day.items.splice(createdIndex,1);
        openTodoPopup = {dayIndex,itemIndex:-1,isNew:true,draft:item};
      } else {
        item.title = previous.title;
        item.note = previous.note;
        item.maps = previous.maps;
        item.placeIds = previous.placeIds;
      }
      showStatus(error.message || (creating ? '新增失败，请稍后重试。' : '文字保存失败，已恢复原内容。'));
    } finally {
      todoSaving = false;
      renderTodo();
      refreshTodoPopup();
    }
  }

  async function deleteTodoFromPopup(button) {
    if (!cloud?.state().editor) return openLogin();
    if (todoSaving) return;
    const dayIndex = Number(button.dataset.deleteTodoDay);
    const itemIndex = Number(button.dataset.deleteTodoItem);
    const day = data.todoDays?.[dayIndex];
    const item = day?.items?.[itemIndex];
    if (!day || !item) return;
    if (!window.confirm(`确认删除“${item.title}”？此操作会同步给同行成员。`)) return;
    const removed = day.items.splice(itemIndex,1)[0];
    const popup = {dayIndex,itemIndex};
    selectedTodoDay = dayIndex;
    selectedTodoItem = Math.max(0,Math.min(itemIndex,day.items.length-1));
    todoSaving = true;
    button.disabled = true;
    renderTodo();
    let deleted = false;
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      deleted = true;
      $('#detail-dialog').close();
      showStatus('事项已删除，并同步给同行成员。');
    } catch (error) {
      day.items.splice(itemIndex,0,removed);
      selectedTodoItem = itemIndex;
      openTodoPopup = popup;
      showStatus(error.message || '删除失败，事项已恢复。');
    } finally {
      todoSaving = false;
      renderTodo();
      if (!deleted) refreshTodoPopup();
    }
  }

  async function saveTimelineMove(dayIndex,itemIndex,newStart,duration,previousTime) {
    const item = data.todoDays?.[dayIndex]?.items?.[itemIndex];
    if (!item) return;
    item.time = formatTimelineRange(newStart,duration);
    todoSaving = true;
    selectedTodoDay = dayIndex;
    selectedTodoItem = itemIndex;
    renderTodo();
    try {
      const payload = copy(data);
      delete payload.savedPlaces;
      payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
      await cloud.saveData(payload);
      data.updated = payload.updated;
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      showStatus(`时间已调整为 ${item.time}，并同步给同行成员。`);
    } catch (error) {
      item.time = previousTime;
      showStatus(error.message || '时间保存失败，已恢复原安排。');
    } finally {
      todoSaving = false;
      renderTodo();
    }
  }

  function startTimelineDrag(event) {
    const handle = event.target.closest('[data-drag-day][data-drag-item]');
    if (!handle || event.button > 0) return;
    if (!cloud?.state().editor) {
      event.preventDefault();
      openLogin();
      return;
    }
    if (todoSaving) return;
    const dayIndex = Number(handle.dataset.dragDay);
    const itemIndex = Number(handle.dataset.dragItem);
    const item = data.todoDays?.[dayIndex]?.items?.[itemIndex];
    const parsed = parseTimelineTime(item?.time);
    const block = handle.closest('.todo-timeline-event');
    const timeline = handle.closest('.todo-timeline');
    if (!item || !parsed || !block || !timeline) return;
    event.preventDefault();
    const hourHeight = parseFloat(getComputedStyle(timeline).getPropertyValue('--hour-height')) || 58;
    const startHour = Number(timeline.dataset.startHour);
    const endHour = Number(timeline.dataset.endHour);
    timelineDrag = { handle,block,timeline,dayIndex,itemIndex,previousTime:item.time,start:parsed.start,duration:parsed.duration,startY:event.clientY,hourHeight,startHour,endHour,newStart:parsed.start,moved:false };
    block.classList.add('is-dragging');
    handle.setPointerCapture?.(event.pointerId);
  }

  function moveTimelineDrag(event) {
    if (!timelineDrag) return;
    event.preventDefault();
    const drag = timelineDrag;
    const deltaMinutes = Math.round(((event.clientY-drag.startY)/drag.hourHeight*60)/15)*15;
    const rangeStart = drag.startHour*60;
    const rangeEnd = drag.endHour*60;
    const maxStart = Math.max(rangeStart,rangeEnd-drag.duration);
    drag.newStart = Math.max(rangeStart,Math.min(maxStart,drag.start+deltaMinutes));
    drag.moved = drag.moved || Math.abs(event.clientY-drag.startY) > 4;
    drag.block.style.top = `${(drag.newStart-rangeStart)/60*drag.hourHeight}px`;
    const label = drag.block.querySelector('.todo-event-copy time');
    if (label) label.textContent = formatTimelineRange(drag.newStart,drag.duration);
  }

  function finishTimelineDrag(event) {
    if (!timelineDrag) return;
    const drag = timelineDrag;
    timelineDrag = null;
    drag.block.classList.remove('is-dragging');
    try { drag.handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
    if (drag.moved && drag.newStart !== drag.start) saveTimelineMove(drag.dayIndex,drag.itemIndex,drag.newStart,drag.duration,drag.previousTime);
    else renderTodo();
  }

  function startTimelineResize(event) {
    const handle = event.target.closest('[data-resize-day][data-resize-item]');
    if (!handle || event.button > 0) return;
    if (!cloud?.state().editor) {
      event.preventDefault();
      openLogin();
      return;
    }
    if (todoSaving) return;
    const dayIndex = Number(handle.dataset.resizeDay);
    const itemIndex = Number(handle.dataset.resizeItem);
    const item = data.todoDays?.[dayIndex]?.items?.[itemIndex];
    const parsed = parseTimelineTime(item?.time);
    const block = handle.closest('.todo-timeline-event');
    const timeline = handle.closest('.todo-timeline');
    if (!item || !parsed || !block || !timeline) return;
    event.preventDefault();
    const hourHeight = parseFloat(getComputedStyle(timeline).getPropertyValue('--hour-height')) || 58;
    const endHour = Number(timeline.dataset.endHour);
    timelineResize = { handle,block,dayIndex,itemIndex,previousTime:item.time,start:parsed.start,duration:parsed.duration,newDuration:parsed.duration,startY:event.clientY,hourHeight,endHour,moved:false };
    block.classList.add('is-resizing');
    handle.setPointerCapture?.(event.pointerId);
  }

  function moveTimelineResize(event) {
    if (!timelineResize) return;
    event.preventDefault();
    const resize = timelineResize;
    const deltaMinutes = Math.round(((event.clientY-resize.startY)/resize.hourHeight*60)/15)*15;
    const visibleLimit = Math.max(15,resize.endHour*60-resize.start);
    const maxDuration = Math.max(resize.duration,visibleLimit);
    resize.newDuration = Math.max(15,Math.min(maxDuration,resize.duration+deltaMinutes));
    resize.moved = resize.moved || Math.abs(event.clientY-resize.startY) > 4;
    const visibleDuration = Math.min(resize.newDuration,visibleLimit);
    resize.block.style.height = `${Math.max(44,visibleDuration/60*resize.hourHeight)}px`;
    const label = resize.block.querySelector('.todo-event-copy time');
    if (label) label.textContent = formatTimelineRange(resize.start,resize.newDuration);
  }

  function finishTimelineResize(event) {
    if (!timelineResize) return;
    const resize = timelineResize;
    timelineResize = null;
    resize.block.classList.remove('is-resizing');
    try { resize.handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
    if (resize.moved && resize.newDuration !== resize.duration) saveTimelineMove(resize.dayIndex,resize.itemIndex,resize.start,resize.newDuration,resize.previousTime);
    else renderTodo();
  }

  function clearTimelinePress() {
    if (!timelinePress) return;
    clearTimeout(timelinePress.timer);
    timelinePress.timeline.classList.remove('is-pressing');
    timelinePress = null;
  }

  function startTimelineLongPress(event) {
    if (event.button > 0 || event.target.closest('.todo-timeline-event')) return;
    const timeline = event.target.closest('.todo-timeline');
    if (!timeline) return;
    clearTimelinePress();
    const rect = timeline.getBoundingClientRect();
    const y = Math.max(0,Math.min(rect.height,event.clientY-rect.top));
    const hourHeight = parseFloat(getComputedStyle(timeline).getPropertyValue('--hour-height')) || 58;
    const startHour = Number(timeline.dataset.startHour);
    const endHour = Number(timeline.dataset.endHour);
    const rawStart = startHour*60 + Math.round((y/hourHeight*60)/15)*15;
    const start = Math.max(startHour*60,Math.min(endHour*60-60,rawStart));
    timeline.style.setProperty('--press-y',`${(start-startHour*60)/60*hourHeight}px`);
    timeline.classList.add('is-pressing');
    const press = {timeline,startX:event.clientX,startY:event.clientY,start,dayIndex:selectedTodoDay,timer:null};
    press.timer = setTimeout(() => {
      if (timelinePress !== press) return;
      navigator.vibrate?.(20);
      clearTimelinePress();
      openNewTodoAt(press.dayIndex,press.start);
    },550);
    timelinePress = press;
  }

  function moveTimelineLongPress(event) {
    if (!timelinePress) return;
    if (Math.hypot(event.clientX-timelinePress.startX,event.clientY-timelinePress.startY) > 10) clearTimelinePress();
  }

  function fitMap() {
    if (!map) return;
    map.invalidateSize();
    map.fitBounds(data.cities.map(c=>c.coords), {paddingTopLeft:[46,50],paddingBottomRight:[70,70],animate:false});
  }

  function updateMapTools() {
    const savedButton = $('#saved-toggle');
    if (savedButton) {
      savedButton.disabled = !selected;
      savedButton.setAttribute('aria-pressed', String(Boolean(selected && savedVisible)));
      savedButton.title = !selected ? '选择城市后显示收藏地点' : (savedVisible ? '隐藏本城收藏地点' : '显示本城收藏地点');
      savedButton.setAttribute('aria-label', savedButton.title);
    }
    const detailButton = $('#show-saved');
    if (detailButton) detailButton.innerHTML = `${icon(savedVisible?'map-pin-off':'map-pin')}${savedVisible?'隐藏地图标记':'显示地图标记'}`;
  }

  function applyMapMode() {
    if (!map) return;
    const legend = $('.map-legend');
    if (legend) legend.hidden = Boolean(selected);
    if (routeLayer && map.hasLayer(routeLayer)) map.removeLayer(routeLayer);
    if (cityLayer && map.hasLayer(cityLayer)) map.removeLayer(cityLayer);
    Object.values(cityMarkers).forEach(marker => { if (map.hasLayer(marker)) map.removeLayer(marker); });
    Object.values(savedLayersByCity).forEach(layer => { if (map.hasLayer(layer)) map.removeLayer(layer); });
    if (todayRouteLayer && map.hasLayer(todayRouteLayer)) map.removeLayer(todayRouteLayer);
    if (!selected) {
      routeLayer?.addTo(map);
      cityLayer?.addTo(map);
      fitMap();
    } else {
      const city = cityById[selected];
      cityMarkers[selected]?.addTo(map);
      if (savedVisible) savedLayersByCity[selected]?.addTo(map);
      map.invalidateSize();
      map.setView(city.coords, matchMedia('(max-width: 700px)').matches ? 11.5 : 12.5, { animate:!matchMedia('(prefers-reduced-motion: reduce)').matches });
    }
    Object.entries(cityMarkers).forEach(([key,marker]) => marker.getElement()?.querySelector('.map-pin')?.classList.toggle('active',key===selected));
    drawTodayRoute();
    updateMapTools();
    refreshIcons();
  }

  function renderRouteDaySelect() {
    $('#route-day-select').innerHTML = data.days.map((day,index) => `<option value="${index}" ${index===routeDayIndex?'selected':''}>${escape(day.date)} ${escape(day.week)} · ${escape(day.city)}</option>`).join('');
    $('#route-day-toggle').setAttribute('aria-pressed',String(todayRouteVisible));
    $('#route-day-toggle').innerHTML = `${icon('route')}${todayRouteVisible?'隐藏当日顺序':'显示当日顺序'}`;
    refreshIcons();
  }

  function drawTodayRoute() {
    if (!map || !todayRouteLayer || !todayRouteVisible) return;
    todayRouteLayer.clearLayers();
    const day = data.todoDays?.[routeDayIndex];
    if (!day) return;
    const ordered = (day.items || []).map((item,itemIndex) => ({item,itemIndex,time:parseTimelineTime(effectiveTodoTime(item,routeDayIndex))})).sort((a,b) => (a.time?.start ?? 9999)-(b.time?.start ?? 9999));
    const stops = [];
    ordered.forEach(({item,itemIndex}) => {
      linkedPlaces(item,routeDayIndex).forEach(place => {
        if (!Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
        if (stops.at(-1)?.place.id === place.id) return;
        stops.push({place,item,itemIndex});
      });
    });
    stops.forEach(({place,item,itemIndex},index) => {
      L.marker([place.lat,place.lon],{icon:L.divIcon({className:'today-route-marker',html:`<span>${index+1}</span>`,iconSize:[28,28],iconAnchor:[14,14]}),zIndexOffset:500})
        .bindPopup(`<h3>${index+1}. ${escape(place.name)}</h3><p>${escape(item.title)}</p><button type="button" data-jump-todo-day="${routeDayIndex}" data-jump-todo-item="${itemIndex}">查看待办事项</button>`)
        .addTo(todayRouteLayer);
    });
    if (stops.length > 1) L.polyline(stops.map(stop => [stop.place.lat,stop.place.lon]),{color:'#b45a3e',weight:3,dashArray:'3 8',opacity:.85,interactive:false}).addTo(todayRouteLayer);
    todayRouteLayer.addTo(map);
    if (stops.length) map.fitBounds(L.latLngBounds(stops.map(stop => [stop.place.lat,stop.place.lon])).pad(.22),{maxZoom:14,animate:false});
  }

  function openTodayRoute(dayIndex) {
    routeDayIndex = dayIndex;
    todayRouteVisible = true;
    selected = null;
    savedVisible = false;
    renderCities();
    renderCityDetail();
    renderRouteDaySelect();
    showView('map');
    requestAnimationFrame(() => $('.route-day-bar')?.scrollIntoView({behavior:'smooth',block:'start'}));
  }

  function toggleSavedPlaces() {
    if (!map || !selected) return;
    savedVisible = !savedVisible;
    applyMapMode();
  }

  function revealPlaceCard(placeId) {
    const card = document.querySelector(`[data-place-card="${placeId}"]`);
    if (!card) return;
    document.querySelectorAll('.saved-place-card.is-located').forEach(item => item.classList.remove('is-located'));
    card.classList.add('is-located');
    card.scrollIntoView({ behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth', block:'center' });
    clearTimeout(revealPlaceCard.timer);
    revealPlaceCard.timer = setTimeout(() => card.classList.remove('is-located'), 3200);
  }

  function focusPlaceOnMap(placeId) {
    const place = data.savedPlaces.find(item => item.id === placeId);
    if (!place || !map) return;
    if (selected !== place.cityId) {
      selected = place.cityId;
      savedVisible = true;
      renderCities();
      renderCityDetail();
      applyMapMode();
    }
    const marker = savedMarkersById[placeId];
    const layer = savedLayersByCity[place.cityId];
    const openMarker = () => {
      map.setView([place.lat,place.lon],15.5,{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});
      marker?.openPopup();
      $('#route-map').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    };
    if (layer?.zoomToShowLayer && marker) layer.zoomToShowLayer(marker,openMarker); else openMarker();
  }

  function initMap() {
    if (!window.L) { $('#map-error').hidden=false; return; }
    if (map) return;
    map = L.map('route-map',{scrollWheelZoom:false,zoomSnap:0.25,minZoom:3,maxZoom:16});
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',crossOrigin:true}).addTo(map);
    tileLayer.on('tileload',()=>{clearTimeout(mapTimeout);$('#map-error').hidden=true;});
    mapTimeout=setTimeout(()=>{$('#map-error').hidden=false;},12000);
    routeLayer = L.layerGroup().addTo(map);
    cityLayer = L.layerGroup().addTo(map);
    todayRouteLayer = L.layerGroup();
    data.legs.filter(l=>l.map?.length===2 && cityById[l.map[0]] && cityById[l.map[1]]).forEach(l=>{
      const a=cityById[l.map[0]].coords,b=cityById[l.map[1]].coords;
      const color=l.mode==='flight'?'#b95049':l.mode==='road'?'#99762c':'#206b5c';
      L.polyline([a,b],{color:'#fff',weight:7,opacity:.9,interactive:false}).addTo(routeLayer);
      L.polyline([a,b],{color,weight:3.5,dashArray:l.mode==='rail'?null:'6 7',opacity:.95}).addTo(routeLayer).bindPopup(`<h3>${escape(l.from)} → ${escape(l.to)}</h3>${escape(l.code)}<br>${l.date} · ${legTime(l)}`);
      const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      L.marker(midpoint,{icon:L.divIcon({className:'transport-marker',html:`<div class="transport-sticker ${l.mode}">${icon(glyph[l.mode])}<span>${l.mode==='road'?'时间待定':escape(l.code)}</span></div>`,iconSize:[80,27],iconAnchor:[40,13]}),title:`${l.code} ${l.from}至${l.to}`}).addTo(routeLayer).on('click',()=>openDialog(`${l.date} · 交通详情`,legDetail(l)));
    });
    data.cities.forEach((c,i)=>{
      const marker=L.marker(c.coords,{icon:L.divIcon({className:'city-marker',html:`<div class="map-pin ${c.id===selected?'active':''}" style="--pin-color:${c.color}">${i+1}</div>`,iconSize:[28,28],iconAnchor:[14,14]}),title:`${i+1}. ${c.name}`,zIndexOffset:100}).addTo(cityLayer);
      marker.bindTooltip(c.name,{permanent:true,direction:c.id==='samarkand'?'bottom':'top',offset:c.id==='samarkand'?[0,16]:[0,-14],className:'city-label'});
      marker.on('click',()=>selectCity(c.id));
      cityMarkers[c.id]=marker;
    });
    data.cities.forEach(city => {
      savedLayersByCity[city.id] = L.markerClusterGroup ? L.markerClusterGroup({
        showCoverageOnHover:false,
        maxClusterRadius:46,
        disableClusteringAtZoom:15,
        spiderfyOnMaxZoom:true,
        iconCreateFunction:cluster => L.divIcon({className:'saved-cluster',html:`<span>${cluster.getChildCount()}</span>`,iconSize:[34,34],iconAnchor:[17,17]})
      }) : L.layerGroup();
    });
    data.savedPlaces.forEach(p=>{
      const c=cityById[p.cityId];
      if (!c || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
      const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'saved-place-marker',html:placeMarkerHtml(p),iconSize:[24,24],iconAnchor:[12,12]}),title:p.name});
      marker.bindPopup(placePopupHtml(p));
      marker.on('click',()=>setTimeout(()=>revealPlaceCard(p.id),120));
      savedLayersByCity[p.cityId]?.addLayer(marker);
      savedMarkersById[p.id]=marker;
    });
    applyMapMode();
    renderRouteDaySelect();
    refreshIcons();
  }

  function showView(view, updateHash = true) {
    if (!['today','map','calendar','todo','packing','travel'].includes(view)) view='today';
    document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);
    document.body.dataset.activeView = view;
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===view)));
    if (updateHash && location.hash!==`#${view}`) history.replaceState(null,'',`#${view}`);
    if (view==='map') {
      if (!map) initMap();
      else requestAnimationFrame(applyMapMode);
    }
    if (view==='today') renderToday();
  }

  let draftData = null;
  let currentDay = 0;
  let currentLeg = 0;
  let currentCity = 0;
  let currentTodoDay = 0;
  let currentTodoItem = 0;

  function showStatus(message) {
    const status = $('#app-status');
    status.textContent = message;
    status.hidden = false;
    clearTimeout(showStatus.timer);
    showStatus.timer = setTimeout(() => { status.hidden = true; }, 5000);
  }

  function updateAccountUI() {
    const state = cloud?.state() || { configured:false, user:null, editor:false };
    const account = $('#account-button');
    const displayAccount = state.user?.email?.replace(/\.com$/i, '') || '';
    account.innerHTML = state.user ? `${icon('user-round')}<span>${escape(displayAccount)}</span>` : `${icon('log-in')}<span>登录</span>`;
    $('#edit-button').hidden = !state.editor;
    document.querySelectorAll('.section-edit').forEach(button => { button.hidden = !state.editor; });
    $('#login-form').hidden = Boolean(state.user);
    $('#account-panel').hidden = !state.user;
    if (state.user) {
      $('#account-email').textContent = displayAccount;
      $('#account-access').textContent = state.editor ? '已获得行程编辑权限。' : '账号已登录，但尚未加入本行程的编辑名单。';
    }
    if (!state.configured) $('#login-message').textContent = '登录后台尚未连接，完成云端配置后即可使用。';
    if (data.todoDays) renderTodo();
    if (data.bringLists) renderPacking();
    refreshTodoPopup();
    refreshIcons();
  }

  function openLogin() {
    updateAccountUI();
    if (!$('#login-dialog').open) $('#login-dialog').showModal();
    if (!$('#login-form').hidden) requestAnimationFrame(() => $('#login-email').focus());
  }

  function updateScheduleTarget() {
    const calendarTarget = $('#schedule-target').value !== 'todo';
    $('#schedule-sync-wrap').hidden = !calendarTarget;
  }

  function openSchedule(placeId) {
    const place = data.savedPlaces.find(item => item.id === placeId);
    if (!place) return;
    pendingPlace = place;
    if (!cloud?.state().editor) return openLogin();
    const city = cityById[place.cityId];
    const preferredDay = city?.dayIds?.[0] ?? 0;
    $('#schedule-place-name').textContent = `${city?.name || ''} · ${place.name}`;
    $('#schedule-day').innerHTML = data.days.map((day,index) => `<option value="${index}">${escape(day.date)} ${escape(day.week)} · ${escape(day.city)}</option>`).join('');
    $('#schedule-day').value = String(preferredDay);
    $('#schedule-target').value = 'todo';
    $('#schedule-time').value = '';
    $('#schedule-note').value = '';
    $('#schedule-sync-todo').checked = true;
    $('#schedule-message').textContent = '确认后将立即同步给所有协作成员与访客。';
    updateScheduleTarget();
    if (!$('#schedule-dialog').open) $('#schedule-dialog').showModal();
    refreshIcons();
  }

  async function saveScheduledPlace() {
    if (!pendingPlace || !cloud?.state().editor) return openLogin();
    const dayIndex = Number($('#schedule-day').value);
    const target = $('#schedule-target').value;
    const time = $('#schedule-time').value.trim();
    const note = $('#schedule-note').value.trim();
    const syncTodo = target !== 'todo' && $('#schedule-sync-todo').checked;
    const next = copy(data);
    const day = next.days[dayIndex];
    const todoDay = next.todoDays[dayIndex];
    const title = pendingPlace.name;
    let changed = false;

    if (target !== 'todo') {
      const calendarText = `${time ? `${time} ` : ''}${title}`;
      if (!normalizePlaceName(day[target]).includes(normalizePlaceName(title))) {
        day[target] = day[target] ? `${day[target]}；${calendarText}` : calendarText;
        changed = true;
      }
    }

    if (target === 'todo' || syncTodo) {
      const duplicate = todoDay.items.some(item => normalizePlaceName(item.title) === normalizePlaceName(title));
      if (!duplicate) {
        todoDay.items.push({
          time:time || ({am:'上午',pm:'下午',night:'晚上'}[target] || '时间待定'),
          title,
          maps:[[title,placeMapsQuery(pendingPlace)]],
          placeIds:[pendingPlace.id],
          note:note || '从收藏地点加入；详情与原备注见路线地图。',
          badge:placeCategory(pendingPlace)[0],
          sourceLabel:'',
          source:'',
          done:false
        });
        changed = true;
      }
    }

    const message = $('#schedule-message');
    if (!changed) {
      message.textContent = '该地点已存在于所选日期和板块中，无需重复添加。';
      return;
    }
    const button = $('#save-schedule');
    const payload = copy(next);
    delete payload.savedPlaces;
    payload.updated = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
    button.disabled = true;
    message.textContent = '正在保存…';
    try {
      await cloud.saveData(payload);
      next.updated = payload.updated;
      data = next;
      renderCalendar();
      renderTodo();
      renderCityDetail();
      $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
      $('#schedule-dialog').close();
      pendingPlace = null;
      showStatus(`${title} 已加入 ${data.days[dayIndex].date}。`);
    } catch (error) {
      message.textContent = error.message || '保存失败，请稍后重试。';
    } finally {
      button.disabled = false;
    }
  }

  function storeDay() {
    if (!draftData) return;
    const item = draftData.days[currentDay];
    document.querySelectorAll('[data-day-field]').forEach(el => { item[el.dataset.dayField] = el.value.trim(); });
  }

  function loadDay(index) {
    currentDay = Number(index);
    const item = draftData.days[currentDay];
    document.querySelectorAll('[data-day-field]').forEach(el => { el.value = item[el.dataset.dayField] ?? ''; });
  }

  function storeLeg() {
    if (!draftData) return;
    const item = draftData.legs[currentLeg];
    document.querySelectorAll('[data-leg-field]').forEach(el => {
      item[el.dataset.legField] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
  }

  function loadLeg(index) {
    currentLeg = Number(index);
    const item = draftData.legs[currentLeg];
    document.querySelectorAll('[data-leg-field]').forEach(el => {
      if (el.type === 'checkbox') el.checked = Boolean(item[el.dataset.legField]);
      else el.value = item[el.dataset.legField] ?? '';
    });
  }

  function storeCity() {
    if (!draftData) return;
    const item = draftData.cities[currentCity];
    document.querySelectorAll('[data-city-field]').forEach(el => {
      const field = el.dataset.cityField;
      if (field === 'highlights') item[field] = el.value.split(/[、,，]/).map(v => v.trim()).filter(Boolean);
      else if (field === 'nights') item[field] = Number(el.value || 0);
      else item[field] = el.value.trim();
    });
  }

  function loadCity(index) {
    currentCity = Number(index);
    const item = draftData.cities[currentCity];
    document.querySelectorAll('[data-city-field]').forEach(el => {
      const value = item[el.dataset.cityField];
      el.value = Array.isArray(value) ? value.join('、') : value ?? '';
    });
  }

  function todoItemLabel(item, index) {
    const title = item?.title || '未命名事项';
    return `${String(index + 1).padStart(2, '0')} · ${item?.time || '时间待定'} · ${title}`;
  }

  function refreshTodoItemSelect(preferredIndex = 0) {
    const day = draftData.todoDays[currentTodoDay];
    const select = $('#editor-todo-item-select');
    select.innerHTML = day.items.map((item,index) => `<option value="${index}">${escape(todoItemLabel(item,index))}</option>`).join('');
    currentTodoItem = Math.max(0, Math.min(Number(preferredIndex) || 0, day.items.length - 1));
    select.value = String(currentTodoItem);
    const hasItems = day.items.length > 0;
    select.disabled = !hasItems;
    $('#delete-todo-item').disabled = day.items.length <= 1;
    $('#move-todo-up').disabled = !hasItems || currentTodoItem === 0;
    $('#move-todo-down').disabled = !hasItems || currentTodoItem === day.items.length - 1;
  }

  function storeTodo() {
    if (!draftData) return;
    const item = draftData.todoDays?.[currentTodoDay]?.items?.[currentTodoItem];
    if (!item) return;
    document.querySelectorAll('[data-todo-field]').forEach(el => {
      item[el.dataset.todoField] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    item.maps = $('#editor-todo-maps').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/[|｜]/);
      const label = (parts.shift() || '').trim();
      const query = parts.join('|').trim() || label;
      return [label, query];
    }).filter(([label]) => label);
    item.placeIds = model.linkedPlaces(draftData,{...item,placeIds:[]},currentTodoDay).map(place => place.id);
  }

  function loadTodoItem(index) {
    currentTodoItem = Number(index) || 0;
    const item = draftData.todoDays[currentTodoDay].items[currentTodoItem];
    if (!item) return;
    document.querySelectorAll('[data-todo-field]').forEach(el => {
      if (el.type === 'checkbox') el.checked = Boolean(item[el.dataset.todoField]);
      else el.value = item[el.dataset.todoField] ?? '';
    });
    $('#editor-todo-maps').value = (item.maps || []).map(([label,query]) => `${label}｜${query}`).join('\n');
    refreshTodoItemSelect(currentTodoItem);
  }

  function loadTodoDay(index, itemIndex = 0) {
    currentTodoDay = Number(index) || 0;
    $('#editor-todo-day-select').value = String(currentTodoDay);
    refreshTodoItemSelect(itemIndex);
    loadTodoItem(currentTodoItem);
  }

  function addTodoItem() {
    storeTodo();
    const day = draftData.todoDays[currentTodoDay];
    const insertAt = currentTodoItem + 1;
    day.items.splice(insertAt, 0, { time:'', title:'新待办事项', maps:[], note:'', badge:'', sourceLabel:'', source:'', done:false });
    loadTodoDay(currentTodoDay, insertAt);
    $('[data-todo-field="title"]').select();
  }

  function deleteTodoItem() {
    const day = draftData.todoDays[currentTodoDay];
    if (day.items.length <= 1) return;
    day.items.splice(currentTodoItem, 1);
    loadTodoDay(currentTodoDay, Math.min(currentTodoItem, day.items.length - 1));
  }

  function moveTodoItem(direction) {
    storeTodo();
    const day = draftData.todoDays[currentTodoDay];
    const target = currentTodoItem + direction;
    if (target < 0 || target >= day.items.length) return;
    [day.items[currentTodoItem], day.items[target]] = [day.items[target], day.items[currentTodoItem]];
    loadTodoDay(currentTodoDay, target);
  }

  function storeCurrentEditorValues() {
    storeDay();
    storeTodo();
    storeLeg();
    storeCity();
  }

  function openEditor(initialTab = 'day') {
    if (!cloud?.state().editor) return openLogin();
    draftData = copy(data);
    $('#editor-account').textContent = cloud.state().user.email.replace(/\.com$/i, '');
    $('#editor-day-select').innerHTML = draftData.days.map((d,i) => `<option value="${i}">${escape(d.date)} ${escape(d.week)} · ${escape(d.city)}</option>`).join('');
    $('#editor-leg-select').innerHTML = draftData.legs.map((l,i) => `<option value="${i}">${escape(l.date)} · ${escape(l.code)} · ${escape(l.from)} → ${escape(l.to)}</option>`).join('');
    $('#editor-city-select').innerHTML = draftData.cities.map((c,i) => `<option value="${i}">${escape(c.name)} · ${escape(c.hotel)}</option>`).join('');
    $('#editor-todo-day-select').innerHTML = draftData.todoDays.map((d,i) => `<option value="${i}">${escape(d.date)} ${escape(d.week)}</option>`).join('');
    loadDay(0); loadTodoDay(0); loadLeg(0); loadCity(0);
    switchEditorTab(initialTab);
    $('#editor-message').textContent = '保存后所有访客都会看到最新内容。';
    if (!$('#editor-dialog').open) $('#editor-dialog').showModal();
    refreshIcons();
  }

  function switchEditorTab(tab) {
    document.querySelectorAll('[data-editor-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.editorTab === tab)));
    document.querySelectorAll('[data-editor-pane]').forEach(pane => { pane.hidden = pane.dataset.editorPane !== tab; });
  }

  document.addEventListener('click',event=>{
    const editLeg=event.target.closest('[data-edit-leg]'); if(editLeg) { const index=data.legs.findIndex(leg=>leg.id===editLeg.dataset.editLeg); if(index>=0) { if ($('#detail-dialog').open) $('#detail-dialog').close();openEditor('leg');$('#editor-leg-select').value=String(index);loadLeg(index); } }
    const jump=event.target.closest('[data-jump-todo-day]'); if(jump) { selectedTodoDay=Number(jump.dataset.jumpTodoDay); selectedTodoItem=Number(jump.dataset.jumpTodoItem || 0); renderTodo(); showView('todo'); if(jump.hasAttribute('data-jump-todo-item')) openTodoItem(selectedTodoDay,selectedTodoItem,true); else $('#todo-list')?.scrollIntoView({behavior:'smooth',block:'start'}); }
    const todayRoute=event.target.closest('[data-today-route]'); if(todayRoute) openTodayRoute(Number(todayRoute.dataset.todayRoute));
    const mapPlace=event.target.closest('[data-todo-map-place]'); if(mapPlace) { if ($('#detail-dialog').open) $('#detail-dialog').close(); todayRouteVisible=false;renderRouteDaySelect();showView('map'); requestAnimationFrame(()=>focusPlaceOnMap(mapPlace.dataset.todoMapPlace)); }
    const savedPlace=event.target.closest('[data-todo-saved-place]'); if(savedPlace) { const place=data.savedPlaces.find(item=>item.id===savedPlace.dataset.todoSavedPlace); if(place) { if ($('#detail-dialog').open) $('#detail-dialog').close(); showView('map'); selectCity(place.cityId); requestAnimationFrame(()=>revealPlaceCard(place.id)); } }
    const overview=event.target.closest('[data-city-overview]'); if(overview) showOverview();
    const city=event.target.closest('[data-city]'); if(city) selectCity(city.dataset.city);
    const placeFilterButton=event.target.closest('[data-place-filter]'); if(placeFilterButton) { placeFilter=placeFilterButton.dataset.placeFilter; renderCityDetail(); }
    const placePin=event.target.closest('[data-place-pin]'); if(placePin) updatePlaceDecision(placePin.dataset.placePin,{pinned:placePin.getAttribute('aria-pressed')!=='true'});
    const focusPlace=event.target.closest('[data-focus-place]'); if(focusPlace) focusPlaceOnMap(focusPlace.dataset.focusPlace);
    const schedulePlace=event.target.closest('[data-schedule-place]'); if(schedulePlace) openSchedule(schedulePlace.dataset.schedulePlace);
    const placeCard=event.target.closest('[data-place-card]'); if(placeCard&&!event.target.closest('a,button,select,label')) focusPlaceOnMap(placeCard.dataset.placeCard);
    const day=event.target.closest('[data-day]'); if(day) openDay(Number(day.dataset.day));
    const leg=event.target.closest('[data-leg]'); if(leg) openDialog(`${legById[leg.dataset.leg].date} · 交通详情`,legDetail(legById[leg.dataset.leg]));
    const view=event.target.closest('[data-view]'); if(view) showView(view.dataset.view);
    const todo=event.target.closest('[data-todo-day][data-todo-item]'); if(todo) toggleTodo(todo);
    const timelineItem=event.target.closest('[data-timeline-select]'); if(timelineItem&&!event.target.closest('a,button')) openTodoItem(selectedTodoDay,Number(timelineItem.dataset.timelineSelect),true);
    const flexibleItem=event.target.closest('.todo-flexible-item[data-timeline-select]'); if(flexibleItem) openTodoItem(selectedTodoDay,Number(flexibleItem.dataset.timelineSelect),true);
    const nearestItem=event.target.closest('[data-open-todo-day][data-open-todo-item]'); if(nearestItem) openTodoItem(Number(nearestItem.dataset.openTodoDay),Number(nearestItem.dataset.openTodoItem));
    const saveTodoText=event.target.closest('[data-save-todo-copy]'); if(saveTodoText) saveTodoCopy(saveTodoText);
    const removeTodoPlace=event.target.closest('[data-remove-inline-todo-place]'); if(removeTodoPlace) removeInlineTodoPlace(removeTodoPlace);
    const deleteTodo=event.target.closest('[data-delete-todo-day][data-delete-todo-item]'); if(deleteTodo) deleteTodoFromPopup(deleteTodo);
    const packingBag=event.target.closest('[data-packing-bag-index]'); if(packingBag) { selectedPackingBag=Number(packingBag.dataset.packingBagIndex); renderPacking(); }
    const packingFilter=event.target.closest('[data-packing-filter-pending]'); if(packingFilter) { packingShowPendingOnly=!packingShowPendingOnly; renderPacking(); }
    const packingFocus=event.target.closest('[data-packing-focus][data-packing-bag]'); if(packingFocus) focusPackingItem(packingFocus);
    const packingEdit=event.target.closest('[data-packing-edit][data-packing-bag]'); if(packingEdit) openPackingItemEditor(packingEdit);
    const packingToggle=event.target.closest('[data-packing-toggle][data-packing-bag]'); if(packingToggle) togglePackingItem(packingToggle);
    const packingVerify=event.target.closest('[data-packing-verify][data-packing-bag]'); if(packingVerify) verifyPackingItem(packingVerify);
    const packingShared=event.target.closest('[data-packing-shared][data-packing-bag]'); if(packingShared) togglePackingShared(packingShared);
    const packingGroup=event.target.closest('[data-packing-group][data-packing-bag]'); if(packingGroup) changePackingGroup(packingGroup);
    const packingMove=event.target.closest('[data-packing-move][data-packing-bag]'); if(packingMove) movePackingItem(packingMove);
    const packingDelete=event.target.closest('[data-packing-delete][data-packing-bag]'); if(packingDelete) deletePackingItem(packingDelete);
    const packingLogin=event.target.closest('[data-packing-login]'); if(packingLogin) openLogin();
    const todoAnchor=event.target.closest('[data-todo-anchor]'); if(todoAnchor) { selectedTodoDay=Number(todoAnchor.dataset.todoIndex); selectedTodoItem=0; renderTodo(); $('#todo-list')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}); }
    const editor=event.target.closest('[data-open-editor]'); if(editor) openEditor(editor.dataset.openEditor);
    const saved=event.target.closest('#saved-toggle,#show-saved'); if(saved) toggleSavedPlaces();
    const placeCity=event.target.closest('[data-place-city]'); if(placeCity) { selectCity(placeCity.dataset.placeCity); $('.leaflet-popup-close-button')?.click(); }
  });
  document.addEventListener('change',event=>{
    if (event.target.id === 'today-day-select') { selectedTodayDay=Number(event.target.value); sessionStorage.setItem('trek-selected-day',String(selectedTodayDay)); renderToday(); }
    if (event.target.id === 'route-day-select') { routeDayIndex=Number(event.target.value); todayRouteVisible=true; selected=null; savedVisible=false; renderCities(); renderCityDetail(); renderRouteDaySelect(); applyMapMode(); }
    const statusSelect=event.target.closest('[data-place-status]');
    if(statusSelect) updatePlaceDecision(statusSelect.dataset.placeStatus,{status:statusSelect.value});
    const todoPlaceSelect=event.target.closest('[data-inline-todo-place]');
    if(todoPlaceSelect) applyInlineTodoPlace(todoPlaceSelect);
  });
  document.addEventListener('submit',event=>{
    const packingEditForm=event.target.closest('[data-packing-edit-form][data-packing-bag]');
    if (packingEditForm) {
      event.preventDefault();
      savePackingItemEdit(packingEditForm);
      return;
    }
    const packingForm=event.target.closest('[data-packing-add]');
    if (!packingForm) return;
    event.preventDefault();
    addPackingItem(packingForm);
  });
  document.addEventListener('pointerdown',startTimelineDrag);
  document.addEventListener('pointerdown',startTimelineResize);
  document.addEventListener('pointerdown',startTimelineLongPress);
  document.addEventListener('pointerdown',startPackingDrag);
  document.addEventListener('pointermove',moveTimelineDrag,{passive:false});
  document.addEventListener('pointermove',moveTimelineResize,{passive:false});
  document.addEventListener('pointermove',moveTimelineLongPress,{passive:true});
  document.addEventListener('pointermove',movePackingDrag,{passive:false});
  document.addEventListener('pointerup',finishTimelineDrag);
  document.addEventListener('pointerup',finishTimelineResize);
  document.addEventListener('pointerup',clearTimelinePress);
  document.addEventListener('pointerup',finishPackingDrag);
  document.addEventListener('pointercancel',finishTimelineDrag);
  document.addEventListener('pointercancel',finishTimelineResize);
  document.addEventListener('pointercancel',clearTimelinePress);
  document.addEventListener('pointercancel',event=>finishPackingDrag(event,true));
  $('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>{openTodoPopup=null;previousFocus?.focus();});
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) event.currentTarget.close();}});
  $('#fit-map').addEventListener('click',showOverview);
  $('#route-day-toggle').addEventListener('click',()=>{todayRouteVisible=!todayRouteVisible;renderRouteDaySelect();applyMapMode();});
  $('#retry-map').addEventListener('click',()=>{if(map)tileLayer.redraw();else initMap();});
  $('#source-button').addEventListener('click',()=>openDialog('行程资料',`<div class="sources"><p><a href="${data.source}" target="_blank" rel="noopener">2026中秋国庆秋游中亚（UZB+KZ）</a></p><p>补充参考：《【大合辑】秋游中亚》；本对话提供的航班、火车截图与住宿信息。</p><h3>已收藏地点</h3><p><a href="${data.savedMapUpdated}" target="_blank" rel="noopener">打开 Google Maps 收藏清单（最新）</a><br><a href="${data.savedMap}" target="_blank" rel="noopener">打开另一份收藏地图</a><br>已导入 ${data.savedPlaces.length} 个地点；地图默认隐藏，点击图钉按钮查看。</p><h3>信息版本</h3><p>整理日期：${data.updated}。已确认交通以票务截图为准。网站为本次整理的快照，尚未与 Notion 建立自动同步。</p><h3>尚未锁定</h3><ul><li>10.02 希瓦至努库斯的叫车方式和时间。</li><li>10.03 阿克套骑马：档期、教练及费用。</li><li>10.04 曼格斯套一日游：路线及报名。</li></ul><h3>地图</h3><p>城市中心坐标和城市间示意连线，不作为驾车或步行导航。阿克套位于里海东岸。底图 © OpenStreetMap contributors。</p></div>`));
  $('#account-button').addEventListener('click', openLogin);
  $('#edit-button').addEventListener('click', () => openEditor('day'));
  $('#close-login').addEventListener('click', () => $('#login-dialog').close());
  $('#close-editor').addEventListener('click', () => $('#editor-dialog').close());
  $('#close-schedule').addEventListener('click', () => { pendingPlace=null; $('#schedule-dialog').close(); });
  $('#cancel-schedule').addEventListener('click', () => { pendingPlace=null; $('#schedule-dialog').close(); });
  $('#schedule-target').addEventListener('change', updateScheduleTarget);
  $('#schedule-form').addEventListener('submit', async event => { event.preventDefault(); await saveScheduledPlace(); });
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#login-form .primary-button');
    const message = $('#login-message');
    button.disabled = true;
    message.textContent = '正在登录…';
    try {
      const state = await cloud.login($('#login-email').value.trim(), $('#login-password').value);
      message.textContent = '';
      updateAccountUI();
      if (state.editor) {
        $('#login-dialog').close();
        showStatus('登录成功，现在可以编辑行程。');
        if (pendingPlace) openSchedule(pendingPlace.id);
      }
    } catch (error) {
      message.textContent = error.message === 'Invalid login credentials' ? '邮箱或密码不正确。' : (error.message || '登录失败，请检查邮箱和密码。');
    } finally { button.disabled = false; }
  });
  $('#logout-button').addEventListener('click', async () => {
    await cloud.logout();
    updateAccountUI();
    $('#login-dialog').close();
    showStatus('已退出登录。');
  });
  $('#editor-day-select').addEventListener('change', event => { storeDay(); loadDay(event.target.value); });
  $('#editor-todo-day-select').addEventListener('change', event => { storeTodo(); loadTodoDay(event.target.value); });
  $('#editor-todo-item-select').addEventListener('change', event => { storeTodo(); loadTodoItem(event.target.value); });
  $('#add-todo-item').addEventListener('click', addTodoItem);
  $('#delete-todo-item').addEventListener('click', deleteTodoItem);
  $('#move-todo-up').addEventListener('click', () => moveTodoItem(-1));
  $('#move-todo-down').addEventListener('click', () => moveTodoItem(1));
  $('#editor-leg-select').addEventListener('change', event => { storeLeg(); loadLeg(event.target.value); });
  $('#editor-city-select').addEventListener('change', event => { storeCity(); loadCity(event.target.value); });
  document.querySelectorAll('[data-editor-tab]').forEach(button => button.addEventListener('click', () => switchEditorTab(button.dataset.editorTab)));
  $('#editor-form').addEventListener('submit', event => event.preventDefault());
  $('#save-editor').addEventListener('click', async () => {
    const button = $('#save-editor');
    const message = $('#editor-message');
    storeCurrentEditorValues();
    const payload = copy(draftData);
    delete payload.savedPlaces;
    payload.updated = new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(new Date());
    button.disabled = true;
    message.textContent = '正在保存…';
    try {
      await cloud.saveData(payload);
      message.textContent = '保存成功，正在载入最新行程…';
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      message.textContent = error.message || '保存失败，请稍后重试。';
      button.disabled = false;
    }
  });
  window.addEventListener('hashchange',()=>showView(location.hash.slice(1),false));
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!$('#map-view').hidden)applyMapMode();},150);});
  renderCities();renderCityDetail();renderCalendar();renderTravel();renderPacking();renderToday();refreshIcons();renderRouteDaySelect();
  renderTodo();
  showView(location.hash.slice(1)||'today',false);
  $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
  updateAccountUI();
  if (cloudError) showStatus(`云端连接提示：${cloudError}`);
})();
