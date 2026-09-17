(() => {
  'use strict';
  const data = window.TREK_DATA;
  const $ = (s) => document.querySelector(s);
  const escape = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const glyph = { rail:'train-front', road:'car-front', flight:'plane' };
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const refreshIcons = () => window.lucide?.createIcons();
  const cityById = Object.fromEntries(data.cities.map(c => [c.id,c]));
  const legById = Object.fromEntries(data.legs.map(l => [l.id,l]));
  const photo = {src:'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/Registan_square_Samarkand.jpg/1280px-Registan_square_Samarkand.jpg',page:'https://commons.wikimedia.org/wiki/File:Registan_square_Samarkand.jpg'};
  let selected = 'samarkand';
  let map;
  let cityMarkers = {};
  let tileLayer;
  let savedLayer;
  let savedVisible = false;
  let mapTimeout;
  let previousFocus;

  const status = (leg) => `<span class="status ${leg.confirmed ? '' : 'pending'}">${leg.confirmed?'票务已确认':'待确认'}</span>`;
  const legTime = (leg) => `${escape(leg.dep)} → ${leg.nextDay?'次日 ':''}${escape(leg.arr)}`;
  const miniLeg = (leg) => `<button class="traffic-mini" data-leg="${leg.id}" title="${escape(leg.from)} → ${escape(leg.to)} · ${escape(leg.code)} ${legTime(leg)}">${icon(glyph[leg.mode])}<strong>${escape(leg.code)}</strong><span>${legTime(leg)}</span></button>`;
  const hotelLink = (c) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.hotel+' '+c.name+' '+c.country)}`;

  function renderCities() {
    $('#city-list').innerHTML = data.cities.map((c,i)=>`<button class="city-stop" data-city="${c.id}" aria-pressed="${c.id===selected}" style="--stop-color:${c.color}"><span class="stop-number">${String(i+1).padStart(2,'0')}</span><span><span class="stop-name">${c.name}</span><span class="stop-meta">${c.dates} · ${c.nights} 晚</span></span>${icon('chevron-right')}</button>`).join('');
  }

  function renderCityDetail() {
    const c = cityById[selected];
    const next = data.legs.find(l=>l.map?.[0]===c.id);
    const localPlaces = data.savedPlaces.filter(p=>p.cityId===c.id);
    const side = c.id==='samarkand'
      ? `<figure class="city-photo"><img src="${photo.src}" width="1280" height="720" alt="撒马尔罕雷吉斯坦广场的三座经学院"><figcaption><a href="${photo.page}" target="_blank" rel="noopener">Ekrem Canli / Wikimedia Commons</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener">CC BY-SA 3.0</a> · 已裁切</figcaption></figure>`
      : `<div class="detail-side"><p><strong>${next?'下一程':'返程'}</strong><br>${next?escape(next.from)+' → '+escape(next.to):'阿克套 → 奇姆肯特 → 上海'}</p><small>${next?escape(next.date)+' · '+escape(next.code)+'<br>'+legTime(next):'10.05 · DV710 + DV461<br>10.06 04:55 抵达上海'}</small></div>`;
    $('#city-detail').innerHTML = `<div><p class="detail-eyebrow">${c.en} / ${c.country}</p><div class="detail-title-row"><h2>${c.name}</h2><span>${c.theme}</span></div><div class="highlights">${c.highlights.map(h=>`<span>${escape(h)}</span>`).join('')}</div><a class="hotel-line" href="${hotelLink(c)}" target="_blank" rel="noopener">${icon('bed-double')}${escape(c.hotel)}</a><div class="day-links">${c.dayIds.map(i=>`<button data-day="${i}">${data.days[i].date} ${data.days[i].week}${icon('arrow-up-right')}</button>`).join('')}</div><div class="saved-summary"><div><strong>已收藏 ${localPlaces.length} 个地点</strong><span>景点、餐厅与实用点位</span></div><button id="show-saved" type="button">${icon('map-pin')}在地图显示</button></div><div class="saved-list">${localPlaces.slice(0,6).map(p=>`<span title="${escape(p.note)}">${escape(p.name)}</span>`).join('')}${localPlaces.length>6?`<small>+ ${localPlaces.length-6} 个地点</small>`:''}</div></div>${side}`;
    refreshIcons();
  }

  function selectCity(id, move = true) {
    if (!cityById[id]) return;
    selected = id;
    renderCities();
    renderCityDetail();
    Object.entries(cityMarkers).forEach(([key, marker])=>marker.getElement()?.querySelector('.map-pin')?.classList.toggle('active',key===id));
    if (move && map) map.panTo(cityById[id].coords, {animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});
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

  function fitMap() {
    if (!map) return;
    map.invalidateSize();
    map.fitBounds(data.cities.map(c=>c.coords), {paddingTopLeft:[46,50],paddingBottomRight:[70,70],animate:false});
  }

  function toggleSavedPlaces() {
    if (!map || !savedLayer) return;
    savedVisible = !savedVisible;
    if (savedVisible) savedLayer.addTo(map); else map.removeLayer(savedLayer);
    const button = $('#saved-toggle');
    if (button) { button.setAttribute('aria-pressed',String(savedVisible)); button.title = savedVisible ? '隐藏收藏地点' : '显示收藏地点'; button.setAttribute('aria-label',button.title); }
    const detailButton = $('#show-saved');
    if (detailButton) detailButton.innerHTML = `${icon('map-pin')}${savedVisible?'隐藏地图标记':'在地图显示'}`;
    refreshIcons();
  }

  function initMap() {
    if (!window.L) { $('#map-error').hidden=false; return; }
    map = L.map('map',{scrollWheelZoom:false,zoomSnap:0.25,minZoom:3,maxZoom:16});
    tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',crossOrigin:true}).addTo(map);
    tileLayer.on('tileload',()=>{clearTimeout(mapTimeout);$('#map-error').hidden=true;});
    mapTimeout=setTimeout(()=>{$('#map-error').hidden=false;},12000);
    data.legs.filter(l=>l.map).forEach(l=>{
      const a=cityById[l.map[0]].coords,b=cityById[l.map[1]].coords;
      const color=l.mode==='flight'?'#b95049':l.mode==='road'?'#99762c':'#206b5c';
      L.polyline([a,b],{color:'#fff',weight:7,opacity:.9,interactive:false}).addTo(map);
      L.polyline([a,b],{color,weight:3.5,dashArray:l.mode==='rail'?null:'6 7',opacity:.95}).addTo(map).bindPopup(`<h3>${escape(l.from)} → ${escape(l.to)}</h3>${escape(l.code)}<br>${l.date} · ${legTime(l)}`);
      const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      L.marker(midpoint,{icon:L.divIcon({className:'transport-marker',html:`<div class="transport-sticker ${l.mode}">${icon(glyph[l.mode])}<span>${l.mode==='road'?'时间待定':escape(l.code)}</span></div>`,iconSize:[80,27],iconAnchor:[40,13]}),title:`${l.code} ${l.from}至${l.to}`}).addTo(map).on('click',()=>openDialog(`${l.date} · 交通详情`,legDetail(l)));
    });
    data.cities.forEach((c,i)=>{
      const marker=L.marker(c.coords,{icon:L.divIcon({className:'city-marker',html:`<div class="map-pin ${c.id===selected?'active':''}" style="--pin-color:${c.color}">${i+1}</div>`,iconSize:[28,28],iconAnchor:[14,14]}),title:`${i+1}. ${c.name}`,zIndexOffset:100}).addTo(map);
      marker.bindTooltip(c.name,{permanent:true,direction:c.id==='samarkand'?'bottom':'top',offset:c.id==='samarkand'?[0,16]:[0,-14],className:'city-label'});
      marker.on('click',()=>selectCity(c.id,false));
      cityMarkers[c.id]=marker;
    });
    savedLayer = L.layerGroup();
    data.savedPlaces.forEach(p=>{
      const c=cityById[p.cityId];
      const marker=L.marker([p.lat,p.lon],{icon:L.divIcon({className:'saved-place-marker',html:`<div class="saved-pin" style="--pin-color:${c?.color||'#206b5c'}">${icon('map-pin')}</div>`,iconSize:[22,22],iconAnchor:[11,11]}),title:p.name});
      marker.bindPopup(`<h3>${escape(p.name)}</h3><p>${escape(p.note||'收藏地点')}</p><button type="button" data-place-city="${escape(p.cityId)}">查看${escape(c?.name||'城市')}详情</button>`);
      savedLayer.addLayer(marker);
    });
    fitMap();
    refreshIcons();
  }

  function showView(view, updateHash = true) {
    if (!['map','calendar','travel'].includes(view)) view='map';
    document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`${view}-view`);
    document.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.view===view)));
    if (updateHash && location.hash!==`#${view}`) history.replaceState(null,'',`#${view}`);
    if (view==='map') requestAnimationFrame(fitMap);
  }

  document.addEventListener('click',event=>{
    const city=event.target.closest('[data-city]'); if(city) selectCity(city.dataset.city);
    const day=event.target.closest('[data-day]'); if(day) openDay(Number(day.dataset.day));
    const leg=event.target.closest('[data-leg]'); if(leg) openDialog(`${legById[leg.dataset.leg].date} · 交通详情`,legDetail(legById[leg.dataset.leg]));
    const view=event.target.closest('[data-view]'); if(view) showView(view.dataset.view);
    const saved=event.target.closest('#saved-toggle,#show-saved'); if(saved) toggleSavedPlaces();
    const placeCity=event.target.closest('[data-place-city]'); if(placeCity) { selectCity(placeCity.dataset.placeCity); $('.leaflet-popup-close-button')?.click(); }
  });
  $('#close-dialog').addEventListener('click',()=>$('#detail-dialog').close());
  $('#detail-dialog').addEventListener('close',()=>previousFocus?.focus());
  $('#detail-dialog').addEventListener('click',event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) event.currentTarget.close();}});
  $('#fit-map').addEventListener('click',fitMap);
  $('#retry-map').addEventListener('click',()=>{if(map)tileLayer.redraw();else initMap();});
  $('#source-button').addEventListener('click',()=>openDialog('行程资料',`<div class="sources"><p><a href="${data.source}" target="_blank" rel="noopener">2026中秋国庆秋游中亚（UZB+KZ）</a></p><p>补充参考：《【大合辑】秋游中亚》；本对话提供的航班、火车截图与住宿信息。</p><h3>已收藏地点</h3><p><a href="${data.savedMapUpdated}" target="_blank" rel="noopener">打开 Google Maps 收藏清单（最新）</a><br><a href="${data.savedMap}" target="_blank" rel="noopener">打开另一份收藏地图</a><br>已导入 ${data.savedPlaces.length} 个地点；地图默认隐藏，点击图钉按钮查看。</p><h3>信息版本</h3><p>整理日期：${data.updated}。已确认交通以票务截图为准。网站为本次整理的快照，尚未与 Notion 建立自动同步。</p><h3>尚未锁定</h3><ul><li>10.02 希瓦至努库斯的叫车方式和时间。</li><li>10.03 阿克套骑马：档期、教练及费用。</li><li>10.04 曼格斯套一日游：路线及报名。</li></ul><h3>地图</h3><p>城市中心坐标和城市间示意连线，不作为驾车或步行导航。阿克套位于里海东岸。底图 © OpenStreetMap contributors。</p></div>`));
  window.addEventListener('hashchange',()=>showView(location.hash.slice(1),false));
  let resizeTimer;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!$('#map-view').hidden)fitMap();},150);});
  renderCities();renderCityDetail();renderCalendar();renderTravel();refreshIcons();initMap();
  showView(location.hash.slice(1)||'map',false);
  $('#updated-label').textContent=`行程版本 ${data.updated} · 时间均为当地时间`;
})();

