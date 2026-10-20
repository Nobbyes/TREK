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
async function agent(){await owner();const r=await client.from('jinshan_agents').select('last_seen,label,status').eq('owner_id',user.id).maybeSingle();check(r.error);return r.data?{...r.data,online:Date.now()-Date.parse(r.data.last_seen)<60000}:null}
async function listJobs(kind,limit=50){await owner();const r=await client.from('jinshan_jobs').select('*').eq('owner_id',user.id).eq('kind',kind).order('created_at',{ascending:false}).limit(limit);check(r.error);return r.data||[]}
async function enqueue(kind,payload,id=crypto.randomUUID()){
 const uid=await owner(),a=await agent();if(!a)fail('请先在电脑打开本地网页的“云端连接”，完成一次连接后即可在这里发起请求。',503);
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
 if(url.pathname==='/api/garmin-sync'&&method==='POST'){if(!['recent','history','activity'].includes(value.mode||'recent'))return response(400,{error:'同步类型无效。'});const j=await enqueue('garmin',{mode:value.mode||'recent',activityId:value.activityId||null});return response(202,{status:'running',stage:'等待电脑处理',message:'请求已保存，已连接的电脑将读取佳明并更新云端。',requestId:j.id})}
 if(url.pathname==='/api/garmin-job'){const j=(await listJobs('garmin',1))[0];return response(200,j?{...(j.result||{}),status:['queued','running'].includes(j.status)?'running':j.status==='complete'?'complete':'paused',stage:j.status==='queued'?'等待电脑上线':j.result?.stage||'正在同步',message:j.result?.message||(j.status==='queued'?'请求已保存，等待电脑处理。':'正在处理。')}:{status:'never',message:'云端记录随时可用，佳明同步由已连接的电脑处理。'})}
 if(url.pathname==='/api/garmin-job/pause')return response(409,{error:'请在处理同步的电脑上暂停，本次已取得资料仍会保留。'});
 if(url.pathname==='/api/race-refresh'){
  if(method==='GET'){const jobs=await listJobs('race',20),j=jobs.find(x=>x.payload.race_id===url.searchParams.get('race_id'));return response(200,j?.result||{status:j?'running':'never'})}
  if(!/^[-a-f0-9]{36}$/i.test(value.request_id||''))return response(400,{error:'请求格式不正确。'});const j=await enqueue('race',{race_id:value.race_id},value.request_id);const a=await agent();if(!a?.online)return response(503,{error:'更新请求已保存，等待电脑上线后检索。已有赛事资料可继续查看。'});
  for(let n=0;n<140;n++){const r=await client.from('jinshan_jobs').select('status,result').eq('owner_id',user.id).eq('id',j.id).single();check(r.error);if(r.data.status==='failed')return response(502,r.data.result||{error:'赛事检索未完成。'});if(r.data.status==='complete'){const s=await space();return response(200,{...r.data.result,state:s.content,revision:s.revision,accountKey:key})}await new Promise(r=>setTimeout(r,1000))}return response(503,{error:'检索仍在进行，已有资料保留；可稍后刷新查看。'});
 }
 return response(404,{error:'未找到云端操作。'});
}
window.fetch=async(input,init)=>{if(typeof input==='string'&&input.startsWith('/api/')){try{return await api(input,init)}catch(e){return response(e.status||500,{error:e.message})}}if(input==='/opengym-catalog.json')return rawFetch('./opengym-catalog.json',init);return rawFetch(input,init)};
function signinScreen(message=''){const main=document.querySelector('#main');if(!main)return;main.innerHTML=`<section class="cloud-login"><small>JINSHAN JINBU</small><h1>进山，也进步。</h1><p>登录自己的训练空间，随时记录与查看。</p><div class="panel"><h2>登录我的账号</h2><p class="health-note">使用旅行小程序的登录账号。训练与健康资料独立保存，仅当前账号可见。</p><form id="cloud-login-form"><label>账号 / 邮箱<input name="email" autocomplete="username" required placeholder="旅行小程序的登录账号"></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录我的训练空间 ↗</button><p id="cloud-login-error" role="status"></p></form></div></section>`;if(cfg.setupPending){main.querySelector('#cloud-login-error').textContent='私人训练空间正在开通，登录暂未启用。现有本地记录可继续使用。';main.querySelectorAll('input,button').forEach(x=>x.disabled=true);return}if(message&&!/正在确认|暂时无法连接/.test(message))document.querySelector('#cloud-login-error').textContent=message;}
document.addEventListener('submit',async e=>{if(e.target.id!=='cloud-login-form')return;e.preventDefault();const form=e.target,b=form.querySelector('button'),out=form.querySelector('#cloud-login-error');b.disabled=true;out.textContent='正在确认账号…';try{if(!client)throw Error('登录组件未能加载，请刷新重试。');const fd=new FormData(form);let email=String(fd.get('email')).trim().toLowerCase();const at=email.lastIndexOf('@');if(at>0&&!email.slice(at+1).includes('.'))email+='.com';const r=await client.auth.signInWithPassword({email,password:String(fd.get('password'))});if(r.error)throw Error(r.error.code==='invalid_credentials'?'账号或密码不正确。':r.error.message);form.querySelector('[name="password"]').value='';location.reload()}catch(error){out.textContent=error.message;b.disabled=false}});
async function logout(){if(user){const hash=key;await client.auth.signOut({scope:'local'});if(hash)localStorage.removeItem('jinshan-cloud-v1:'+hash)}location.reload()}
window.WildCloud={signinScreen,logout,client};
window.addEventListener('DOMContentLoaded',async()=>{await ready;if(!user)return;const bar=document.createElement('section');bar.className='local-bar cloud-bar';bar.innerHTML='<strong>我的云端训练空间</strong><span id="cloud-agent-status">正在检查电脑连接…</span><button type="button" id="cloud-recent">同步近期</button><button type="button" id="cloud-history">补取历史</button><button type="button" id="cloud-reload">刷新记录</button><button type="button" id="cloud-logout">退出登录</button><small id="cloud-notice" role="status"></small>';document.querySelector('.shell').prepend(bar);
 const note=t=>{document.querySelector('#cloud-notice').textContent=t};async function status(){try{const a=await agent();document.querySelector('#cloud-agent-status').textContent=a?.online?'电脑在线 · 可处理佳明同步与 Codex 问答':a?'电脑离线 · 云端记录可正常查看和编辑':'请先在电脑本地网页完成一次“云端连接”';}catch(e){note(e.message)}}
 async function start(mode,activityId){const r=await window.fetch('/api/garmin-sync',{method:'POST',body:JSON.stringify({mode,activityId})}),d=await r.json();note(d.message||d.error);return d}
 window.WildLocal={start,poll:status};bar.querySelector('#cloud-recent').onclick=()=>start('recent');bar.querySelector('#cloud-history').onclick=()=>start('history');bar.querySelector('#cloud-reload').onclick=()=>{if(document.querySelector('dialog[open],#strength-focus')||document.querySelector('#coach-question')?.value){note('请先保存当前编辑或保留提问后再刷新。');return}location.reload()};bar.querySelector('#cloud-logout').onclick=logout;
 // Preserve the shared health screen's existing refresh control.
 const alias=document.createElement('button');alias.id='local-refresh';alias.hidden=true;alias.onclick=()=>bar.querySelector('#cloud-reload').click();bar.append(alias);
 await status();pollTimer=setInterval(status,15000);
});
})();
