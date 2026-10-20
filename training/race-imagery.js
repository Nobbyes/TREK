/* Public race imagery catalog. Personal race records are never stored here. */
(() => {
 'use strict';
 const E=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 function asset(r){
  const title=(r?.name||'')+' '+(r?.dossier?.officialName||'');
  const key=/玉环|穿越山海/i.test(title)?'yuhuan':/巴黎|paris/i.test(title)?'paris':/PDA|Peades|阿兰谷|Aran/i.test(title)?'pda':/柏林|berlin/i.test(title)?'berlin':/厦门|xiamen/i.test(title)?'xiamen':null;
  return window.JinshanPhotoAssets?.races?.[key]||window.JinshanPhotoAssets?.sections?.[r?.type==='trail'?'trail':'road'];
 }
 function media(r,{eager=false}={}){
  const a=asset(r);if(!a?.src)return '';
  return `<div class="race-photo" aria-hidden="true"><img class="race-photograph" src="${E(a.src)}" alt="" width="${a.width||1200}" height="${a.height||800}" loading="${eager?'eager':'lazy'}" decoding="async" style="object-position:${E(a.position||'50% 50%')}"><div class="race-photo-shade"></div></div>`;
 }
 function credit(r){
  const a=asset(r);if(!a?.src)return '';
  const url=a.sourcePage;const safe=typeof url==='string'&&/^https:\/\//.test(url);
  return `<div class="race-photo-credit"><span>${E(a.caption||'训练场景示意')}</span>${safe?`<a href="${E(url)}" target="_blank" rel="noopener noreferrer" title="${E(a.credit||'图片来源')}">影像来源 ↗</a>`:''}</div>`;
 }
 function mini(r){const a=asset(r);return a?.src?`<span class="race-mini-photo" aria-hidden="true"><img class="race-photograph" src="${E(a.src)}" alt="" width="${a.width||1200}" height="${a.height||800}" loading="lazy" decoding="async" style="object-position:${E(a.position||'50% 50%')}"></span>`:'';}
 document.addEventListener('error',event=>{if(event.target?.classList?.contains('race-photograph'))event.target.parentElement.classList.add('image-failed');},true);
 window.JinshanRaceArt={asset,media,credit,mini};
})();
