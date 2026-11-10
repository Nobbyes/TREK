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
async function garminAdmin(action,fields={}){
 await owner();const auth=await client.auth.getSession();if(auth.error||!auth.data?.session?.access_token)fail('登录已过期，请重新登录训练空间。',401);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const r=await rawFetch(`${cfg.url.replace(/\/$/,'')}/functions/v1/garmin-sync-admin`,{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${auth.data.session.access_token}`,apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({action,...fields})});const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error){const code=String(typeof d.error==='string'?d.error:d.error?.code||d.code||'').toUpperCase();fail(garminErrors[code]||(r.status===401?'登录已过期，请重新登录训练空间。':'佳明云端操作未完成，已有记录保留。'),r.ok?503:r.status)}
  const state=d.state||d;if(typeof state.enabled!=='boolean')fail('佳明云端未返回完整状态，无法确认本次操作。',503);return state;
 }catch(error){if(error.status)throw error;fail(error.name==='AbortError'?'佳明云端连接超时，请稍后刷新；已有记录保留。':'暂时无法连接佳明云端服务，已有记录保留。',503)}finally{clearTimeout(timeout)}
}
function garminJob(s){
 const code=String(s.code||'').toUpperCase(),base={cloud:true,mode:'recent',enabled:s.enabled===true,sessionPresent:s.sessionPresent===true,lastSuccessAt:s.lastSuccessAt||null,lastRunAt:s.lastRunAt||null,requestedAt:s.requestedAt||null,code:code||null};
 const result=(status,stage,message)=>({...base,status,stage,message});
 if(!s.enabled)return result('never','佳明云端未开通','佳明云端同步尚未开通；已有训练与健康记录仍可查看和编辑。');
 if(s.expiresAt&&Date.parse(s.expiresAt)<=Date.now())return result('failed','佳明授权已过期',garminErrors.CONSENT_REQUIRED);
 if(s.status==='needs_login'||['AUTH_REQUIRED','LOGIN_REQUIRED','GARMIN_AUTH_REQUIRED','SESSION_EXPIRED','NEEDS_REAUTH'].includes(code))return result('failed','佳明需要重新认证','已停止继续请求，请在 Codex 中重新完成一次性佳明认证。');
 if(s.paused||s.status==='paused')return result('paused','佳明自动同步已暂停',garminErrors.PAUSED);
 if(!s.sessionPresent)return result('never','等待完成佳明认证',garminErrors.LOGIN_REQUIRED);
 if(s.status==='waiting'&&!s.hasActiveRun)return result('waiting','等待云端定时任务','请求已保存，等待定时任务处理；尚未确认本轮读取成功。');
 if(code==='PARTIAL_DATA')return result('failed','本次仅同步部分资料','本轮仅取得部分资料，已有记录保留；缺记录不等于休息日。');
 if(code==='GARMIN_RATE_LIMITED'||code==='RATE_LIMITED')return result('failed','佳明暂时限制请求','本轮已停止，已有记录保留；请等待后续定时任务。');
 if(s.status==='failed'||code)return result('failed','本次同步未完成','本轮同步未完成，已有记录保留；请查看“云端佳明设置”。');
 if(s.hasActiveRun)return result('running','佳明云端任务执行中','云端正在处理近7天资料，请稍后刷新；完成前不代表已取得新记录。');
 if(s.status==='running')return result('failed','上次任务未确认完成','云端执行状态已失去有效确认，请稍后刷新；已有记录保留。');
 if(s.lastSuccessAt&&Number.isFinite(Date.parse(s.lastSuccessAt)))return result('complete','已取得云端同步结果','最近一次实际同步已完成；新增资料以刷新后的记录为准。');
 return result('waiting','等待首次实际同步','已保存佳明会话，仍需一次实际读取成功才能确认同步可用。');
}
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
window.WildCloud={signinScreen,logout,client};
window.addEventListener('DOMContentLoaded',async()=>{await ready;if(!user)return;const bar=document.createElement('section');bar.className='local-bar cloud-bar';bar.innerHTML='<strong>我的云端训练空间</strong><span id="cloud-agent-status">正在检查云端记录与佳明状态…</span><button type="button" id="cloud-recent">同步近7天</button><button type="button" id="cloud-history">历史补取说明</button><button type="button" id="cloud-reload">刷新记录</button><button type="button" id="cloud-logout">退出登录</button><small id="cloud-notice" role="status"></small>';document.querySelector('.shell').prepend(bar);
 const note=t=>{document.querySelector('#cloud-notice').textContent=t};async function status(){const [records,garmin]=await Promise.allSettled([(async()=>{await owner();const r=await client.from('jinshan_spaces').select('revision').eq('owner_id',user.id).maybeSingle();check(r.error);if(!r.data)fail('训练空间尚未初始化，请稍后刷新。',503);return true})(),garminAdmin('status')]);const recordText=records.status==='fulfilled'?'云端记录已连接':'云端记录连接暂不可用';if(garmin.status==='fulfilled'){const job=garminJob(garmin.value);document.querySelector('#cloud-agent-status').textContent=`${recordText} · ${job.stage}`;window.dispatchEvent(new CustomEvent('garmin-job',{detail:job}))}else{document.querySelector('#cloud-agent-status').textContent=`${recordText} · 佳明状态暂不可用`;note(garmin.reason.message);window.dispatchEvent(new CustomEvent('garmin-job',{detail:{status:'failed',message:garmin.reason.message}}))}if(records.status==='rejected')note(records.reason.message)}
 async function start(mode,activityId){const r=await window.fetch('/api/garmin-sync',{method:'POST',body:JSON.stringify({mode,activityId})}),d=await r.json();note(d.error||d.message);window.dispatchEvent(new CustomEvent('garmin-job',{detail:r.ok?d:{status:'failed',message:d.error||d.message}}));if(r.ok)await status();return d}
 window.WildLocal={start,poll:status};bar.querySelector('#cloud-recent').onclick=()=>start('recent');bar.querySelector('#cloud-history').onclick=()=>start('history');bar.querySelector('#cloud-reload').onclick=()=>{if(document.querySelector('dialog[open],#strength-focus')||document.querySelector('#coach-question')?.value){note('请先保存当前编辑或保留提问后再刷新。');return}location.reload()};bar.querySelector('#cloud-logout').onclick=logout;
 // Preserve the shared health screen's existing refresh control.
 const alias=document.createElement('button');alias.id='local-refresh';alias.hidden=true;alias.onclick=()=>bar.querySelector('#cloud-reload').click();bar.append(alias);
 await status();pollTimer=setInterval(status,15000);
});
})();
