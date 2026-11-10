/* Original upstream media only. No media files are mirrored or stored by this app. */
(() => {
  'use strict';
  const COMMIT='7455efae41b330c265e7cd4b78dfa848e7ce5ebd';
  const LIBRARY='https://duartesantos8.github.io/openGym/#/library';
  const SOURCE='https://github.com/hasaneyldrm/exercises-dataset';
  const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let context={isAuthenticated:()=>false},expanded=null,previousFocus=null;
  const active=new Map();
  const authenticated=()=>{try{return context.isAuthenticated()===true}catch{return false}};
  function resolve(id){
    if(!authenticated()||typeof id!=='string'||! /^(?:og-\d{4}|ex\d+|routine-[a-z-]+)$/.test(id))return null;
    const data=window.WildExerciseDemosData;if(data?.schemaVersion!==1||data.commit!==COMMIT)return null;
    const key=/^og-\d{4}$/.test(id)?id:Object.hasOwn(data.aliases||{},id)?data.aliases[id]:null;
    if(typeof key!=='string'||!/^og-\d{4}$/.test(key)||!Object.hasOwn(data.items||{},key))return null;
    const item=data.items[key];if(!item||item.kind!=='gif'||!/^\d{4}$/.test(item.sourceId)||key!=='og-'+item.sourceId||typeof item.name!=='string'||item.name.length>200)return null;
    try{
      const gif=new URL(item.url),poster=new URL(item.poster),prefix=`/hasaneyldrm/exercises-dataset/${COMMIT}/`;
      if([gif,poster].some(u=>u.origin!=='https://raw.githubusercontent.com'||u.username||u.password||u.search||u.hash))return null;
      const match=gif.pathname.match(new RegExp('^'+prefix+'videos/('+item.sourceId+'-[A-Za-z0-9_-]+)\\.gif$'));
      if(!match||poster.pathname!==prefix+'images/'+match[1]+'.jpg')return null;
      return {id,key,name:item.name,url:gif.href,poster:poster.href,sourceId:item.sourceId,libraryUrl:LIBRARY};
    }catch{return null}
  }
  function badge(id){return resolve(id)?'<span class="demo-badge">▶ 原库演示</span>':''}
  function thumbnail(id){const x=resolve(id);return x?`<span class="demo-library-preview"><img data-demo-thumb src="${E(x.poster)}" width="180" height="180" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${E(x.name)} · 原库静态预览"><span>▶ 查看演示 · © Gym visual</span></span>`:''}
  function card(id,options={}){
    const x=resolve(id);if(!x)return '';
    return `<section class="exercise-demo${options.focus?' exercise-demo--focus':''}" data-exercise-demo="${E(id)}" data-demo-blocked="${options.paused?'true':'false'}"><header><strong>openGym 动作演示</strong><span>原图 180 × 180</span></header><div class="demo-stage"><img data-demo-poster src="${E(x.poster)}" width="180" height="180" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="${E(x.name)} · 静态示意"></div><div class="demo-controls"><button type="button" data-demo-action="play" aria-pressed="false" ${options.paused?'disabled':''}>播放演示</button><button type="button" data-demo-action="expand">放大查看</button></div><p class="demo-status" role="status">${options.paused?'训练已暂停；演示保持静止。':'点按后播放；暂停会停止动画，重新播放从头开始。'}</p><p class="demo-count-note">动画仅供动作参考，组次由本人确认。</p><small class="demo-credit">© Gym visual — <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">gymvisual.com</a> · 个人自用<br><a href="${LIBRARY}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">原站动作库 ↗</a><button type="button" data-demo-action="copy">复制英文名</button><span class="demo-source-name">${E(x.name)}</span></small></section>`;
  }
  function status(section,text){const out=section.querySelector('.demo-status');if(out)out.textContent=text}
  function stop(section,text='演示已暂停，当前为静态图；重新播放将从头开始。'){
    const record=active.get(section);if(record){record.cancelled=true;record.image.onload=null;record.image.onerror=null;record.image.removeAttribute('src');record.image.remove();active.delete(section)}
    section.querySelectorAll('[data-demo-playing]').forEach(img=>{img.removeAttribute('src');img.remove()});
    const poster=section.querySelector('[data-demo-poster]');if(poster)poster.hidden=poster.dataset.demoFailed==='true';
    const button=section.querySelector('[data-demo-action="play"]');if(button){button.textContent='重新播放';button.setAttribute('aria-pressed','false')}
    section.removeAttribute('data-demo-playing-state');status(section,text);
  }
  function stopAll(root=document){for(const section of [...active.keys()])if(root===document||root===section||root.contains(section))stop(section)}
  function play(section){
    const x=resolve(section.dataset.exerciseDemo);if(!x){stop(section,'当前未登录或演示来源未通过检查，未加载媒体。');return}
    if(document.hidden||section.dataset.demoBlocked==='true'){stop(section,'训练或页面已暂停；演示保持静止。');return}
    if(active.has(section)){stop(section);return}
    stopAll();const stage=section.querySelector('.demo-stage');if(!stage)return;
    const image=document.createElement('img'),record={image,cancelled:false};active.set(section,record);
    image.setAttribute('data-demo-playing','');image.width=180;image.height=180;image.alt=x.name+' · 动作演示';image.referrerPolicy='no-referrer';image.decoding='async';
    const button=section.querySelector('[data-demo-action="play"]');if(button){button.textContent='暂停演示';button.setAttribute('aria-pressed','true')}
    section.setAttribute('data-demo-playing-state','loading');status(section,'正在加载原库演示；计时与组次不受影响。');
    image.onload=()=>{if(record.cancelled||!section.isConnected)return;if(document.hidden||!authenticated()||section.dataset.demoBlocked==='true'){stop(section);return}const poster=section.querySelector('[data-demo-poster]');if(poster)poster.hidden=true;section.setAttribute('data-demo-playing-state','playing');status(section,'正在播放；请按自己的动作节奏训练，完成后本人确认组次。')};
    image.onerror=()=>{if(!record.cancelled){stop(section,'演示加载失败，文字说明与已有训练不受影响。可打开原站动作库，按下方英文名查找。');const retry=section.querySelector('[data-demo-action="play"]');if(retry)retry.textContent='重试播放'}};
    stage.append(image);image.src=x.url;
  }
  function closeExpanded(){if(!expanded)return;stopAll(expanded);const old=expanded;expanded=null;old.close();old.remove();previousFocus?.focus?.();previousFocus=null}
  function expand(section){
    const id=section.dataset.exerciseDemo,x=resolve(id);if(!x)return;stopAll();closeExpanded();previousFocus=document.activeElement;
    expanded=document.createElement('dialog');expanded.className='demo-expanded';expanded.setAttribute('aria-label',x.name+' · 动作演示');
    expanded.innerHTML=`<div class="demo-expanded-head"><h2>${E(x.name)}</h2><button type="button" data-demo-close aria-label="关闭放大演示">✕</button></div>${card(id,{paused:section.dataset.demoBlocked==='true'})}<p class="demo-size-note">原图保持原始比例与水印，不放大超过原有分辨率。</p>`;
    const dialog=expanded;dialog.querySelector('[data-demo-close]').onclick=closeExpanded;dialog.addEventListener('cancel',event=>{event.preventDefault();closeExpanded()});dialog.addEventListener('close',()=>{if(expanded===dialog)closeExpanded();else stopAll(dialog)});document.body.append(dialog);dialog.showModal();
  }
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-demo-action]');if(!button)return;const section=button.closest('[data-exercise-demo]');if(!section)return;
    const action=button.dataset.demoAction;if(action==='play')play(section);if(action==='expand')expand(section);
    if(action==='copy'){const x=resolve(section.dataset.exerciseDemo);if(!x)return;try{await navigator.clipboard.writeText(x.name);button.textContent='英文名已复制'}catch{status(section,'请选取下方英文名，前往原站动作库搜索。')}}
  });
  document.addEventListener('error',event=>{const image=event.target;if(!image.matches?.('[data-demo-thumb],[data-demo-poster]'))return;image.hidden=true;image.dataset.demoFailed='true';const section=image.closest('[data-exercise-demo]');if(section)status(section,'静态预览未能加载；可尝试播放演示或前往原站，动作文字说明仍可使用。');else{const label=image.closest('.demo-library-preview')?.querySelector('span');if(label)label.textContent='预览未加载 · 查看演示'}},true);
  document.addEventListener('close',event=>{if(event.target.matches?.('dialog'))stopAll(event.target)},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAll()});window.addEventListener('pagehide',()=>stopAll());
  new MutationObserver(()=>{for(const section of [...active.keys()])if(!section.isConnected)stop(section)}).observe(document.documentElement,{childList:true,subtree:true});
  window.WildDemos={configure:value=>{context={...context,...value};if(!authenticated())stopAll()},has:id=>!!resolve(id),resolve,badge,thumbnail,card,stopAll,closeExpanded,sourceUrl:SOURCE};
})();
