(async () => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = (value) => window.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const cloud = window.TrekCloud;
  const baseData = window.TREK_DATA;
  let cloudError = '';
  let remoteData = null;
  try {
    await cloud?.init();
    remoteData = await cloud?.loadData();
  } catch (error) {
    cloudError = error.message || '云端行程暂时无法读取';
  }
  const validRemote = remoteData?.cities?.length && remoteData?.legs?.length && remoteData?.days?.length;
  let data = validRemote ? { ...baseData, ...remoteData, savedPlaces: baseData.savedPlaces || [] } : baseData;
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
  let cityLayer;
  let savedLayer;
  let savedLayersByCity = {};
  let savedVisible = false;
  let mapTimeout;
  let previousFocus;

  const status = (leg) => `<span class="status ${leg.confirmed ? '' : 'pending'}">${leg.confirmed?'票务已确认':'待确认'}</span>`;
  const legTime = (leg) => `${escape(leg.dep)} → ${leg.nextDay?'次日 ':''}${escape(leg.arr)}`;
  const miniLeg = (leg) => `<button class="traffic-mini" data-leg="${leg.id}" title="${escape(leg.from)} → ${escape(leg.to)} · ${escape(leg.code)} ${legTime(leg)}">${icon(glyph[leg.mode])}<strong>${escape(leg.code)}</strong><span>${legTime(leg)}</span></button>`;
  const hotelLink = (c) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.hotel+' '+c.name+' '+c.country)}`;
  const googleMapsLink = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  let todoSaving = false;

  function renderCities() {
    $('#city-list').innerHTML = `<button class="city-stop overview-stop" data-city-overview aria-pressed="${selected===null}"><span class="stop-number">${icon('route')}</span><span><span class="stop-name">行程总览</span><span class="stop-meta">6 城 · 完整路线</span></span>${icon('chevron-right')}</button>` + data.cities.map((c,i)=>`<button class="city-stop" data-city="${c.id}" aria-pressed="${c.id===selected}" style="--stop-color:${c.color}"><span class="stop-number">${String(i+1).padStart(2,'0')}</span><span><span class="stop-name">${c.name}</span><span class="stop-meta">${c.dates} · ${c.nights} 晚</span></span>${icon('chevron-right')}</button>`).join('');
  }

  function placeCategory(place) {
    const value = `${place.name} ${place.note || ''}`.toLowerCase();
    if (/hotel|villas|apart|mercure|kosh havuz|住宿|酒店|民宿/.test(value)) return ['住宿','bed-double'];
    if (/airport|机场|station|stantsiya|火车站/.test(value)) return ['交通','train-front'];
    if (/restaurant|cafe|coffee|pizza|plov|osh|somsa|teahouse|bistro|gelato|抓饭|餐厅|烤包子|牛排|烤肉|烤鱼|冰激淋/.test(value)) return ['餐饮','utensils'];
    if (/museum|mosque|madrasah|palace|fortress|observatory|necropolis|cemetery|minaret|cathedral|monument|complex|registan|ark|陵墓|清真寺|博物馆|天文台|教堂|宫|塔|古城/.test(value)) return ['人文','landmark'];
    if (/bozor|bazar|market|workshop|jewelry|handicraft|ucell|7saber|集市|商店|纪念品|手工/.test(value)) return ['购物','shopping-bag'];
    return ['休闲','map-pin'];
  }

  function placeIntroduction(place, city) {
    const [category] = placeCategory(place);
    const descriptions = {
      '住宿': `位于${city.name}的住宿收藏点，可用于核对入住位置、周边交通与每日出发动线。`,
      '交通': `位于${city.name}的交通节点，可用于规划抵达、离开或换乘时的接驳路线。`,
      '餐饮': `位于${city.name}的餐饮收藏点，可结合当天游览区域安排用餐或中途休息。`,
      '人文': `位于${city.name}的历史文化参观点，适合结合开放时间与当天路线安排停留。`,
      '购物': `位于${city.name}的购物与生活收藏点，可用于采购、体验市集或寻找纪念品。`,
      '休闲': `位于${city.name}的休闲或实用收藏点，可作为城市漫步中的弹性停靠位置。`
    };
    return descriptions[category];
  }

  function placeMapsLink(place) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
  }

  function renderCityDetail() {
    if (!selected) {
      $('#city-detail').innerHTML = `<div class="route-overview-detail"><div><p class="detail-eyebrow">CENTRAL ASIA / 2026</p><div class="detail-title-row"><h2>六城路线总览</h2><span>塔什干 → 阿克套</span></div><p class="overview-copy">地图显示完整交通顺序。选择左侧城市后，地图会进入该城市视图，并展示当地全部收藏地点。</p></div><div class="overview-city-links">${data.cities.map((c,i)=>`<button type="button" data-city="${c.id}"><span>${String(i+1).padStart(2,'0')}</span>${escape(c.name)}${icon('arrow-right')}</button>`).join('')}</div></div>`;
      refreshIcons();
      return;
    }
    const c = cityById[selected];
    const next = data.legs.find(l=>l.map?.[0]===c.id);
    const localPlaces = data.savedPlaces.filter(p=>p.cityId===c.id);
    const side = c.id==='samarkand'
      ? `<figure class="city-photo"><img src="${photo.src}" width="1280" height="720" alt="撒马尔罕雷吉斯坦广场的三座经学院"><figcaption><a href="${photo.page}" target="_blank" rel="noopener">Ekrem Canli / Wikimedia Commons</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a> · 已裁切</figcaption></figure>`
      : `<div class="detail-side"><p><strong>${next?'下一程':'返程'}</strong><br>${next?escape(next.from)+' → '+escape(next.to):'阿克套 → 奇姆肯特 → 上海'}</p><small>${next?escape(next.date)+' · '+escape(next.code)+'<br>'+legTime(next):'10.05 · DV710 + DV461<br>10.06 04:55 抵达上海'}</small></div>`;
    const placeCards = localPlaces.map((p,index) => {
      const [category,categoryIcon] = placeCategory(p);
      return `<article class="saved-place-card"><div class="place-card-top"><span class="place-index">${String(index+1).padStart(2,'0')}</span><span class="place-category">${icon(categoryIcon)}${category}</span></div><h3>${escape(p.name)}</h3><p class="place-intro">${escape(placeIntroduction(p,c))}</p><div class="place-note"><strong>原备注</strong><p>${escape(p.note || '原收藏清单未填写备注。')}</p></div><a href="${placeMapsLink(p)}" target="_blank" rel="noopener">${icon('map-pin')}在 Google Maps 打开${icon('arrow-up-right')}</a></article>`;
    }).join('');
    $('#city-detail').innerHTML = `<div class="city-overview-grid"><div><p class="detail-eyebrow">${c.en} / ${c.country}</p><div class="detail-title-row"><h2>${c.name}</h2><span>${c.theme}</span></div><div class="highlights">${c.highlights.map(h=>`<span>${escape(h)}</span>`).join('')}</div><a class="hotel-line" href="${hotelLink(c)}" target="_blank" rel="noopener">${icon('bed-double')}${escape(c.hotel)}</a><div class="day-links">${c.dayIds.map(i=>`<button data-day="${i}">${data.days[i].date} ${data.days[i].week}${icon('arrow-up-right')}</button>`).join('')}</div></div>${side}</div><section class="saved-places-section"><div class="saved-summary"><div><strong>已收藏 ${localPlaces.length} 个地点</strong><span>逐项介绍、原备注与精确地图坐标</span></div><button id="show-saved" type="button">${icon(savedVisible?'map-pin-off':'map-pin')}${savedVisible?'隐藏地图标记':'显示地图标记'}</button></div><div class="saved-places-grid">${placeCards}</div></section>`;
    refreshIcons();
  }

  function selectCity(id, move = true) {
    if (!cityById[id]) return;
    selected = id;
    savedVisible = true;
    renderCities();
    renderCityDetail();
    if (move && map) applyMapMode();
  }

  function showOverview() {
    selected = null;
    savedVisible = false;
    renderCities();
    renderCityDetail();
    applyMapMode();
  }

  function legDetail(l) {
    return `<section class="dialog-leg"><h3>${icon(glyph[l.mode])}${escape(l.code)} ${status(l)}</h3><div class="leg-stations"><div><time>${escape(l.dep)}</time><span>${escape(l.from)}</span><small>${escape(l.originalFrom||'')}</small></div>${icon('arrow-right')}<div><time>${escape(l.arr)}</time><span>${escape(l.to)}</span><small>${l.nextDay?'10.06 次日抵达':escape(l.originalTo||'')}</small></div></div><p class="leg-note">${escape(l.date)}${l.duration?' · '+escape(l.duration):''}${l.who?' · '+escape(l.who):''}</p>${l.note?`<p class="leg-note">${escape(l.note)}</p>`:''}</section>`;
  }

  function openDialog(title, body) {
    previousFocus = document.activeElement;
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = body;
    refreshIcons();
    if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  }
  function openDay(index) {
    const d = data.days[index];
    openDialog(`${d.date} ${d.week} · Day ${index+1}`, `<p class="dialog-subtitle">${escape(d.city)}</p>${[['上午',d.am],['下午',d.pm],['晚上',d.night]].map(([k,v])=>`<div class="day-period"><span>${k}</span><p>${escape(v)}</p></div>`).join('')}<p class="leg-note">${escape(d.note)}</p><p class="dialog-hotel">${icon('bed-double')} ${escape(d.hotel)}</p>${d.legs.map(id=>legDetail(legById[id])).join('')}`);
  }

  function renderCalendar() {
    const cell = (text,cls='') => `<td><div class="cell-content"><span class="${cls}" title="${escape(text)}">${escape(text)}</span></div></td>`;
    const cityCell = (d) => `<td><div class="cell-content city-cell"><span class="city-cell-name" title="${escape(d.city)}">${escape(d.city)}</span>${d.local?`<span class="local-move">${escape(d.local)}</span>`:''}${d.legs.length?`<details class="traffic-details"><summary title="展开交通详情" aria-label="展开交通详情">${icon('route')}<span>${d.legs.length} 段交通</span></summary><div class="traffic-detail-list">${d.legs.map(id=>miniLeg(legById[id])).join('')}</div></details>`:''}</div></td>`;
    $('#calendar-body').innerHTML = data.days.map((d,i)=>`<tr><td><button class="date-button" data-day="${i}" title="查看 ${d.date} 完整日程"><strong>${d.date}</strong><small>${d.week} · Day ${i+1}</small><span>查看详情</span></button></td>${cityCell(d)}${cell(d.hotel)}${cell(d.am)}${cell(d.pm)}${cell(d.night)}${cell(d.note,'cell-note')}</tr>`).join('');
  }

  function renderTravel() {
    $('#transport-list').innerHTML = data.legs.map(l=>`<button class="transport-row" data-leg="${l.id}"><span class="transport-date">${l.date}</span><span class="transport-info"><strong>${icon(glyph[l.mode])}${escape(l.code)} ${status(l)}</strong><p>${escape(l.from)} → ${escape(l.to)}</p><p class="times">${legTime(l)}${l.who?' · '+escape(l.who):''}</p></span>${icon('chevron-right')}</button>`).join('');
    $('#hotel-list').innerHTML = data.cities.map((c,i)=>`<article class="hotel-row"><span class="number">0${i+1}</span><div><h4>${escape(c.hotel)}</h4><p>${c.name} · ${c.dates} · ${c.nights} 晚</p><a href="${hotelLink(c)}" target="_blank" rel="noopener">地图查找 ${icon('arrow-up-right')}</a></div></article>`).join('');
  }

  function renderTodo() {
    const days = data.todoDays || [];
    const total = days.reduce((sum,day) => sum + day.items.length, 0);
    const done = days.reduce((sum,day) => sum + day.items.filter(item => item.done).length, 0);
    const editor = Boolean(cloud?.state().editor);
    $('#todo-summary').innerHTML = `<strong>${done} / ${total}</strong><span>已完成</span><div class="todo-progress" aria-label="已完成 ${done} 项，共 ${total} 项"><i style="width:${total ? done/total*100 : 0}%"></i></div>`;
    $('#todo-day-nav').innerHTML = days.map(day => `<button type="button" data-todo-anchor="${day.id}"><strong>${escape(day.date)}</strong><span>${escape(day.week)}</span></button>`).join('');
    $('#todo-list').innerHTML = days.map(day => {
      const dayDone = day.items.filter(item => item.done).length;
      const rows = day.items.map((item,itemIndex) => {
        const maps = (item.maps || []).map(([label,query]) => `<a href="${googleMapsLink(query)}" target="_blank" rel="noopener">${icon('map-pin')}${escape(label)}</a>`).join('');
        const source = item.source ? `<a class="todo-source" href="${escape(item.source)}" target="_blank" rel="noopener">${escape(item.sourceLabel || '官方信息')}${icon('arrow-up-right')}</a>` : '';
        return `<article class="todo-item ${item.done?'is-done':''}"><time>${escape(item.time)}</time><div class="todo-task"><h3>${escape(item.title)}${item.badge?`<span>${escape(item.badge)}</span>`:''}</h3><div class="todo-maps">${maps}</div></div><button type="button" class="todo-state" data-todo-day="${day.id}" data-todo-item="${itemIndex}" aria-pressed="${Boolean(item.done)}" title="${editor?'切换完成状态':'登录后更新状态'}" ${todoSaving?'disabled':''}>${icon(item.done?'circle-check-big':'circle')}<span>${item.done?'已完成':'未完成'}</span></button><div class="todo-note"><p>${escape(item.note || '—')}</p>${source}</div></article>`;
      }).join('');
      return `<section class="todo-day" id="todo-${day.id}"><header><div><p>${escape(day.date)}</p><h2>${escape(day.week)}</h2></div><span>${dayDone} / ${day.items.length} 完成</span></header><div class="todo-column-labels"><span>时间</span><span>事项 / 地点</span><span>状态</span><span>备注</span></div>${rows}</section>`;
    }).join('');
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
    }
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
    updateMapTools();
    refreshIcons();
  }

  function toggleSavedPlaces() {
    if (!map || !selected) return;
    savedVisible = !savedVisible;
    applyMapMode();
  }

  function initMap() {
    if (!window.L) { $('#map-error').hidden=false; return; }
    map = L.map('map',{scrollWheelZoom:false,zoomSnap:0.25,minZoom:3,maxZoom:16});
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',crossOrigin:true}).addTo(map);
    tileLayer.on('tileload',()=>{clearTimeout(mapTimeout);$('#map-error').hidden=true;});
    mapTimeout=setTimeout(()=>{$('#map-error').hidden=false;},12000);
    routeLayer = L.layerGroup().addTo(map);
    cityLayer = L.layerGroup().addTo(map);
    data.legs.filter(l=>l.map).forEach(l=>{
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
    savedLayer = L.layerGroup();
    data.cities.forEach(city => { savedLayersByCity[city.id] = L.layerGroup(); });
    data.savedPlaces.forEach(p=>{
      const c=cityById[p.cityId];
      const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'saved-place-marker',html:`<div class="saved-pin" style="--pin-color:${c?.color||'#206b5c'}">${icon('map-pin')}</div>`,iconSize:[22,22],iconAnchor:[11,11]}),title:p.name});
      marker.bindPopup(`<h3>${escape(p.name)}</h3><p>${escape(p.note||'原收藏清单未填写备注。')}</p><a href="${placeMapsLink(p)}" target="_blank" rel="noopener">在 Google Maps 打开</a>`);
      savedLayer.addLayer(marker);
      savedLayersByCity[p.cityId]?.addLayer(marker);
    });
    applyMapMode();
    refreshIcons();
  }

  function showView(view, updateHash = true) {
    if (!['map','calendar','todo','travel'].includes(view)) view='map';
    document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===view)));
    if (updateHash && location.hash!==`#${view}`) history.replaceState(null,'',`#${view}`);
    if (view==='map') requestAnimationFrame(applyMapMode);
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
    refreshIcons();
  }

  function openLogin() {
    updateAccountUI();
    if (!$('#login-dialog').open) $('#login-dialog').showModal();
    if (!$('#login-form').hidden) requestAnimationFrame(() => $('#login-email').focus());
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
    const overview=event.target.closest('[data-city-overview]'); if(overview) showOverview();
    const city=event.target.closest('[data-city]'); if(city) selectCity(city.dataset.city);
    const day=event.target.closest('[data-day]'); if(day) openDay(Number(day.dataset.day));
    const leg=event.target.closest('[data-leg]'); if(leg) openDialog(`${legById[leg.dataset.leg].date} · 交通详情`,legDetail(legById[leg.dataset.leg]));
    const view=event.target.closest('[data-view]'); if(view) showView(view.dataset.view);
    const todo=event.target.closest('[data-todo-day][data-todo-item]'); if(todo) toggleTodo(todo);
    const todoAnchor=event.target.closest('[data-todo-anchor]'); if(todoAnchor) document.querySelector(`#todo-${todoAnchor.dataset.todoAnchor}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
    const editor=event.target.closest('[data-open-editor]'); if(editor) openEditor(editor.dataset.openEditor);
    const saved=event.target.closest('#saved-toggle,#show-saved'); if(saved) toggleSavedPlaces();
    const placeCity=event.target.closest('[data-place-city]'); if(placeCity) { selectCity(placeCity.dataset.placeCity); $('.leaflet-popup-close-button')?.click(); }
  });
  $('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>previousFocus?.focus());
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) event.currentTarget.close();}});
  $('#fit-map').addEventListener('click',showOverview);
  $('#retry-map').addEventListener('click',()=>{if(map)tileLayer.redraw();else initMap();});
  $('#source-button').addEventListener('click',()=>openDialog('行程资料',`<div class="sources"><p><a href="${data.source}" target="_blank" rel="noopener">2026中秋国庆秋游中亚（UZB+KZ）</a></p><p>补充参考：《【大合辑】秋游中亚》；本对话提供的航班、火车截图与住宿信息。</p><h3>已收藏地点</h3><p><a href="${data.savedMapUpdated}" target="_blank" rel="noopener">打开 Google Maps 收藏清单（最新）</a><br><a href="${data.savedMap}" target="_blank" rel="noopener">打开另一份收藏地图</a><br>已导入 ${data.savedPlaces.length} 个地点；地图默认隐藏，点击图钉按钮查看。</p><h3>信息版本</h3><p>整理日期：${data.updated}。已确认交通以票务截图为准。网站为本次整理的快照，尚未与 Notion 建立自动同步。</p><h3>尚未锁定</h3><ul><li>10.02 希瓦至努库斯的叫车方式和时间。</li><li>10.03 阿克套骑马：档期、教练及费用。</li><li>10.04 曼格斯套一日游：路线及报名。</li></ul><h3>地图</h3><p>城市中心坐标和城市间示意连线，不作为驾车或步行导航。阿克套位于里海东岸。底图 © OpenStreetMap contributors。</p></div>`));
  $('#account-button').addEventListener('click', openLogin);
  $('#edit-button').addEventListener('click', () => openEditor('day'));
  $('#close-login').addEventListener('click', () => $('#login-dialog').close());
  $('#close-editor').addEventListener('click', () => $('#editor-dialog').close());
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
      if (state.editor) { $('#login-dialog').close(); showStatus('登录成功，现在可以编辑行程。'); }
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
  renderCities();renderCityDetail();renderCalendar();renderTravel();refreshIcons();initMap();
  renderTodo();
  showView(location.hash.slice(1)||'map',false);
  $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
  updateAccountUI();
  if (cloudError) showStatus(`云端连接提示：${cloudError}`);
})();

