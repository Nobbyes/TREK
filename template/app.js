(() => {
  'use strict';

  const KEY = 'trek-template:';
  const RECENT = 'trek-template-recent';
  const $ = (selector) => document.querySelector(selector);
  const uid = () => crypto.randomUUID();
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const button = (label, action, id, iconName = 'pencil') => `<button type="button" class="icon-button" data-action="${action}" data-id="${esc(id)}" title="${label}" aria-label="${label}">${icon(iconName)}</button>`;
  const dayLabel = (date) => new Intl.DateTimeFormat('zh-CN', {month:'numeric',day:'numeric',weekday:'short'}).format(new Date(`${date}T12:00:00`));
  const displayDate = (date) => date ? dayLabel(date) : '未设置';
  const datesBetween = (start, end) => {
    const dates = [];
    const current = new Date(`${start}T12:00:00`);
    const last = new Date(`${end}T12:00:00`);
    while (current <= last && dates.length <= 90) {
      dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };
  const mapsUrl = (name, url) => {
    if (/^https:\/\//i.test(url || '')) return url;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  };
  const validId = (value) => /^[a-f0-9-]{36}$/i.test(value || '');
  const normalizeAccount = (value) => {
    const account = String(value || '').trim().toLowerCase();
    const at = account.lastIndexOf('@');
    return at > 0 && !account.slice(at + 1).includes('.') ? `${account}.com` : account;
  };

  let trip = null;
  let selectedDate = '';
  let view = 'calendar';
  let map = null;
  let mapLayers = null;
  let cloud = {client:null,user:null,editor:false,published:false,updatedAt:null,dirty:false,conflict:false,busy:false};
  let cloudTimer = null;
  let toastTimer = null;

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
  }

  function refreshIcons() {
    window.lucide?.createIcons();
  }

  function remember(id) {
    const ids = JSON.parse(localStorage.getItem(RECENT) || '[]').filter(item => item !== id);
    localStorage.setItem(RECENT, JSON.stringify([id, ...ids].slice(0, 12)));
  }

  function saveLocal(dirty = true) {
    if (!trip) return;
    cloud.dirty = dirty;
    localStorage.setItem(`${KEY}${trip.id}`, JSON.stringify({trip,dirty,published:cloud.published,updatedAt:cloud.updatedAt}));
    remember(trip.id);
    render();
    if (dirty && cloud.published && cloud.editor && !cloud.conflict) scheduleCloudSave();
  }

  function loadLocal(id) {
    try {
      return JSON.parse(localStorage.getItem(`${KEY}${id}`) || 'null');
    } catch {
      return null;
    }
  }

  function makeTrip(values) {
    const dates = datesBetween(values.start, values.end);
    if (!dates.length || dates.length > 90) throw new Error('请选择 1 至 90 天的日期范围');
    return {
      version:1, id:uid(), title:values.title.trim(), start:values.start, end:values.end,
      people:[values.person1.trim() || '旅行者 1', values.person2.trim() || '旅行者 2'],
      useCities:values.cities, useMap:values.cities && values.map,
      cities:[], days:dates.map(date => ({date,cityId:'',hotel:'',note:''})),
      events:[], legs:[], packing:[]
    };
  }

  function isValidTrip(value) {
    return value && value.version === 1 && validId(value.id) && typeof value.title === 'string' &&
      typeof value.start === 'string' && typeof value.end === 'string' &&
      Array.isArray(value.people) && Array.isArray(value.cities) && Array.isArray(value.days) &&
      Array.isArray(value.events) && Array.isArray(value.legs) && Array.isArray(value.packing);
  }

  function currentDay() {
    return trip?.days.find(day => day.date === selectedDate) || trip?.days[0];
  }

  function cityName(id) {
    return trip.cities.find(city => city.id === id)?.name || '';
  }

  function setView(next) {
    if (next === 'cities' && !trip.useCities) next = 'settings';
    view = next;
    document.querySelectorAll('[data-view]').forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.view === view)));
    document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== `${view}-view`);
    location.hash = view;
    if (view === 'cities' && trip.useMap) requestAnimationFrame(renderMap);
  }

  function render() {
    $('#workspace').hidden = !trip;
    $('#empty-workspace').hidden = Boolean(trip);
    $('#export-trip').disabled = !trip;
    if (!trip) {
      renderRecent();
      refreshIcons();
      return;
    }
    if (!trip.days.some(day => day.date === selectedDate)) selectedDate = trip.days[0]?.date || '';
    $('#trip-title').textContent = trip.title;
    $('#trip-dates').textContent = `${trip.start} — ${trip.end}`;
    $('#trip-subtitle').textContent = `${trip.people.join(' · ')} · ${trip.days.length} 天${trip.useCities ? ` · ${trip.cities.length} 城` : ''}`;
    $('#sync-state').textContent = cloud.conflict ? '云端版本冲突' : cloud.busy ? '同步中' : cloud.published ? (cloud.dirty ? '本机改动待同步' : '云端已同步') : '仅保存在本机';
    document.querySelector('[data-view="cities"]').hidden = !trip.useCities;
    renderCalendar();
    renderTimeline();
    renderTravel();
    renderCities();
    renderPacking();
    renderSettings();
    setView(view);
    refreshIcons();
  }

  function renderRecent() {
    const ids = JSON.parse(localStorage.getItem(RECENT) || '[]');
    let area = $('#recent-trips');
    if (!area) {
      area = document.createElement('div');
      area.id = 'recent-trips';
      area.className = 'recent-trips';
      $('#empty-workspace').append(area);
    }
    const entries = ids.map(id => loadLocal(id)?.trip).filter(isValidTrip);
    area.innerHTML = entries.length ? `<h2>本机行程</h2>${entries.map(item => `<button type="button" data-open-trip="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.start)} — ${esc(item.end)}</span>${icon('arrow-right')}</button>`).join('')}` : '';
  }

  function eventCard(item) {
    const place = item.place ? `<a href="${esc(mapsUrl(item.place,item.mapUrl))}" target="_blank" rel="noopener noreferrer">${icon('map-pin')}${esc(item.place)}</a>` : '';
    return `<article class="event-row ${item.done ? 'is-done' : ''}">
      <div class="event-time">${esc(item.start || '待定')}${item.end ? `<small>${esc(item.end)}</small>` : ''}</div>
      <div class="event-main"><h4>${esc(item.title)}</h4>${place}${item.note ? `<p>${esc(item.note)}</p>` : ''}</div>
      <div class="event-actions"><button type="button" class="check-button ${item.done ? 'checked' : ''}" data-action="toggle-event" data-id="${esc(item.id)}" aria-label="${item.done ? '标记未完成' : '标记完成'}" title="${item.done ? '标记未完成' : '标记完成'}">${icon(item.done ? 'check' : 'circle')}</button>${button('编辑事项','edit-event',item.id)}</div>
    </article>`;
  }

  function renderCalendar() {
    $('#day-strip').innerHTML = trip.days.map((day, index) => `<button type="button" data-day="${esc(day.date)}" aria-pressed="${day.date === selectedDate}"><small>第 ${index + 1} 天</small><strong>${esc(dayLabel(day.date))}</strong></button>`).join('');
    const day = currentDay();
    if (!day) return;
    const events = trip.events.filter(item => item.date === day.date).sort((a,b) => (a.start || '').localeCompare(b.start || ''));
    const city = trip.useCities && day.cityId ? cityName(day.cityId) : '';
    $('#calendar-content').innerHTML = `<div class="day-heading"><div><p class="eyebrow">${esc(dayLabel(day.date))}</p><h3>${city ? esc(city) : '当日安排'}</h3><p>${day.hotel ? `${icon('bed-double')}${esc(day.hotel)}` : '住宿待填写'}</p></div>${button('编辑当日','edit-day',day.date)}</div>
      ${day.note ? `<p class="day-note">${esc(day.note)}</p>` : ''}
      <div class="day-events">${events.length ? events.map(eventCard).join('') : '<div class="empty-state">这一天还没有事项。</div>'}</div>
      <button type="button" class="add-line" data-action="add-event" data-id="${esc(day.date)}">${icon('plus')}添加当日事项</button>`;
  }

  function renderTimeline() {
    $('#timeline-content').innerHTML = trip.days.map(day => {
      const events = trip.events.filter(item => item.date === day.date).sort((a,b) => (a.start || '').localeCompare(b.start || ''));
      return `<section class="timeline-day"><div class="timeline-date"><div><h3>${esc(dayLabel(day.date))}</h3>${trip.useCities && day.cityId ? `<span>${esc(cityName(day.cityId))}</span>` : ''}</div><button type="button" class="icon-button" data-action="add-event" data-id="${esc(day.date)}" title="添加事项" aria-label="添加事项">${icon('plus')}</button></div>
        ${events.length ? events.map(eventCard).join('') : '<p class="quiet">暂无事项</p>'}</section>`;
    }).join('');
  }

  function renderTravel() {
    const legs = [...trip.legs].sort((a,b) => `${a.date}${a.dep}`.localeCompare(`${b.date}${b.dep}`));
    const stays = trip.days.filter(day => day.hotel);
    const modeIcon = {flight:'plane',rail:'train-front',road:'car',ship:'ship',other:'route'};
    $('#travel-content').innerHTML = `<div class="travel-grid"><section><h3>交通 <span>${legs.length}</span></h3>${legs.length ? legs.map(leg => `<article class="travel-row">
      <span class="mode-icon">${icon(modeIcon[leg.mode] || 'route')}</span><div><small>${esc(displayDate(leg.date))} · ${esc(leg.code || '未填写班次')}</small><strong>${esc(leg.from)} → ${esc(leg.to)}</strong><p>${esc(leg.dep || '待定')} — ${esc(leg.arr || '待定')}${leg.confirmed ? ' · 已确认' : ' · 待确认'}</p></div>${button('编辑交通','edit-leg',leg.id)}</article>`).join('') : '<p class="empty-state">尚无交通安排。</p>'}</section>
      <section><h3>住宿 <span>${stays.length}</span></h3>${stays.length ? stays.map(day => `<article class="travel-row"><span class="mode-icon">${icon('bed-double')}</span><div><small>${esc(displayDate(day.date))}</small><strong>${esc(day.hotel)}</strong>${trip.useCities && day.cityId ? `<p>${esc(cityName(day.cityId))}</p>` : ''}</div>${button('编辑住宿','edit-day',day.date)}</article>`).join('') : '<p class="empty-state">住宿可在日历中逐日填写。</p>'}</section></div>`;
  }

  function renderCities() {
    $('#cities-subtitle').textContent = trip.useMap ? '城市与路线示意' : '城市清单';
    $('#cities-content').innerHTML = trip.cities.length ? `<div class="city-grid">${trip.cities.map((city,index) => `<article class="city-row"><span class="city-index">${String(index + 1).padStart(2,'0')}</span><div><h3>${esc(city.name)}</h3><p>${esc(city.country || '')}</p></div>${index ? button('向前移动','move-city-up',city.id,'arrow-up') : ''}${index < trip.cities.length - 1 ? button('向后移动','move-city-down',city.id,'arrow-down') : ''}<a class="icon-button" href="${esc(mapsUrl(`${city.name} ${city.country}`,city.mapUrl))}" target="_blank" rel="noopener noreferrer" title="在 Google Maps 打开" aria-label="在 Google Maps 打开">${icon('external-link')}</a>${button('编辑城市','edit-city',city.id)}</article>`).join('')}</div>` : '<p class="empty-state">尚未添加城市。</p>';
    $('#map-wrap').hidden = !trip.useMap;
    if (view === 'cities' && trip.useMap) requestAnimationFrame(renderMap);
  }

  function renderMap() {
    if (!trip?.useMap || view !== 'cities' || !window.L) return;
    if (!map) {
      map = L.map('city-map', {scrollWheelZoom:false}).setView([24,20],2);
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:18,attribution:'© OpenStreetMap contributors'}).addTo(map);
      tiles.on('tileload',() => { $('#map-status').hidden = true; });
      tiles.on('tileerror',() => { $('#map-status').hidden = false; });
      mapLayers = L.layerGroup().addTo(map);
      map.on('click', event => openCity(null,{lat:event.latlng.lat.toFixed(5),lon:event.latlng.lng.toFixed(5)}));
    }
    mapLayers.clearLayers();
    const located = trip.cities.filter(city => Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon)) && city.lat !== '' && city.lon !== '');
    const coords = located.map(city => [Number(city.lat),Number(city.lon)]);
    located.forEach((city,index) => L.marker(coords[index],{icon:L.divIcon({className:'city-map-marker',html:`<span>${index + 1}</span>`,iconSize:[30,30],iconAnchor:[15,15]})}).addTo(mapLayers).bindPopup(`<strong>${esc(city.name)}</strong><br>${esc(city.country || '')}`));
    if (coords.length > 1) L.polyline(coords,{color:'#c56b51',weight:3,dashArray:'6 7'}).addTo(mapLayers);
    map.invalidateSize();
    if (coords.length === 1) map.setView(coords[0],9);
    if (coords.length > 1) map.fitBounds(coords,{padding:[30,30],maxZoom:9});
  }

  function packingRow(item) {
    return `<div class="packing-row ${item.packed ? 'is-done' : ''}">
      <button type="button" class="check-button ${item.packed ? 'checked' : ''}" data-action="toggle-packed" data-id="${esc(item.id)}" title="${item.packed ? '取消装包' : '标记已装'}" aria-label="${item.packed ? '取消装包' : '标记已装'}">${icon(item.packed ? 'check' : 'circle')}</button>
      <span class="packing-name">${esc(item.name)}${item.shared ? `<small>共用 · ${esc(trip.people[item.owner] || '')} 提供</small>` : ''}</span>
      ${item.shared ? `<button type="button" class="verify-button ${item.verified ? 'verified' : ''}" data-action="toggle-verified" data-id="${esc(item.id)}" title="另一人复核" aria-label="另一人复核">${icon('check-check')}</button>` : ''}
      <button type="button" class="icon-button" data-action="toggle-zone" data-id="${esc(item.id)}" title="切换随身／背包" aria-label="切换随身／背包">${icon(item.zone === 'carry' ? 'backpack' : 'handbag')}</button>
      ${button('编辑物品','edit-item',item.id)}
    </div>`;
  }

  function renderPacking() {
    const packed = trip.packing.filter(item => item.packed).length;
    $('#packing-count').textContent = `${packed} / ${trip.packing.length} 已装`;
    const shared = trip.packing.filter(item => item.shared);
    $('#packing-content').innerHTML = `${shared.length ? `<section class="shared-section"><h3>${icon('pin')}共用物品</h3>${shared.map(packingRow).join('')}</section>` : ''}
      <div class="bag-grid">${trip.people.map((person,index) => `<section class="bag-section"><h3>${icon('backpack')}${esc(person)}</h3>
        <h4>背包</h4>${trip.packing.filter(item => item.owner === index && item.zone !== 'carry').map(packingRow).join('') || '<p class="quiet">暂无物品</p>'}
        <h4>随身携带</h4>${trip.packing.filter(item => item.owner === index && item.zone === 'carry').map(packingRow).join('') || '<p class="quiet">暂无物品</p>'}</section>`).join('')}</div>`;
  }

  function renderSettings() {
    $('#settings-content').innerHTML = `<div class="settings-grid"><form id="settings-form" class="settings-panel">
      <h3>基本信息</h3><label>行程名称<input name="title" maxlength="60" required value="${esc(trip.title)}"></label>
      <div class="form-pair"><label>开始日期<input name="start" type="date" required value="${esc(trip.start)}"></label><label>结束日期<input name="end" type="date" required value="${esc(trip.end)}"></label></div>
      <label>同行者（每行一人）<textarea name="people" rows="3">${esc(trip.people.join('\n'))}</textarea></label>
      <label class="switch-row"><span><strong>启用城市</strong><small>可关联到日程</small></span><input name="cities" type="checkbox" role="switch" ${trip.useCities ? 'checked' : ''}></label>
      <label class="switch-row"><span><strong>启用路线地图</strong><small>需先启用城市</small></span><input name="map" type="checkbox" role="switch" ${trip.useMap ? 'checked' : ''}></label>
      <p id="settings-error" class="form-error" role="alert"></p><button class="primary-button" type="submit">${icon('save')}保存设置</button>
    </form><section class="settings-panel"><h3>数据与协作</h3>
      <p class="settings-state">${cloud.published ? '此行程已发布，可使用专属链接查看。' : '此行程目前只保存在这台设备。'}</p>
      <div class="settings-actions"><button type="button" data-action="publish" class="primary-button">${icon('cloud-upload')}${cloud.published ? '立即同步' : '发布协作链接'}</button>
      ${cloud.published ? `<button type="button" data-action="copy-link" class="secondary-button">${icon('link')}复制链接</button>` : ''}
      <button type="button" data-action="export" class="secondary-button">${icon('download')}导出备份</button>
      <button type="button" data-action="import" class="secondary-button">${icon('upload')}导入备份为新行程</button></div>
      <p class="settings-warning">发布后，持有链接的人可以浏览行程；授权账号登录后可以编辑。未发布时请定期导出备份。</p>
    </section></div>`;
    $('#settings-form').addEventListener('submit', saveSettings);
  }

  function openDialog(title, html, onSubmit) {
    $('#dialog-title').textContent = title;
    $('#dialog-content').innerHTML = html;
    $('#editor-dialog').showModal();
    const form = $('#dialog-content form');
    if (form && onSubmit) form.addEventListener('submit', onSubmit);
    refreshIcons();
    form?.querySelector('input:not([type="hidden"])')?.focus();
  }

  function closeDialog() {
    $('#editor-dialog').close();
  }

  function formValue(form, name) {
    return String(new FormData(form).get(name) || '').trim();
  }

  function openDay(date) {
    const day = trip.days.find(item => item.date === date);
    if (!day) return;
    openDialog('编辑当日', `<form class="dialog-form"><p class="eyebrow">${esc(dayLabel(day.date))}</p>
      ${trip.useCities ? `<label>城市<select name="cityId"><option value="">不指定</option>${trip.cities.map(city => `<option value="${esc(city.id)}" ${day.cityId === city.id ? 'selected' : ''}>${esc(city.name)}</option>`).join('')}</select></label>` : ''}
      <label>住宿地点<input name="hotel" maxlength="100" value="${esc(day.hotel)}" placeholder="酒店或住处"></label>
      <label>当日备注<textarea name="note" rows="3" maxlength="600">${esc(day.note)}</textarea></label>
      <button class="primary-button" type="submit">${icon('save')}保存</button></form>`, event => {
      event.preventDefault();
      day.cityId = trip.useCities ? formValue(event.target,'cityId') : day.cityId;
      day.hotel = formValue(event.target,'hotel');
      day.note = formValue(event.target,'note');
      closeDialog();
      saveLocal();
    });
  }

  function openEvent(id, date = selectedDate) {
    const item = trip.events.find(event => event.id === id);
    const data = item || {date,start:'',end:'',title:'',place:'',mapUrl:'',note:'',done:false};
    openDialog(item ? '编辑事项' : '添加事项', `<form class="dialog-form">
      <label>日期<select name="date">${trip.days.map(day => `<option value="${esc(day.date)}" ${day.date === data.date ? 'selected' : ''}>${esc(dayLabel(day.date))}</option>`).join('')}</select></label>
      <div class="form-pair"><label>开始<input name="start" type="time" value="${esc(data.start)}"></label><label>结束<input name="end" type="time" value="${esc(data.end)}"></label></div>
      <label>事项<input name="title" required maxlength="120" value="${esc(data.title)}"></label>
      <label>地点<input name="place" maxlength="120" value="${esc(data.place)}" placeholder="可不填写"></label>
      <label>Google Maps 链接<input name="mapUrl" type="url" value="${esc(data.mapUrl)}" placeholder="https://"></label>
      <label>备注<textarea name="note" rows="3" maxlength="800">${esc(data.note)}</textarea></label>
      <div class="dialog-actions"><button class="primary-button" type="submit">${icon('save')}保存</button>${item ? `<button type="button" class="danger-button" data-delete="event" data-id="${esc(item.id)}">${icon('trash-2')}删除</button>` : ''}</div></form>`, event => {
      event.preventDefault();
      const form = event.target;
      const start = formValue(form,'start');
      const end = formValue(form,'end');
      if (start && end && end <= start) return toast('结束时间应晚于开始时间');
      const next = {id:item?.id || uid(),date:formValue(form,'date'),start,end,title:formValue(form,'title'),place:formValue(form,'place'),mapUrl:formValue(form,'mapUrl'),note:formValue(form,'note'),done:item?.done || false};
      if (item) Object.assign(item,next); else trip.events.push(next);
      selectedDate = next.date;
      closeDialog();
      saveLocal();
    });
  }

  function openCity(id, coords = {}) {
    const city = trip.cities.find(item => item.id === id);
    const data = city || {name:'',country:'',lat:coords.lat || '',lon:coords.lon || '',mapUrl:''};
    openDialog(city ? '编辑城市' : '添加城市', `<form class="dialog-form">
      <label>城市名称<input name="name" required maxlength="80" value="${esc(data.name)}"></label>
      <label>国家／地区<input name="country" maxlength="80" value="${esc(data.country)}"></label>
      <div class="form-pair"><label>纬度<input name="lat" type="number" min="-90" max="90" step="any" value="${esc(data.lat)}"></label><label>经度<input name="lon" type="number" min="-180" max="180" step="any" value="${esc(data.lon)}"></label></div>
      <label>Google Maps 链接<input name="mapUrl" type="url" value="${esc(data.mapUrl)}" placeholder="https://"></label>
      <div class="dialog-actions"><button type="submit" class="primary-button">${icon('save')}保存</button>${city ? `<button type="button" class="danger-button" data-delete="city" data-id="${esc(city.id)}">${icon('trash-2')}删除</button>` : ''}</div></form>`, event => {
      event.preventDefault();
      const form = event.target;
      const lat = formValue(form,'lat');
      const lon = formValue(form,'lon');
      if (Boolean(lat) !== Boolean(lon)) return toast('经纬度请同时填写');
      const next = {id:city?.id || uid(),name:formValue(form,'name'),country:formValue(form,'country'),lat,lon,mapUrl:formValue(form,'mapUrl')};
      if (city) Object.assign(city,next); else trip.cities.push(next);
      closeDialog();
      saveLocal();
    });
  }

  function openLeg(id) {
    const leg = trip.legs.find(item => item.id === id);
    const data = leg || {date:selectedDate,mode:'flight',code:'',from:'',to:'',dep:'',arr:'',confirmed:false};
    openDialog(leg ? '编辑交通' : '添加交通', `<form class="dialog-form">
      <label>日期<select name="date">${trip.days.map(day => `<option value="${esc(day.date)}" ${day.date === data.date ? 'selected' : ''}>${esc(dayLabel(day.date))}</option>`).join('')}</select></label>
      <div class="form-pair"><label>方式<select name="mode">${[['flight','飞机'],['rail','火车'],['road','汽车'],['ship','船'],['other','其他']].map(([value,label]) => `<option value="${value}" ${data.mode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>航班／车次<input name="code" maxlength="40" value="${esc(data.code)}"></label></div>
      <div class="form-pair"><label>出发地<input name="from" required maxlength="80" value="${esc(data.from)}"></label><label>到达地<input name="to" required maxlength="80" value="${esc(data.to)}"></label></div>
      <div class="form-pair"><label>出发<input name="dep" type="time" value="${esc(data.dep)}"></label><label>到达<input name="arr" type="time" value="${esc(data.arr)}"></label></div>
      <label class="checkbox-row"><input name="confirmed" type="checkbox" ${data.confirmed ? 'checked' : ''}>已确认／已购票</label>
      <div class="dialog-actions"><button class="primary-button" type="submit">${icon('save')}保存</button>${leg ? `<button type="button" class="danger-button" data-delete="leg" data-id="${esc(leg.id)}">${icon('trash-2')}删除</button>` : ''}</div></form>`, event => {
      event.preventDefault();
      const form = event.target;
      const next = {id:leg?.id || uid(),date:formValue(form,'date'),mode:formValue(form,'mode'),code:formValue(form,'code'),from:formValue(form,'from'),to:formValue(form,'to'),dep:formValue(form,'dep'),arr:formValue(form,'arr'),confirmed:new FormData(form).has('confirmed')};
      if (leg) Object.assign(leg,next); else trip.legs.push(next);
      closeDialog();
      saveLocal();
    });
  }

  function openItem(id) {
    const item = trip.packing.find(entry => entry.id === id);
    const data = item || {name:'',owner:0,zone:'bag',shared:false,packed:false,verified:false};
    openDialog(item ? '编辑物品' : '添加物品', `<form class="dialog-form">
      <label>物品名称<input name="name" required maxlength="90" value="${esc(data.name)}"></label>
      <label>由谁携带<select name="owner">${trip.people.map((person,index) => `<option value="${index}" ${data.owner === index ? 'selected' : ''}>${esc(person)}</option>`).join('')}</select></label>
      <label>放置位置<select name="zone"><option value="bag" ${data.zone === 'bag' ? 'selected' : ''}>背包</option><option value="carry" ${data.zone === 'carry' ? 'selected' : ''}>随身携带</option></select></label>
      <label class="checkbox-row"><input name="shared" type="checkbox" ${data.shared ? 'checked' : ''}>共用物品（另一人复核）</label>
      <div class="dialog-actions"><button class="primary-button" type="submit">${icon('save')}保存</button>${item ? `<button type="button" class="danger-button" data-delete="item" data-id="${esc(item.id)}">${icon('trash-2')}删除</button>` : ''}</div></form>`, event => {
      event.preventDefault();
      const form = event.target;
      const next = {id:item?.id || uid(),name:formValue(form,'name'),owner:Number(formValue(form,'owner')),zone:formValue(form,'zone'),shared:new FormData(form).has('shared'),packed:item?.packed || false,verified:item?.verified || false};
      if (item) Object.assign(item,next); else trip.packing.push(next);
      closeDialog();
      saveLocal();
    });
  }

  function saveSettings(event) {
    event.preventDefault();
    const form = event.target;
    const start = formValue(form,'start');
    const end = formValue(form,'end');
    const dates = datesBetween(start,end);
    const error = $('#settings-error');
    if (!dates.length || dates.length > 90) { error.textContent = '请选择 1 至 90 天的日期范围'; return; }
    const outside = trip.events.some(item => !dates.includes(item.date)) ||
      trip.legs.some(item => !dates.includes(item.date)) ||
      trip.days.some(day => !dates.includes(day.date) && (day.hotel || day.note || day.cityId));
    if (outside) { error.textContent = '范围外仍有事项或交通，请先调整它们的日期'; return; }
    const people = formValue(form,'people').split('\n').map(value => value.trim()).filter(Boolean);
    if (!people.length || people.length > 8) { error.textContent = '请填写 1 至 8 位同行者'; return; }
    if (trip.packing.some(item => item.owner >= people.length)) {
      error.textContent = '有物品仍归属于被移除的同行者，请先转移物品';
      return;
    }
    const cities = new FormData(form).has('cities');
    const mapEnabled = new FormData(form).has('map');
    trip.title = formValue(form,'title');
    trip.start = start;
    trip.end = end;
    trip.people = people;
    trip.useCities = cities || mapEnabled;
    trip.useMap = mapEnabled;
    trip.days = dates.map(date => trip.days.find(day => day.date === date) || {date,cityId:'',hotel:'',note:''});
    trip.packing.forEach(item => { if (item.owner >= people.length) item.owner = 0; });
    saveLocal();
    toast('行程设置已保存');
  }

  function downloadTrip() {
    if (!trip) return;
    const blob = new Blob([JSON.stringify(trip,null,2)],{type:'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `trek-${trip.start}-backup.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href),1000);
  }

  async function importTrip(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (!isValidTrip(parsed)) throw new Error('不是有效的 TREK 行程备份');
      trip = structuredClone(parsed);
      trip.id = uid();
      cloud = {...cloud,published:false,updatedAt:null,dirty:false,conflict:false};
      selectedDate = trip.days[0]?.date || '';
      history.pushState({},'',`?trip=${trip.id}#calendar`);
      view = 'calendar';
      saveLocal(false);
      toast('已作为新行程导入');
    } catch (error) {
      toast(error.message);
    }
  }

  async function initCloud() {
    const cfg = window.TREK_BACKEND || {};
    if (!cfg.url || !cfg.publishableKey || !window.supabase?.createClient) return;
    cloud.client = window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
    try {
      const {data} = await cloud.client.auth.getSession();
      cloud.user = data.session?.user || null;
      await checkEditor();
    } catch (error) {
      console.warn('协作账号暂不可用',error);
    }
  }

  async function checkEditor() {
    cloud.editor = false;
    if (!cloud.user || !cloud.client) return;
    const {data,error} = await cloud.client.from('trek_editors').select('email').limit(1).maybeSingle();
    if (error) throw error;
    cloud.editor = Boolean(data);
  }

  async function loadCloud(id) {
    if (!cloud.client || !validId(id)) return null;
    const {data,error} = await cloud.client.from('trek_itineraries').select('content,updated_at').eq('slug',`journey-${id}`).maybeSingle();
    if (error) throw error;
    if (!data || !isValidTrip(data.content) || data.content.id !== id) return null;
    return data;
  }

  async function publishTrip() {
    if (!trip) return;
    if (!cloud.client) return toast('协作服务暂不可用，请先导出备份');
    if (!cloud.editor) { openAccount(); return; }
    if (cloud.conflict) return toast('云端已有其他人的更新。请先导出本机备份，再重新打开共享链接');
    if (cloud.busy) return;
    cloud.busy = true;
    render();
    try {
      const payload = {slug:`journey-${trip.id}`,content:trip,updated_at:new Date().toISOString(),updated_by:cloud.user.email};
      const query = cloud.updatedAt
        ? cloud.client.from('trek_itineraries').update(payload).eq('slug',payload.slug).eq('updated_at',cloud.updatedAt).select('updated_at').maybeSingle()
        : cloud.client.from('trek_itineraries').insert(payload).select('updated_at').single();
      const {data,error} = await query;
      if (error) throw error;
      if (!data) throw new Error('云端已有更新。请先备份本机版本，再重新打开共享链接。');
      cloud.updatedAt = data.updated_at;
      cloud.published = true;
      cloud.dirty = false;
      localStorage.setItem(`${KEY}${trip.id}`,JSON.stringify({trip,dirty:false,published:true,updatedAt:cloud.updatedAt}));
      toast('已同步到云端');
    } catch (error) {
      toast(error.code === '23505' ? '云端已有这个行程，请打开共享链接后再编辑' : error.message);
    } finally {
      cloud.busy = false;
      render();
    }
  }

  function scheduleCloudSave() {
    clearTimeout(cloudTimer);
    cloudTimer = setTimeout(publishTrip,700);
  }

  function openAccount() {
    $('#account-content').innerHTML = cloud.user ? `<p class="account-state">已登录：<strong>${esc(cloud.user.email)}</strong></p><p>${cloud.editor ? '可编辑和发布共享行程' : '此账号没有编辑权限'}</p><button type="button" id="logout-button" class="secondary-button">${icon('log-out')}退出登录</button>` :
      `<form id="login-form" class="dialog-form"><label>账号<input name="account" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><p id="login-error" class="form-error" role="alert"></p><button type="submit" class="primary-button">${icon('log-in')}登录</button></form>`;
    $('#account-dialog').showModal();
    refreshIcons();
    $('#login-form')?.addEventListener('submit',async event => {
      event.preventDefault();
      if (!cloud.client) { $('#login-error').textContent = '协作服务暂不可用'; return; }
      const form = event.target;
      const {data,error} = await cloud.client.auth.signInWithPassword({email:normalizeAccount(formValue(form,'account')),password:formValue(form,'password')});
      if (error) { $('#login-error').textContent = error.message; return; }
      cloud.user = data.user;
      try { await checkEditor(); } catch (accessError) { $('#login-error').textContent = accessError.message; return; }
      $('#account-dialog').close();
      toast(cloud.editor ? '已登录，可协作编辑' : '已登录，但没有编辑权限');
      render();
    });
    $('#logout-button')?.addEventListener('click',async () => {
      await cloud.client?.auth.signOut();
      cloud.user = null;
      cloud.editor = false;
      $('#account-dialog').close();
      render();
    });
  }

  function removeEntity(type,id) {
    const labels = {event:'事项',city:'城市',leg:'交通',item:'物品'};
    if (!confirm(`确定删除这条${labels[type]}吗？`)) return;
    if (type === 'event') trip.events = trip.events.filter(item => item.id !== id);
    if (type === 'leg') trip.legs = trip.legs.filter(item => item.id !== id);
    if (type === 'item') trip.packing = trip.packing.filter(item => item.id !== id);
    if (type === 'city') {
      trip.cities = trip.cities.filter(item => item.id !== id);
      trip.days.forEach(day => { if (day.cityId === id) day.cityId = ''; });
    }
    closeDialog();
    saveLocal();
  }

  document.addEventListener('click',event => {
    const dayButton = event.target.closest('[data-day]');
    if (dayButton) { selectedDate = dayButton.dataset.day; renderCalendar(); refreshIcons(); return; }
    const opener = event.target.closest('[data-open-trip]');
    if (opener) { location.href = `?trip=${opener.dataset.openTrip}#calendar`; return; }
    const deletion = event.target.closest('[data-delete]');
    if (deletion) { removeEntity(deletion.dataset.delete,deletion.dataset.id); return; }
    const target = event.target.closest('[data-action]');
    if (!target || !trip) return;
    const {action,id} = target.dataset;
    if (action === 'edit-day') openDay(id);
    if (action === 'add-event') openEvent(null,id);
    if (action === 'edit-event') openEvent(id);
    if (action === 'edit-city') openCity(id);
    if (action === 'move-city-up' || action === 'move-city-down') {
      const index = trip.cities.findIndex(city => city.id === id);
      const next = index + (action === 'move-city-up' ? -1 : 1);
      if (index >= 0 && next >= 0 && next < trip.cities.length) {
        [trip.cities[index],trip.cities[next]] = [trip.cities[next],trip.cities[index]];
        saveLocal();
      }
    }
    if (action === 'edit-leg') openLeg(id);
    if (action === 'edit-item') openItem(id);
    if (action === 'toggle-event') { const item = trip.events.find(entry => entry.id === id); if (item) { item.done = !item.done; saveLocal(); } }
    if (action === 'toggle-packed' || action === 'toggle-verified' || action === 'toggle-zone') {
      const item = trip.packing.find(entry => entry.id === id);
      if (item) {
        if (action === 'toggle-packed') item.packed = !item.packed;
        if (action === 'toggle-verified') item.verified = !item.verified;
        if (action === 'toggle-zone') item.zone = item.zone === 'carry' ? 'bag' : 'carry';
        saveLocal();
      }
    }
    if (action === 'publish') publishTrip();
    if (action === 'copy-link') navigator.clipboard.writeText(location.href).then(() => toast('共享链接已复制')).catch(() => toast('复制失败，请从地址栏复制'));
    if (action === 'export') downloadTrip();
    if (action === 'import') $('#import-file').click();
  });

  document.querySelectorAll('[data-view]').forEach(tab => tab.addEventListener('click',() => setView(tab.dataset.view)));
  $('#create-form').addEventListener('submit',event => {
    event.preventDefault();
    const form = event.target;
    try {
      trip = makeTrip({
        title:formValue(form,'title'),start:formValue(form,'start'),end:formValue(form,'end'),
        person1:formValue(form,'person1'),person2:formValue(form,'person2'),
        cities:new FormData(form).has('cities'),map:new FormData(form).has('map')
      });
      cloud = {...cloud,published:false,updatedAt:null,dirty:false,conflict:false};
      selectedDate = trip.start;
      view = 'calendar';
      history.pushState({},'',`?trip=${trip.id}#calendar`);
      saveLocal(false);
    } catch (error) { $('#create-error').textContent = error.message; }
  });
  $('#new-trip').addEventListener('click',() => {
    if (trip && !confirm('新建一份空白行程？当前行程会留在本机或已发布的链接中。')) return;
    trip = null;
    view = 'calendar';
    history.pushState({},'',location.pathname);
    render();
  });
  $('#export-trip').addEventListener('click',downloadTrip);
  $('#add-event-global').addEventListener('click',() => openEvent(null,selectedDate));
  $('#add-leg').addEventListener('click',() => openLeg(null));
  $('#add-city').addEventListener('click',() => openCity(null));
  $('#add-item').addEventListener('click',() => openItem(null));
  $('#close-editor').addEventListener('click',closeDialog);
  $('#close-account').addEventListener('click',() => $('#account-dialog').close());
  $('#account-button').addEventListener('click',openAccount);
  $('#import-file').addEventListener('change',event => { if (event.target.files[0]) importTrip(event.target.files[0]); event.target.value = ''; });
  $('#create-form [name="map"]').addEventListener('change',event => { if (event.target.checked) $('#create-form [name="cities"]').checked = true; });
  $('#editor-dialog').addEventListener('click',event => { if (event.target === $('#editor-dialog')) closeDialog(); });
  $('#account-dialog').addEventListener('click',event => { if (event.target === $('#account-dialog')) $('#account-dialog').close(); });

  async function boot() {
    await initCloud();
    const params = new URLSearchParams(location.search);
    const id = params.get('trip');
    const local = validId(id) ? loadLocal(id) : null;
    if (local && isValidTrip(local.trip)) {
      trip = local.trip;
      cloud.published = Boolean(local.published);
      cloud.updatedAt = local.updatedAt || null;
      cloud.dirty = Boolean(local.dirty);
    }
    if (validId(id)) {
      try {
        const remote = await loadCloud(id);
        if (remote) {
          if (cloud.dirty && trip) {
            cloud.conflict = cloud.updatedAt !== remote.updated_at;
            if (cloud.conflict) toast('云端有较新版本，本机改动未覆盖；请先导出备份');
          } else {
            trip = remote.content;
            cloud.updatedAt = remote.updated_at;
          }
          cloud.published = true;
          if (!cloud.dirty) localStorage.setItem(`${KEY}${id}`,JSON.stringify({trip,dirty:false,published:true,updatedAt:cloud.updatedAt}));
          remember(id);
        }
      } catch (error) {
        if (!trip) toast('暂时无法读取共享行程');
      }
    }
    selectedDate = trip?.days[0]?.date || '';
    view = ['calendar','timeline','travel','cities','packing','settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calendar';
    render();
  }
  boot();
})();
