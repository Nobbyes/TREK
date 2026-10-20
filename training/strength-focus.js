(() => {
'use strict';
let c,session=null,timer=null,lastTick=0,wake=null,voiceAttempt=0;
const M=()=>window.WildSession,E=x=>c.E(x),clone=x=>JSON.parse(JSON.stringify(x));
const time=ms=>{const sec=Math.floor(Math.max(0,ms)/1000);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`};
const key=()=>c.accountKey()?'wildstride-focus:'+c.accountKey():null;
function save(){try{if(session&&key())sessionStorage.setItem(key(),JSON.stringify(session))}catch{}}
function stored(){try{const v=JSON.parse(sessionStorage.getItem(key())||'null');return v?.version===1&&Array.isArray(v.queue)&&v.draft?.type==='strength'?v:null}catch{return null}}
function clear(){if(key())sessionStorage.removeItem(key())}
function stopSpeech(){voiceAttempt++;window.speechSynthesis?.cancel()}
function updateVoice(){const node=document.getElementById('focus-voice-state');if(node&&session)node.textContent=session.voiceStatus}
function speak(text){
 if(!session)return;session.cue=text;const live=document.getElementById('focus-spoken');if(live)live.textContent=text;
 if(!session.voice){session.voiceStatus='语音已关闭';updateVoice();return}
 if(!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){session.voiceStatus='此浏览器未提供语音，请看文字提示';updateVoice();return}
 stopSpeech();const attempt=voiceAttempt;
 try{const utter=new SpeechSynthesisUtterance(text);utter.lang='zh-CN';utter.rate=.95;const voices=speechSynthesis.getVoices();utter.voice=voices.find(v=>/^zh/i.test(v.lang)&&v.localService)||voices.find(v=>/^zh/i.test(v.lang))||null;
  utter.onstart=()=>{if(session&&attempt===voiceAttempt){session.voiceStatus='语音播放中';updateVoice()}};
  utter.onend=()=>{if(session&&attempt===voiceAttempt){session.voiceStatus='语音已就绪';updateVoice()}};
  utter.onerror=e=>{if(session&&attempt===voiceAttempt&&!['canceled','interrupted'].includes(e.error)){session.voiceStatus='语音暂不可用，请看文字提示';updateVoice()}};
  session.voiceStatus='正在请求中文语音';updateVoice();speechSynthesis.speak(utter);
 }catch{session.voiceStatus='语音暂不可用，请看文字提示';updateVoice()}
}
async function keepAwake(){try{if(navigator.wakeLock&&document.visibilityState==='visible'){const lock=await navigator.wakeLock.request('screen');if(!session||session.paused||!modal().open)await lock.release();else wake=lock}}catch{}}
function release(){wake?.release().catch(()=>{});wake=null}
function modal(){let d=document.getElementById('strength-focus');if(!d){d=document.createElement('dialog');d.id='strength-focus';d.className='strength-focus';d.setAttribute('aria-label','专注力量训练');document.body.append(d);d.addEventListener('cancel',e=>{e.preventDefault();pauseAndLeave()})}return d}
function current(){return session&&M().current(session)}
function exercise(){return current()?session.draft.exercises[current().exercise]:null}
function sideLabel(q=current()){return q?.side==='left'?'左侧':q?.side==='right'?'右侧':'双侧 / 全身'}
function displayName(x){return x?.name.replace(/（每侧）|（每方向）/g,'')||'训练结束'}
function opener(){const d=c.getDraft();if(d?.type!=='strength')return '';const n=d.exercises?.length||0;return `<section class="focus-entry"><strong>本次专注训练${n?' · '+n+' 个动作':''}</strong><p>${n?'已根据当前动作与组次自动生成；可直接进入语音、换侧和休息计时。':'在下方选择或新增动作，自动带出本次专注训练，无需先选A/B套。'}完成后核对实际组次再保存。</p><button type="button" class="primary" data-focus-start ${n?'':'disabled'}>${n?'进入专注训练':'添加动作后开始'}</button></section>`}
function resumeBanner(){return stored()?'<section class="focus-resume"><span>有一份尚未保存的专注训练进度</span><button type="button" class="secondary" data-focus-resume>继续训练 / 核对记录</button></section>':sessionStorage.getItem(key()+':previous')?'<section class="focus-resume"><span>上次退出的专注进度仍有备份</span><button type="button" class="secondary" data-focus-recover>恢复上次进度</button></section>':''}
function render(){
 if(!session)return;const q=current(),x=exercise(),p=M().progress(session),d=modal();
 if(!q||session.phase==='finished'){reviewScreen();return}
 const labels={ready:'准备开始',work:q.mode==='seconds'?'保持中':'训练中',confirm:'计时已到 · 等待确认',switch:'换侧准备',rest:'组间休息'};
 const progress=Math.round(p.done/p.total*100);
 d.innerHTML=`<div class="focus-wrap"><header class="focus-header"><button type="button" data-focus-action="leave" aria-label="退出并保留训练进度">‹</button><div><strong>专注训练</strong><small>${E(session.draft.title||'力量训练')}</small></div><button type="button" data-focus-action="finish">提前结束</button></header><div class="focus-summary"><span>${p.done} / ${p.total} 组 · 左右侧分别确认</span><span>有效计时 <b id="focus-total">${time(session.elapsedMs)}</b></span></div><progress value="${p.done}" max="${p.total}" aria-label="已完成组数">${progress}%</progress><div class="focus-state"><span id="focus-state">${session.paused?'已暂停':labels[session.phase]}</span><button type="button" data-focus-action="pause">${session.paused?'继续':'暂停'}</button></div><h2>${E(displayName(x))}</h2><p class="focus-current">第 ${q.set+1} / ${x.sets.length} 组 · ${sideLabel()} · 计划 ${q.target} ${q.mode==='seconds'?'秒':x.unit||'次'}</p><div class="focus-stage">${window.WildVisuals.card(x.id,true)}<div class="focus-clock"><strong id="focus-clock">${clockText()}</strong><small id="focus-clock-label">${clockLabel()}</small></div></div><div class="focus-actual"><label>本侧/组实际${q.mode==='seconds'?'保持 / 秒':x.unit==='步'?'步数':'次数'}<input id="focus-quantity" type="number" min="1" max="10000" step="1" value="${q.mode==='seconds'?Math.floor(session.phaseMs/1000):q.target}" ${!['work','confirm'].includes(session.phase)?'disabled':''}></label><label>负重 / kg（可选）<input id="focus-weight" type="number" min="0" max="1500" step="0.25" value="${x.sets[q.set].weight??''}" ${!['work','confirm'].includes(session.phase)?'disabled':''}></label></div><p class="focus-actual-note">${q.mode==='seconds'?'计时到不会自动记为完成，请按实际保持时长确认。':'次数按计划预填，请按实际完成情况调整后确认。'}</p><label class="focus-rest">组间休息<select id="focus-rest">${[30,45,60,75,90,120].map(n=>`<option value="${n}" ${n===session.restSeconds?'selected':''}>${n} 秒</option>`).join('')}</select><span>左右侧完成后再休息</span></label><section class="focus-cue"><h3>动作提示</h3><p id="focus-spoken" role="status">${E(session.cue)}</p><div class="focus-speech"><button type="button" data-focus-action="voice" aria-pressed="${session.voice}">${session.voice?'关闭语音':'开启语音'}</button><button type="button" data-focus-action="repeat">重播提示</button><small id="focus-voice-state">${E(session.voiceStatus)}</small></div></section><details class="focus-details"><summary>查看完整动作详解</summary>${window.WildMoves.content(x.id)}</details><p id="focus-error" role="alert"></p><button type="button" class="focus-main" data-focus-action="primary" ${session.paused?'disabled':''}>${primaryLabel()}</button><small class="focus-bottom-note">切换后台会暂停；语音与亮屏支持取决于当前浏览器。动画仅示意动作结构。</small></div>`;
 const pending=session.pending?.index===session.index?session.pending:null;
 if(pending){document.getElementById('focus-weight').value=pending.weight;if(pending.quantityEdited){const input=document.getElementById('focus-quantity');input.value=pending.quantity;input.dataset.edited='true'}}
 const poseNode=d.querySelector('.focus-pose');if(poseNode&&q.side==='right')poseNode.style.transform='scaleX(-1)';
 if(!d.open)d.showModal();save();
}
function clockText(){if(session.phase==='rest')return time(Math.max(0,session.restSeconds*1000-session.phaseMs));const q=current();if(q?.mode==='seconds'&&['work','confirm'].includes(session.phase))return time(Math.max(0,q.target*1000-session.phaseMs));return time(session.phaseMs)}
function clockLabel(){return session.phase==='rest'?'休息倒计时':current()?.mode==='seconds'?'保持倒计时':'本侧 / 组用时'}
function primaryLabel(){return ['ready','switch'].includes(session.phase)?`开始${current()?.side==='both'?'本组':sideLabel()}`:session.phase==='rest'?'跳过剩余休息 · 准备下一组':current()?.side==='both'?'确认本组完成':'确认本侧完成'}
function startLoop(){clearInterval(timer);lastTick=Date.now();timer=setInterval(()=>{
 if(!session||!modal().open)return;const now=Date.now(),delta=now-lastTick;lastTick=now;if(delta>10000&&!session.paused&&['work','rest'].includes(session.phase)){session.paused=true;session.cue='计时发生中断，已暂停，请确认后继续。';stopSpeech();render();return}
 const oldPhase=session.phase;M().tick(session,delta);
 const q=current();
 if(oldPhase==='work'&&session.phase==='confirm'){speak('计时结束。请确认实际完成时长，再点击本侧或本组完成。');render()}
 if(oldPhase==='rest'&&session.phase==='ready'){speak(`休息结束。下一个是${displayName(exercise())}，${sideLabel()}。准备好后点击开始。`);render()}
 if(session.phase==='work'&&q?.mode==='seconds'&&!session.paused){const remaining=Math.ceil(q.target-session.phaseMs/1000);if(remaining>0&&remaining<=5&&session.lastCountdown!==remaining){session.lastCountdown=remaining;speak(String(remaining))}}
 const clock=document.getElementById('focus-clock'),total=document.getElementById('focus-total');if(clock)clock.textContent=clockText();if(total)total.textContent=time(session.elapsedMs);
 const input=document.getElementById('focus-quantity');if(input&&q?.mode==='seconds'&&!input.dataset.edited)input.value=String(Math.floor(session.phaseMs/1000));
 if(!session.paused&&session.phase==='work')window.WildVisuals.animate(document.querySelector('[data-focus-visual]'),session.phaseMs/1000);
 if(Math.floor(session.elapsedMs/1000)%5===0)save();
 },250)}
function start(){c.collectDraft();const draft=c.getDraft();if(!draft?.exercises?.length){c.toast('先从动作库选择本次训练');return}if(stored()){resume(true);return}try{session=M().create({...clone(draft),id:c.uid(),date:c.today(),duration:'',rpe:null});document.getElementById('modal').close();render();startLoop();keepAwake();speak(`准备${displayName(exercise())}。${sideLabel()}，计划${current().target}${current().mode==='seconds'?'秒':'次'}。准备好后点击开始。`)}catch(e){c.toast(e.message)}}
function resume(hasDraft=false){const saved=stored();if(!saved)return;session=saved;session.paused=true;session.voiceStatus='点击继续后恢复语音';session.cue='已保留进度。核对当前动作，点击继续。';if(hasDraft&&document.getElementById('modal').open)document.getElementById('modal').close();render();if(session.phase!=='finished')startLoop()}
function pauseAndLeave(){if(!session)return;session.paused=true;stopSpeech();release();save();modal().close();clearInterval(timer);c.render();c.toast('进度已保留，可从力量动作库继续')}
function reviewScreen(){
 stopSpeech();release();clearInterval(timer);session.paused=true;const p=M().progress(session),rows=session.results;
 modal().innerHTML=`<div class="focus-wrap focus-review"><h2>${session.index>=session.queue.length?'本次训练已走完':'核对本次训练'}</h2><p>${p.done} / ${p.total} 组完整完成；${rows.length} 条完成量由你确认。有效计时 ${time(session.elapsedMs)}，含休息、不含暂停。</p>${!rows.length?'<p>还没有确认完成的组，不会生成训练记录。</p>':`<div class="table-scroll"><table><thead><tr><th>动作</th><th>侧</th><th>组</th><th>完成量</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${E(displayName(session.draft.exercises[r.exercise]))}</td><td>${sideLabel(r)}</td><td>${r.set+1}</td><td>${r.quantity}${r.mode==='seconds'?'秒':session.draft.exercises[r.exercise].unit||'次'}</td></tr>`).join('')}</tbody></table></div>`}<p class="focus-review-note">这里只整理已确认组次。下一步可修改实际时长、负重与RPE，点击“保存训练”后才写入日志。</p><div class="focus-review-actions">${session.index<session.queue.length?'<button type="button" data-focus-action="continue">返回训练</button>':''}<button type="button" data-focus-action="leave">退出并保留进度</button><button type="button" data-focus-action="draft">返回原计划草稿${rows.length?'（保留进度备份）':''}</button>${rows.length?'<button type="button" class="focus-main" data-focus-action="record">核对并转入训练记录</button>':''}</div></div>`;
 if(!modal().open)modal().showModal();save();
}
document.addEventListener('click',e=>{
 if(e.target.closest('[data-focus-start]')){start();return}if(e.target.closest('[data-focus-resume]')){resume();return}if(e.target.closest('[data-focus-recover]')){sessionStorage.setItem(key(),sessionStorage.getItem(key()+':previous'));resume();return}
 const button=e.target.closest('[data-focus-action]');if(!button||!session)return;const action=button.dataset.focusAction;
 if(action==='leave'){pauseAndLeave();return}if(action==='finish'){session.paused=true;reviewScreen();return}
 if(action==='continue'){render();startLoop();return}
 if(action==='voice'){session.voice=!session.voice;if(!session.voice){stopSpeech();session.voiceStatus='语音已关闭'}else speak(session.cue||'中文语音提示已开启');button.textContent=session.voice?'关闭语音':'开启语音';button.setAttribute('aria-pressed',String(session.voice));save();updateVoice();return}
 if(action==='repeat'){speak(session.cue||exercise()?.prescription||'准备好后开始');return}
 if(action==='pause'){session.paused=!session.paused;lastTick=Date.now();if(session.paused){stopSpeech();release();session.voiceStatus=session.voice?'语音已暂停':'语音已关闭';session.cue='已暂停。点击继续后恢复计时。'}else{keepAwake();speak(`继续${displayName(exercise())}，${sideLabel()}。`)}render();return}
 if(action==='record'){const draft=M().review(session);modal().close();c.setDraft(draft);c.drawWorkout();return}
 if(action==='draft'){if(session.results.length)sessionStorage.setItem(key()+':previous',JSON.stringify(session));const draft=clone(session.draft);clear();session=null;clearInterval(timer);stopSpeech();release();modal().close();c.setDraft(draft);c.drawWorkout();return}
 if(action==='primary'){
  if(['ready','switch'].includes(session.phase)){M().begin(session);render();speak(`开始${displayName(exercise())}，${sideLabel()}，${current().target}${current().mode==='seconds'?'秒':'次'}。${exercise().prescription||''}`);keepAwake()}
  else if(session.phase==='rest'){session.phase='ready';session.phaseMs=0;render();speak('准备下一组，准备好后点击开始。')}
  else if(['work','confirm'].includes(session.phase)){
   try{const quantity=Number(document.getElementById('focus-quantity').value),raw=document.getElementById('focus-weight').value;M().complete(session,quantity,raw===''?null:Number(raw));render();if(session.phase==='switch')speak(`本侧已确认，请换${sideLabel()}，准备好后点击开始。`);else if(session.phase==='rest')speak(`本组已确认。休息${session.restSeconds}秒。`);else if(session.phase==='finished')speak('训练结束，请核对完成记录。')}catch(err){document.getElementById('focus-error').textContent=err.message}
  }
  save();lastTick=Date.now();
 }
});
document.addEventListener('input',e=>{if(!session||!['focus-quantity','focus-weight'].includes(e.target.id))return;const old=session.pending?.index===session.index?session.pending:{};session.pending={index:session.index,quantity:document.getElementById('focus-quantity').value,weight:document.getElementById('focus-weight').value,quantityEdited:old.quantityEdited||e.target.id==='focus-quantity'};if(e.target.id==='focus-quantity')e.target.dataset.edited='true';save()});
document.addEventListener('change',e=>{if(e.target.id==='focus-rest'&&session){session.restSeconds=Number(e.target.value);save()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&session&&modal().open&&!session.paused){session.paused=true;stopSpeech();release();session.cue='已切换后台，训练已暂停；返回后点击继续。';render()}});
window.addEventListener('pagehide',()=>{if(session){session.paused=true;save();stopSpeech();release()}});
window.WildFocus={start,configure:ctx=>{c=ctx},opener,resumeBanner,saved:draft=>{if(session?.draft.id===draft.id&&draft.focusSession){clear();session=null;clearInterval(timer);stopSpeech();release()}}};
})();
