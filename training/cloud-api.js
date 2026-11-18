(() => {
'use strict';
const cfg=window.JinshanConfig||{},rawFetch=window.fetch.bind(window),E=x=>String(x??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const client=window.supabase?.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'jinshan-cloud-auth-v1'}});
let user=null,key=null,pollTimer=null;
const ready=client?client.auth.getSession().then(({data,error})=>{if(error)throw error;user=data.session?.user||null;return user}):Promise.resolve(null);
const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const empty=()=>({schemaVersion:2,profile:{name:'',weeklyKm:null,weeklyStrength:null,experience:'',recentWeeklyKm:'',longestRun:'',availableDays:'',injury:'',notes:'',coachConsent:false},workouts:[],health:[],races:[],customExercises:[]});
const fail=(message,status=500)=>{throw Object.assign(Error(message),{status})};
function check(error){if(!error)return;if(error.code==='PGRST205'||error.code==='PGRST202')fail('云端数据空间尚未初始化，请完成 Supabase 后台连接。',503);if(error.status===401||error.code==='PGRST301')fail('登录已过期，请重新登录。',401);fail(error.message||'云端操作未完成，原记录仍保留。',error.status||500)}
async function owner(){await ready;if(!user)fail('请先登录自己的云端训练空间。',401);if(!key){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('jinshan:'+user.id));key=Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('')}return user.id}
async function space(){const uid=await owner();const {data,error}=await client.from('jinshan_spaces').select('content,revision,notes,chat_archive').eq('owner_id',uid).maybeSingle();check(error);if(data)return data;const {error:createError}=await client.rpc('jinshan_save_state',{p_state:empty(),p_revision:0});check(createError);const again=await client.from('jinshan_spaces').select('content,revision,notes,chat_archive').eq('owner_id',uid).single();check(again.error);return again.data}
async function agent(){await owner();const r=await client.from('jinshan_agents').select('last_seen,label,status').eq('owner_id',user.id).maybeSingle();check(r.error);return r.data?{...r.data,online:r.data.status!=='已断开连接'&&Date.now()-Date.parse(r.data.last_seen)<60000}:null}
async function listJobs(kind,limit=50){await owner();const r=await client.from('jinshan_jobs').select('*').eq('owner_id',user.id).eq('kind',kind).order('created_at',{ascending:false}).limit(limit);check(r.error);return r.data||[]}
const garminErrors={AUTH_REQUIRED:'登录已过期，请重新登录训练空间。',CONSENT_REQUIRED:'佳明云端同步尚未授权或授权已过期，请打开“云端佳明设置”。',LOGIN_REQUIRED:'佳明尚未完成认证，请在 Codex 中继续一次性开通。',PAUSED:'佳明云端自动同步已暂停，可在“云端佳明设置”恢复。',BACKEND_UNAVAILABLE:'佳明云端状态暂不可用，已有记录保留，请稍后刷新。',MODE_UNSUPPORTED:'线上目前仅支持近7天增量同步，尚未提供历史或指定运动补取。',REQUEST_INVALID:'本次同步请求格式不正确。'};
const garminTransport=window.GarminSyncCore.createTransport({client,url:cfg.url,key:cfg.key,fetchImpl:rawFetch});
async function garminAdmin(action,fields={},options={}){await owner();const data=await garminTransport.call(action,fields,options);return data.state||data;}
const garminJob=s=>window.GarminSyncCore.view(s);
async function enqueue(kind,payload,id=crypto.randomUUID()){
 const uid=await owner(),a=await agent();if(!a)fail('此功能的电脑处理服务尚未连接，本次请求未提交；已有资料仍可查看。',503);
 const old=await client.from('jinshan_jobs').select('*').eq('owner_id',uid).eq('id',id).maybeSingle();check(old.error);
 if(old.data){if(old.data.status==='failed'){const r=await client.from('jinshan_jobs').update({status:'queued',result:null,lease_until:null,updated_at:new Date().toISOString()}).eq('owner_id',uid).eq('id',id).eq('status','failed').select().single();check(r.error);return r.data}return old.data}
 const r=await client.from('jinshan_jobs').insert({id,owner_id:uid,kind,payload}).select().single();check(r.error);return r.data;
}
async function history(){const [s,jobs,a]=await Promise.all([space(),listJobs('coach'),agent()]);const ids=new Set(jobs.map(x=>x.id));const messages=(s.chat_archive||[]).filter(x=>!ids.has(x.requestId));for(const q of jobs.reverse()){
 messages.push({id:q.id+'-user',role:'user',text:q.payload.question,createdAt:q.created_at,status:'complete',requestId:q.id});
 messages.push({id:q.id+'-assistant',role:'assistant',text:q.status==='complete'?q.result?.text||'':q.status==='failed'?q.result?.message||'本次回答未完成，可以重试。':'',createdAt:q.updated_at,status:['queued','running'].includes(q.status)?'running':q.status==='complete'?'complete':'failed',requestId:q.id,basis:q.result?.basis||null});
 }return {messages:messages.sort((x,y)=>x.createdAt.localeCompare(y.createdAt)).slice(-100),running:jobs.some(x=>['queued','running'].includes(x.status)),personalContextEnabled:s.content.profile.coachConsent===true,provider:a?.online?'Codex · 已连接我的电脑':a?'Codex · 电脑离线，待处理问题已保存':'Codex · 尚未连接电脑'};}
async function api(path,init={}){await owner();const url=new URL(path,location.origin),method=init.method||'GET',value=init.body?JSON.parse(init.body):{};
 if(url.pathname==='/api/state'){
  if(method==='GET'){const s=await space();return response(200,{state:s.content,revision:s.revision,notes:s.notes||[],accountKey:key})}
  if(method!=='PUT')return response(405,{});if(value.accountKey!==key)return response(403,{error:'账号已变化，请重新打开。'});if(!window.WildValidation.validState(value.state))return response(400,{error:'记录格式不正确，未覆盖云端资料。'});
  const r=await client.rpc('jinshan_save_state',{p_state:value.state,p_revision:value.revision});check(r.error);return r.data?.conflict?response(409,{error:'另一设备有更新，请先备份并刷新。'}):response(200,r.data);
 }
 if(url.pathname==='/api/coach-chat'){
  if(method==='POST'){if(typeof value.question!=='string'||!value.question.trim()||value.question.length>4000||!/^[-a-f0-9]{36}$/i.test(value.requestId||''))return response(400,{error:'问题格式不正确。'});await enqueue('coach',{question:value.question.trim()},value.requestId)}return response(method==='POST'?202:200,await history());
 }
 if(url.pathname==='/api/garmin-sync'&&method==='POST'){const mode=value.mode||'recent';if(!['recent','history','activity'].includes(mode))return response(400,{error:'同步类型无效。'});if(mode!=='recent')return response(501,{status:'unsupported',error:mode==='history'?'线上尚未提供完整历史补取。已保存的历史仍可查看；定时任务目前只增量读取近7天。':'线上尚未提供指定运动补取。已有详情保留；近7天的新运动与缺少详情的运动由定时任务检查。'});const state=await garminAdmin('request',{mode:'recent'}),job=garminJob(state);if(!state.enabled||!state.sessionPresent||['never','failed','paused'].includes(job.status))return response(409,{error:job.message,...job});return response(202,{...job,message:'近7天同步请求已保存，等待云端定时任务处理；这不表示已开始读取或已同步成功。'})}
 if(url.pathname==='/api/garmin-job'){if(method!=='GET')return response(405,{error:'请求方法不正确。'});return response(200,garminJob(await garminAdmin('status')))}
 if(url.pathname==='/api/garmin-job/pause'){if(method!=='POST')return response(405,{error:'请求方法不正确。'});const job=garminJob(await garminAdmin('pause'));return job.status==='paused'?response(200,job):response(409,{...job,error:'云端尚未确认暂停，请刷新状态后重试。'})}
 if(url.pathname==='/api/race-refresh'){
  if(method==='GET'){const jobs=await listJobs('race',20),j=jobs.find(x=>x.payload.race_id===url.searchParams.get('race_id'));return response(200,j?.result||{status:j?'running':'never'})}
  if(!/^[-a-f0-9]{36}$/i.test(value.request_id||''))return response(400,{error:'请求格式不正确。'});const j=await enqueue('race',{race_id:value.race_id},value.request_id);const a=await agent();if(!a?.online)return response(503,{error:'更新请求已保存，等待电脑上线后检索。已有赛事资料可继续查看。'});
  for(let n=0;n<140;n++){const r=await client.from('jinshan_jobs').select('status,result').eq('owner_id',user.id).eq('id',j.id).single();check(r.error);if(r.data.status==='failed')return response(502,r.data.result||{error:'赛事检索未完成。'});if(r.data.status==='complete'){const s=await space();return response(200,{...r.data.result,state:s.content,revision:s.revision,accountKey:key})}await new Promise(r=>setTimeout(r,1000))}return response(503,{error:'检索仍在进行，已有资料保留；可稍后刷新查看。'});
 }
 return response(404,{error:'未找到云端操作。'});
}
window.fetch=async(input,init)=>{if(typeof input==='string'&&input.startsWith('/api/')){try{return await api(input,init)}catch(e){return response(e.status||500,{error:e.message})}}if(input==='/opengym-catalog.json')return rawFetch('./opengym-catalog.json',init);return rawFetch(input,init)};
function signinScreen(message=''){const main=document.querySelector('#main');if(!main)return;main.innerHTML=`<section class="cloud-login"><small>JINSHAN JINBU</small><h1>进山，也进步。</h1><p>登录自己的训练空间，随时记录与查看。</p><div class="panel"><h2>登录我的账号</h2><p class="health-note">使用旅行小程序的登录账号。训练与健康资料独立保存，仅当前账号可见。</p><form id="cloud-login-form"><label>账号 / 邮箱<input name="email" autocomplete="username" required placeholder="旅行小程序的登录账号"></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录我的训练空间 ↗</button><p id="cloud-login-error" role="status"></p></form></div></section>`;if(cfg.setupPending){main.querySelector('#cloud-login-error').textContent='私人训练空间正在开通，登录暂未启用，请稍后重试。';main.querySelectorAll('input,button').forEach(x=>x.disabled=true);return}if(message&&!/正在确认|暂时无法连接/.test(message))document.querySelector('#cloud-login-error').textContent=message;}
document.addEventListener('submit',async e=>{if(e.target.id!=='cloud-login-form')return;e.preventDefault();const form=e.target,b=form.querySelector('button'),out=form.querySelector('#cloud-login-error');b.disabled=true;out.textContent='正在确认账号…';try{if(!client)throw Error('登录组件未能加载，请刷新重试。');const fd=new FormData(form);let email=String(fd.get('email')).trim().toLowerCase();const at=email.lastIndexOf('@');if(at>0&&!email.slice(at+1).includes('.'))email+='.com';const r=await client.auth.signInWithPassword({email,password:String(fd.get('password'))});if(r.error)throw Error(r.error.code==='invalid_credentials'?'账号或密码不正确。':r.error.message);form.querySelector('[name="password"]').value='';location.reload()}catch(error){out.textContent=error.message;b.disabled=false}});
async function logout(){if(user){const hash=key;await client.auth.signOut({scope:'local'});if(hash)localStorage.removeItem('jinshan-cloud-v1:'+hash)}location.reload()}
window.WildCloud={signinScreen,logout,client,garmin:garminTransport};
window.addEventListener('DOMContentLoaded',async()=>{
 await ready;if(!user)return;
 const bar=document.createElement('section');bar.className='sync-hub';bar.setAttribute('aria-label','佳明同步');
 bar.innerHTML=`<div class="sync-hub-main"><div class="sync-hub-heading"><span class="sync-symbol" aria-hidden="true">↗</span><div><small>GARMIN CONNECT · 中国区</small><strong id="cloud-agent-status" role="status">正在检查连接</strong><span id="cloud-last-success">训练与健康 · 私人云端保存</span></div></div><div class="sync-hub-actions"><button type="button" id="cloud-recent" class="sync-primary">同步近7天</button><button type="button" id="cloud-settings">连接管理</button><button type="button" id="cloud-reload" aria-label="刷新云端训练记录">刷新记录</button></div></div><details class="sync-hub-details"><summary>同步时间与说明</summary><div class="sync-hub-detail-grid"><p>下一轮计划<strong id="cloud-next-run">—</strong><small>北京时间 · 平台排队可能延迟</small></p><p>最近执行<strong id="cloud-last-run">尚无记录</strong><small>每天06:17 / 12:17 / 18:17 / 22:17</small></p><p>读取范围<strong>近7天训练与健康</strong><small>已有历史保留，未取得的指标单独标注</small></p></div><div class="sync-hub-links"><button type="button" id="cloud-history">历史补取说明</button><button type="button" id="cloud-logout">退出账号</button></div></details><p id="cloud-notice" role="status" aria-live="polite" hidden></p>`;
 document.querySelector('.topbar').after(bar);
 let failures=0,requestBusy=false,recordVerified=false,statusProblem=false,lastObservedSuccess=null;
 const note=t=>{const out=bar.querySelector('#cloud-notice');out.textContent=t;out.hidden=!t;};
 const apply=job=>{
  if(statusProblem&&job.tone!=='attention'){note('');statusProblem=false;}
  if(lastObservedSuccess&&job.lastSuccessAt&&lastObservedSuccess!==job.lastSuccessAt){note('有新的佳明资料，点击“刷新记录”更新页面。');bar.querySelector('#cloud-reload').classList.add('sync-new-data');}
  if(job.lastSuccessAt)lastObservedSuccess=job.lastSuccessAt;
  bar.querySelector('.sync-hub-heading small').textContent=job.provider==='official-personal-api'?'GARMIN PERSONAL API · 中国区':'GARMIN CONNECT · 中国区';
  bar.dataset.tone=job.tone||'attention';bar.querySelector('#cloud-agent-status').textContent=job.stage;
  bar.querySelector('#cloud-last-success').textContent=job.lastSuccessAt?'最近成功 '+window.GarminSyncCore.formatDate(job.lastSuccessAt):'训练与健康 · 私人云端保存';
  bar.querySelector('#cloud-last-run').textContent=window.GarminSyncCore.formatDate(job.lastRunAt);
  bar.querySelector('#cloud-next-run').textContent=window.GarminSyncCore.formatDate(job.nextScheduledAt);
  const button=bar.querySelector('#cloud-recent');button.disabled=requestBusy||!job.canRequest;
  button.textContent=job.status==='running'?'正在同步…':job.status==='waiting'?'已排队，等待执行':'同步近7天';
  if(job.tone==='attention'){note(job.message);statusProblem=true;}
  window.dispatchEvent(new CustomEvent('garmin-job',{detail:job}));
 };
 async function status({force=false}={}){
  if(document.hidden||navigator.onLine===false)return;
  try{
   if(!recordVerified){await owner();const records=await client.from('jinshan_spaces').select('revision').eq('owner_id',user.id).maybeSingle();check(records.error);recordVerified=!!records.data;}
   const current=await garminAdmin('status',{}, {force}),job=garminJob(current);failures=0;apply(job);return job;
  }catch(error){failures++;statusProblem=true;bar.dataset.tone='attention';bar.querySelector('#cloud-agent-status').textContent='佳明连接暂不可用';bar.querySelector('#cloud-recent').disabled=true;note(error.message);}
 }
 async function start(mode,activityId){
  if(requestBusy)return {status:'waiting',message:'请求正在提交，请勿重复点击。'};
  requestBusy=true;bar.querySelector('#cloud-recent').disabled=true;bar.querySelector('#cloud-recent').textContent='正在提交…';
  try{const r=await window.fetch('/api/garmin-sync',{method:'POST',body:JSON.stringify({mode,activityId})}),data=await r.json();note(data.error||data.message||'');if(r.ok)apply(data);else await status({force:true});return data;}
  catch{note('暂时无法提交请求，请刷新连接状态。');return {status:'failed'};}
  finally{requestBusy=false;await status({force:true});}
 }
 async function poll(){clearTimeout(pollTimer);const job=await status();pollTimer=setTimeout(poll,document.hidden?120000:failures?Math.min(300000,60000*2**Math.min(failures,3)):['running','waiting'].includes(job?.status)?30000:120000);}
 window.WildLocal={start,poll:()=>status({force:true})};
 bar.querySelector('#cloud-recent').onclick=()=>start('recent');
 bar.querySelector('#cloud-settings').onclick=()=>window.GarminCloudSettings?.open();
 bar.querySelector('#cloud-history').onclick=()=>note('云端自动刷新近7天。已保存的历史仍可在健康记录查看；更早缺口需另行补取，不会清空原记录。');
 bar.querySelector('#cloud-reload').onclick=async()=>{const b=bar.querySelector('#cloud-reload');b.disabled=true;try{const result=await window.WildTraining?.refresh();note(result?.message||'记录已刷新。');bar.querySelector('#cloud-reload').classList.remove('sync-new-data');}catch(error){note(error.message||'刷新未完成，原记录保留。');}finally{b.disabled=false;}};
 bar.querySelector('#cloud-logout').onclick=logout;
 const alias=document.createElement('button');alias.id='local-refresh';alias.hidden=true;alias.onclick=()=>bar.querySelector('#cloud-reload').click();bar.append(alias);
 window.addEventListener('garmin-settings-changed',()=>{note('');status({force:true});});
 document.addEventListener('visibilitychange',()=>{clearTimeout(pollTimer);if(!document.hidden)poll();});
 window.addEventListener('online',poll);window.addEventListener('offline',()=>{bar.dataset.tone='attention';bar.querySelector('#cloud-agent-status').textContent='网络已断开';bar.querySelector('#cloud-recent').disabled=true;statusProblem=true;note('已有页面记录可查看，联网后再刷新或保存。');clearTimeout(pollTimer);});
 await poll();
});
})();
