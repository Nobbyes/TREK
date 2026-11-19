(() => {
'use strict';
let c,selectedDay='',historyRange='30';
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const val=(n,unit='',digits=0)=>finite(n)?`${Number(n.toFixed(digits))}${unit}`:'未取得';
const hours=s=>{if(!finite(s))return '未取得';const minutes=Math.round(s/60);return `${Math.floor(minutes/60)}小时${minutes%60}分`};
const duration=s=>{if(!finite(s))return '未取得';const total=Math.round(s),h=Math.floor(total/3600),m=Math.floor(total%3600/60),seconds=total%60;return `${h?h+'小时':''}${m}分${String(seconds).padStart(2,'0')}秒`};
const at=t=>t&&!Number.isNaN(new Date(t).getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t)):'尚未同步';
const cell=(label,value,date)=>`<div class="garmin-metric"><small>${c.E(label)}</small><strong>${c.E(value)}</strong>${date?`<span>${c.E(date)}</span>`:''}</div>`;
const days=()=>c.state().health.filter(h=>h.garmin).sort((a,b)=>b.date.localeCompare(a.date));
let trendRange=7,selectedWorkout='',historyOpen=false;
const shiftDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dateOK=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const metricDefs=[
 {key:'sleep',label:'夜间睡眠',unit:'小时',get:h=>h?.garmin?.sleep?.sleep_seconds,format:hours,mean:hours,scale:n=>n/3600,wide:true},
 {key:'hrv',label:'整夜 HRV',unit:'ms',get:h=>h?.garmin?.hrv?.last_night_avg_hrv_ms??h?.garmin?.sleep?.avg_overnight_hrv},
 {key:'rhr',label:'静息心率',unit:'bpm',get:h=>h?.garmin?.heartRate?.resting_heart_rate_bpm},
 {key:'battery',label:'Body Battery',unit:'/100',get:h=>h?.garmin?.battery?.current,hint:'最后保存读数'},
 {key:'steps',label:'步数',unit:'步',get:h=>h?.garmin?.daily?.total_steps},
 {key:'stress',label:'平均压力',unit:'/100',get:h=>h?.garmin?.daily?.avg_stress_level??h?.garmin?.stress?.avg_stress_level},
 {key:'weight',label:'体重 · 已记录',unit:'kg',get:h=>h?.weight,digits:1},
 {key:'spo2',label:'日均血氧',unit:'%',get:h=>h?.garmin?.daily?.avg_spo2_percent,digits:1}
];
function sparkline(def,rows){
 const values=rows.map(h=>{const n=def.get(h);return finite(n)?(def.scale?def.scale(n):n):null}),valid=values.filter(n=>n!==null);
 if(!valid.length)return '<div class="health-trend-empty">这段时间暂无记录</div>';
 const lo=Math.min(...valid),hi=Math.max(...valid),span=hi-lo||Math.max(1,hi*.1),x=i=>8+i/(rows.length-1||1)*284,y=n=>46-(n-lo+(hi===lo?span/2:0))/span*36;
 let paths='',run=[];
 const flush=()=>{if(run.length>1)paths+=`<polyline points="${run.join(' ')}"/>`;run=[]};
 values.forEach((n,i)=>{if(n===null){flush();return}run.push(`${x(i).toFixed(2)},${y(n).toFixed(2)}`)});flush();
 const desc=rows.map((h,i)=>`${h.date} ${values[i]===null?'未取得':values[i].toFixed(def.digits||1)+' '+def.unit}`).join('；');
 return `<svg class="health-trend" viewBox="0 0 300 58" role="img" aria-label="${c.E(def.label+'趋势；'+desc)}"><path class="health-trend-base" d="M8 52H292"/>${paths}${values.map((n,i)=>n===null?'':`<circle cx="${x(i).toFixed(2)}" cy="${y(n).toFixed(2)}" r="${i===rows.length-1?3.5:2.5}"><title>${c.E(rows[i].date+' · '+(def.format?def.format(def.get(rows[i])):val(n,' '+def.unit,def.digits||0)))}</title></circle>`).join('')}</svg>`;
}
function trendCard(def,rows,chosen,compact=false){
 const value=def.get(chosen),values=rows.map(def.get).filter(finite),average=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const text=def.format?def.format(value):val(value,'',def.digits||0);
 return `<article class="health-trend-card ${def.wide&&!compact?'health-trend-card--sleep':''}"><h3>${c.E(def.label)}</h3><p class="health-reading"><strong>${c.E(text)}</strong>${!def.format&&finite(value)?`<span>${c.E(def.unit)}</span>`:''}</p><small class="health-reading-date">${c.E(chosen?.date||'未取得')}${def.hint?' · '+c.E(def.hint):''}</small>${sparkline(def,rows)}<p class="health-trend-stat">${average===null?'均值未取得':`均值 ${c.E(def.mean?def.mean(average):val(average,' '+def.unit,def.digits||0))}`}<span>${values.length}/${rows.length} 天</span></p></article>`;
}
function sleepStages(gs){
 const stages=[['深睡','deep_sleep_seconds'],['浅睡','light_sleep_seconds'],['REM','rem_sleep_seconds'],['清醒','awake_seconds']],total=stages.reduce((n,[,k])=>n+(finite(gs[k])?gs[k]:0),0);
 return `<div class="health-sleep-stages">${total?`<div class="health-sleep-bar" role="img" aria-label="${c.E(stages.map(([n,k])=>n+' '+hours(gs[k])).join('，'))}">${stages.map(([n,k],i)=>finite(gs[k])&&gs[k]>0?`<span class="sleep-stage-${i}" style="width:${gs[k]/total*100}%" title="${c.E(n+' '+hours(gs[k]))}"></span>`:'').join('')}</div>`:''}<div class="health-sleep-legend">${stages.map(([n,k],i)=>`<span><i class="sleep-stage-${i}"></i>${n}<strong>${hours(gs[k])}</strong></span>`).join('')}</div></div>`;
}
const meanOf=values=>{const ns=values.filter(finite);return ns.length?ns.reduce((a,b)=>a+b,0)/ns.length:null};
const miniFact=(label,value)=>`<div><span>${c.E(label)}</span><strong>${c.E(value)}</strong></div>`;
function sleepTrend(rows){
 const defs=[metricDefs[0],{label:'深睡',unit:'小时',get:h=>h?.garmin?.sleep?.deep_sleep_seconds,scale:n=>n/3600},{label:'浅睡',unit:'小时',get:h=>h?.garmin?.sleep?.light_sleep_seconds,scale:n=>n/3600}];
 // All three series share a zero-based hour scale; missing dates break each series.
 const series=defs.map(d=>rows.map(h=>finite(d.get(h))?d.get(h)/3600:null)),all=series.flat().filter(n=>n!==null),top=Math.max(1,...all);
 const x=i=>8+i/(rows.length-1||1)*284,y=n=>86-n/top*70;let paths='';
 series.forEach((values,k)=>{let run=[];const flush=()=>{if(run.length>1)paths+=`<polyline class="sleep-line-${k}" points="${run.join(' ')}"/>`;run=[]};values.forEach((n,i)=>{if(n===null){flush();return}run.push(`${x(i)},${y(n)}`)});flush();paths+=values.map((n,i)=>n===null?'':`<circle class="sleep-line-${k}" cx="${x(i)}" cy="${y(n)}" r="2.5"><title>${c.E(rows[i].date+' · '+defs[k].label+' '+hours(n*3600))}</title></circle>`).join('')});
 return `<div class="health-sleep-trend"><div class="health-chart-caption"><span>近 ${rows.length} 天 · 小时</span><span>${rows[0].date.slice(5)} — ${rows.at(-1).date.slice(5)}</span></div>${all.length?`<svg class="health-trend health-trend--sleep" viewBox="0 0 300 100" role="img" aria-label="总睡眠、深睡与浅睡趋势，共用零起点小时刻度，缺失日期不连线"><path class="health-trend-base" d="M8 86H292"/>${paths}</svg>`:'<div class="health-trend-empty">这段时间暂无睡眠记录</div>'}<div class="health-series-key">${defs.map((d,i)=>`<span><i class="sleep-key-${i}"></i>${d.label==='夜间睡眠'?'总睡眠':d.label}</span>`).join('')}</div></div>`;
}
function richCard(def,rows,chosen){
 const value=def.get(chosen),values=rows.map(def.get).filter(finite),average=meanOf(values),g=chosen.garmin||{},E=c.E,range=rows[0].date.slice(5)+' — '+rows.at(-1).date.slice(5);
 let extra='';
 if(def.key==='battery')extra=miniFact('当日最高 / 最低',`${val(g.battery?.highest)} / ${val(g.battery?.lowest)}`)+miniFact('充入 / 消耗',`${val(g.battery?.charged)} / ${val(g.battery?.drained)}`)+miniFact('平均压力',val(g.daily?.avg_stress_level??g.stress?.avg_stress_level,' /100'));
 if(def.key==='hrv'){
  const hv=g.hrv||{},statuses={BALANCED:'平衡',UNBALANCED:'不平衡',LOW:'偏低',POOR:'较低',NONE:'未取得',UNKNOWN:'未取得'},low=hv.baseline_balanced_low_ms,high=hv.baseline_balanced_upper_ms;
  extra=miniFact('佳明状态',statuses[hv.status]||hv.status||'未取得')+miniFact('佳明 7日均值',val(hv.weekly_avg_hrv_ms,' ms',1));
  if(finite(low)&&finite(high))extra+=miniFact('佳明个人平衡基线',`${val(low)}–${val(high)} ms`);
 }
 if(def.key==='steps')extra=miniFact('活动消耗',val(g.daily?.active_calories,' kcal'))+miniFact('日总消耗',val(g.daily?.total_calories,' kcal'));
 if(def.key==='weight'){
  const latest=rows.filter(h=>finite(h.weight)).at(-1);
  extra=miniFact('最近记录',latest?`${val(latest.weight,' kg',1)} · ${latest.date.slice(5)}`:'未取得');
 }
 if(def.key==='spo2')extra=miniFact('统计口径','当日平均 · 设备记录');
 if(def.key==='rhr')extra=miniFact('统计口径','当日静息值');
 if(def.key==='sleep'){
  const gs=g.sleep||{},scoreMean=meanOf(rows.map(h=>h.garmin?.sleep?.sleep_score)),deepMean=meanOf(rows.map(h=>h.garmin?.sleep?.deep_sleep_seconds));
  return `<article class="health-trend-card health-trend-card--sleep health-rich-card" data-health-card="sleep"><header class="health-card-heading"><h3>夜间睡眠</h3><span class="health-card-device">GARMIN</span></header><div class="health-sleep-reading"><div><p class="health-reading"><strong>${hours(value)}</strong></p><small class="health-reading-date">${E(chosen.date)}${gs.sleep_start&&gs.sleep_end?' · '+E(at(gs.sleep_start))+'—'+E(at(gs.sleep_end)):''}</small></div><div class="health-sleep-rating"><span>睡眠评分</span><strong>${val(gs.sleep_score)}<small> /100</small></strong></div></div>${sleepStages(gs)}${sleepTrend(rows)}<div class="health-sleep-averages">${miniFact('平均睡眠',hours(average))}${miniFact('平均深睡',hours(deepMean))}${miniFact('平均评分',val(scoreMean,' 分'))}</div><div class="health-card-footer">${miniFact('有效睡眠记录',`${values.length} / ${rows.length} 晚`)}${miniFact('趋势区间',range)}</div></article>`;
 }
 return `<article class="health-trend-card health-rich-card" data-health-card="${def.key}"><header class="health-card-heading"><h3>${E(def.label)}</h3><span class="health-card-device">${def.key==='weight'?'LOG':'GARMIN'}</span></header><p class="health-reading"><strong>${E(val(value,'',def.digits||0))}</strong>${finite(value)?`<span>${E(def.unit)}</span>`:''}</p><small class="health-reading-date">${E(chosen.date)}${def.hint?' · '+E(def.hint):''}</small>${sparkline(def,rows)}<div class="health-card-facts">${extra}${miniFact(`${rows.length}天记录均值`,average===null?'未取得':val(average,' '+def.unit,def.digits||0))}${miniFact('有效记录',`${values.length} / ${rows.length} 天`)}${miniFact('趋势区间',range)}</div></article>`;
}

function activities(start,end){
 const list=(c.state().workouts||[]).filter(w=>w.date>=start&&w.date<=end).sort((a,b)=>b.date.localeCompare(a.date)),shown=list.slice(0,30),w=shown.find(w=>w.id===selectedWorkout)||shown[0],E=c.E;
 const amount=w=>finite(w.distance)?val(w.distance,' km',2):finite(w.duration)?val(w.duration,' min',1):'用时未记录';
 return `<section class="health-activities"><div class="panel-heading"><div><h3>这段时间的训练</h3><small>${E(start)} — ${E(end)} · ${list.length} 次已记录</small></div><button class="text-link" data-page="log">全部训练 ↗</button></div>${!w?'<p class="health-empty">这个日期范围没有已保存的训练记录。</p>':`<div class="health-activity-layout"><div class="health-activity-list" aria-label="选择训练">${shown.map(x=>`<button type="button" class="health-activity-row" data-health-workout="${E(x.id)}" aria-pressed="${x.id===w.id}"><span><strong>${E(x.title||'训练记录')}</strong><small>${E(x.date)} · ${E(({trail:'越野跑',road:'路跑',strength:'力量训练',recovery:'恢复'})[x.type]||'训练')}</small></span><span>${amount(x)}</span></button>`).join('')}${list.length>shown.length?'<p class="health-note">这里显示最近30次，其余可在全部训练查看。</p>':''}</div><div class="health-activity-detail"><small>${w.source==='garmin'?'GARMIN CONNECT':'TRAINING LOG'}</small><h4>${E(w.title||'训练记录')}</h4><p>${E(w.date)}</p><div class="health-activity-stats">${cell('距离',val(w.distance,' km',2))}${cell('训练时长',val(w.duration,' min',1))}${cell('平均心率',val(w.heartRate??w.garmin?.detail?.avg_hr_bpm,' bpm'))}${cell('累计爬升',val(w.elevation??w.garmin?.detail?.elevation_gain_meters,' m'))}</div><button class="secondary" data-action="detail" data-id="${E(w.id)}">打开训练详情 ↗</button></div></div>`}</section>`;
}
function panel(full=false){
 const list=days(),state=c.state(),sync=state.garminSync,E=c.E;
 if(!list.length)return `<section class="panel garmin-panel"><h2>佳明 · 身体概览</h2><p class="health-note">还没有已保存的佳明资料。可在个人设置的连接管理中查看同步状态、提交近7天同步请求。打开页面会自动刷新已保存记录。</p></section>`;
 const latest=list[0],end=full&&dateOK(selectedDay)?selectedDay:latest.date,start=shiftDate(end,-(full?trendRange:7)+1),byDate=new Map(state.health.map(h=>[h.date,h]));
 const rows=Array.from({length:full?trendRange:7},(_,i)=>{const date=shiftDate(start,i);return byDate.get(date)||{date}}),chosen=byDate.get(end)||{date:end},gs=chosen.garmin?.sleep||{},hv=chosen.garmin?.hrv||{},battery=chosen.garmin?.battery||{},daily=chosen.garmin?.daily||{},training=chosen.garmin?.trainingStatus||{};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),last=end>today?end:today;
 let html=`<section class="panel garmin-panel health-dashboard ${full?'health-dashboard--rich':'health-dashboard--compact'}"><div class="panel-heading"><div><small class="health-eyebrow">GARMIN / BODY & RECOVERY</small><h2>身体概览</h2><small>最近同步 ${E(at(sync?.syncedAt))}</small></div>${full?`<label class="health-date-label">查看日期<input type="date" data-garmin-day aria-label="查看健康日期" value="${E(end)}" max="${E(last)}"></label>`:'<button class="text-link" data-page="health">查看健康趋势 ↗</button>'}</div>`;
 if(full)html+=`<div class="health-trend-toolbar"><div class="health-range-tabs" role="group" aria-label="趋势天数">${[7,28].map(n=>`<button type="button" data-health-range="${n}" aria-pressed="${trendRange===n}">${n}天</button>`).join('')}</div><span>${end!==latest.date?`<button type="button" class="text-link health-return-latest" data-health-date="${E(latest.date)}">最近记录 ↗</button>`:''}${E(start.slice(5))} — ${E(end.slice(5))}</span></div>`;
 html+=`<div class="health-trend-grid">${full?[0,3,6,4,2,7,1].map(i=>richCard(metricDefs[i],rows,chosen)).join(''):metricDefs.slice(0,4).map(def=>trendCard(def,rows,chosen,true)).join('')}</div><p class="health-chart-note">${full?'卡片数值对应所选日期':'数值对应 '+E(end)} · 均值仅计算已取得的记录。各图使用独立刻度，断点表示缺失，未取得不等于零。</p>`;
 if(!full)return html+'</section>';
 html+=`<div class="health-day-strip" role="group" aria-label="最近七个日期">${rows.slice(-7).map(h=>`<button type="button" data-health-date="${E(h.date)}" aria-pressed="${h.date===end}" aria-label="查看 ${E(h.date)} 的健康记录"><small>${['日','一','二','三','四','五','六'][new Date(h.date+'T12:00:00Z').getUTCDay()]}</small><strong>${h.date.slice(8)}</strong><i class="${h.garmin?'has-record':''}" aria-hidden="true"></i></button>`).join('')}</div>`;
 const ready=window.GarminSyncCore.selectReadiness(chosen.garmin?.readiness||[]);
 html+=`<details class="metric-fold"><summary>查看这一天的完整设备指标</summary><div class="garmin-metrics">${cell('平均压力',val(daily.avg_stress_level??chosen.garmin?.stress?.avg_stress_level,' /100'),end)}${cell('小睡（另列）',hours(gs.nap_seconds),end)}${cell('夜间清醒次数',val(gs.awake_count,' 次'),end)}${cell('入睡时间 · 北京时间',gs.sleep_start?at(gs.sleep_start):'未取得',end)}${cell('醒来时间 · 北京时间',gs.sleep_end?at(gs.sleep_end):'未取得',end)}${cell('7日平均 HRV · 佳明',val(hv.weekly_avg_hrv_ms,' ms',1),hv.date||end)}${cell('训练准备度 · 已保存设备记录',val(ready.score,' /100'),ready.date||end)}${cell('恢复时间 · 佳明估算',val(ready.recovery_time_hours,' 小时',1),ready.date||end)}${cell('7日平均 HRV · 准备度来源',val(ready.hrv_weekly_avg,' ms'),ready.date||end)}${cell('Body Battery 当日最高',val(battery.highest,' 点'),end)}${cell('Body Battery 当日最低',val(battery.lowest,' 点'),end)}${cell('当日充入电量（非当前电量）',val(battery.charged,' 点'),end)}${cell('当日消耗电量',val(battery.drained,' 点'),end)}${cell('Body Battery 等级',({HIGH:'较高',MODERATE:'中等',MEDIUM:'中等',LOW:'较低',VERY_LOW:'很低'})[battery.body_battery_level]||battery.body_battery_level||'未取得',end)}${cell('活动消耗',val(daily.active_calories,' kcal'),end)}${cell('日总消耗',val(daily.total_calories,' kcal'),end)}${cell('清醒平均呼吸频率',val(daily.avg_waking_respiration,' 次/分',1),end)}${cell('平均血氧 · 设备记录',val(daily.avg_spo2_percent,' %',1),end)}${cell('急性负荷 · 佳明指标',val(training.acute_load),training.date||end)}${cell('慢性负荷 · 佳明指标',val(training.chronic_load),training.date||end)}${cell('VO₂ max · 佳明估算',val(training.vo2_max,'',1),training.date||end)}</div><p class="health-note">准备度、恢复时间与负荷采用已保存的佳明记录，不自行生成评分或补齐缺项。体重来自同日已保存的健康日志。历史记录与手填感受均继续保留。</p></details>${activities(start,end)}`;
 const count=historyRange==='all'?list.length:Number(historyRange);
 html+=`<details class="metric-fold health-history" ${historyOpen?'open':''}><summary>历史记录与同步范围 · ${list.length} 天已归档</summary><p class="health-note">${E(list.at(-1).date)} — ${E(latest.date)} · 取得 ${list.filter(h=>h.garmin.sleep?.sleep_seconds>0).length} 晚睡眠。当前云端增量同步近7天；已保存范围不代表完整历史，空白不代表休息日。${sync?.gaps?.length?'本次有 '+sync.gaps.length+' 项接口暂不可用，已保留原有资料。':''}</p><div class="panel-heading"><label class="garmin-range">显示范围 <select data-garmin-range aria-label="历史健康记录范围"><option value="30" ${historyRange==='30'?'selected':''}>最近30条</option><option value="90" ${historyRange==='90'?'selected':''}>最近90条</option><option value="all" ${historyRange==='all'?'selected':''}>全部已同步记录</option></select></label></div><div class="table-scroll"><table class="history-table"><thead><tr><th>日期</th><th>睡眠</th><th>评分</th><th>静息心率</th><th>整夜 HRV</th><th>压力</th></tr></thead><tbody>${list.slice(0,count).map(h=>`<tr><td><button type="button" class="text-link" data-health-date="${E(h.date)}">${E(h.date)}</button></td><td>${hours(h.garmin.sleep?.sleep_seconds)}</td><td>${val(h.garmin.sleep?.sleep_score)}</td><td>${val(h.garmin.heartRate?.resting_heart_rate_bpm,' bpm')}</td><td>${val(h.garmin.hrv?.last_night_avg_hrv_ms??h.garmin.sleep?.avg_overnight_hrv,' ms',1)}</td><td>${val(h.garmin.daily?.avg_stress_level??h.garmin.stress?.avg_stress_level)}</td></tr>`).join('')}</tbody></table></div><div class="button-row"><button class="secondary" data-garmin-history>历史补取说明</button><button class="secondary" data-garmin-page-refresh>刷新已保存资料</button></div><p class="health-note" id="garmin-history-status"></p></details><p class="health-note">设备估算与趋势用于日常记录，不替代医疗评估。缺失资料不代表没有佩戴或已经休息。</p>`;
 return html+'</section>';
}

const pace=(seconds,meters)=>finite(seconds)&&seconds>0&&finite(meters)&&meters>0?(()=>{const s=Math.round(seconds/meters*1000);return `${Math.floor(s/60)}′${String(s%60).padStart(2,'0')}″ /km`})():'未取得';
function workout(w){if(w.source!=='garmin')return '';const g=w.garmin||{},d=g.detail||{},E=c.E;
 const fields=[['原始活动名称',d.name||'未取得',''],['训练类型',d.type||'未取得',''],['最大心率',val(d.max_hr_bpm,' bpm'),''],['热量',val(d.calories,' kcal'),''],['平均步频 · 佳明原值',val(d.avg_cadence,' /min',1),''],['平均功率',val(d.avg_power_watts,' W'),''],['累计爬升',val(d.elevation_gain_meters,' m',1),''],['累计下降',val(d.elevation_loss_meters,' m',1),''],['有氧训练效果',val(d.training_effect,' /5',1),''],['无氧训练效果',val(d.anaerobic_training_effect,' /5',1),''],['训练负荷',val(d.training_load,'',1),''],['移动时长',duration(d.moving_duration_seconds),''],['总经过时间',duration(d.elapsed_duration_seconds),''],['平均触地时间',val(d.avg_ground_contact_time_ms,' ms',1),''],['平均步幅',val(d.avg_stride_length_cm,' cm',1),''],['平均垂直振幅',val(d.avg_vertical_oscillation_cm,' cm',1),'']];
 fields.push(['开始时间 · 佳明本地时间',d.start_time_local||'未取得'],['平均配速 · 按运动时长/距离计算',pace(d.duration_seconds,d.distance_meters)],['移动配速 · 按移动时长/距离计算',pace(d.moving_duration_seconds,d.distance_meters)],['最快速度',val(finite(d.max_speed_mps)?d.max_speed_mps*3.6:null,' km/h',1)],['最大步频 · 佳明原值',val(d.max_cadence,' /min',1)],['最大功率',val(d.max_power_watts,' W')],['步数',val(d.steps,' 步')],['垂直比',val(d.avg_vertical_ratio_percent,' %',1)],['触地平衡 · 设备原值',val(d.avg_ground_contact_balance_percent,' %',1)],['最低海拔',typeof d.min_elevation_meters==='number'?d.min_elevation_meters.toFixed(1)+' m':'未取得'],['最高海拔',typeof d.max_elevation_meters==='number'?d.max_elevation_meters.toFixed(1)+' m':'未取得'],['平均温度 · 设备传感器',typeof d.avg_temperature_c==='number'?d.avg_temperature_c.toFixed(1)+' °C':'未取得'],['平均呼吸频率',val(d.avg_respiration_rate,' 次/分',1)],['估计汗液流失 · 设备估算',val(d.estimated_sweat_loss_ml,' ml')],['Body Battery 变化 · 设备原值',typeof d.body_battery_impact==='number'?(d.body_battery_impact>0?'+':'')+d.body_battery_impact+' 点':'未取得'],['运动后 VO₂ max · 设备估算',val(d.vo2_max,'',1)]);
 let html=`<section class="garmin-workout"><div class="panel-heading"><h3>佳明训练详情</h3><button type="button" class="secondary" data-garmin-detail="${E(w.sourceActivityId)}">线上补取说明</button></div><small>训练日期 ${E(w.date)} · 详情读取 ${E(at(g.fetchedAt))}</small><p class="health-note" data-detail-sync-status></p><div class="garmin-metrics">${fields.filter((_,i)=>[2,3,6,8,9,10,11,17].includes(i)).map(([k,v])=>cell(k,v,'')).join('')}</div><details class="metric-fold"><summary>更多运动指标 · 功率、步态与环境</summary><div class="garmin-metrics">${fields.filter((_,i)=>![2,3,6,8,9,10,11,17].includes(i)).map(([k,v])=>cell(k,v,'')).join('')}</div></details>`;
 const zones=(g.hrZones||[]).filter(z=>finite(z.secsInZone)),total=zones.reduce((n,z)=>n+z.secsInZone,0);
 html+=`<h3>心率区间 · 佳明设备记录</h3>${zones.length?`<p class="health-note">已返回区间合计 ${duration(total)}；分区边界来自本次设备记录，未自行推算你的最大心率。</p><div class="garmin-zones">${zones.map(z=>`<div><span>Z${E(z.zoneNumber)} · ${val(z.zoneLowBoundary,' bpm 起')}</span><i style="width:${total?Math.min(100,z.secsInZone/total*100):0}%"></i><strong>${duration(z.secsInZone)} · ${total?Math.round(z.secsInZone/total*100):0}%</strong></div>`).join('')}</div>`:'<p class="health-note">暂未取得本次心率区间。线上尚未提供指定运动补取，已有详情继续保留。</p>'}`;
 if(g.laps?.length)html+=`<h3>分圈 · 佳明原始分圈</h3><div class="table-scroll"><table class="history-table"><thead><tr><th>圈</th><th>距离</th><th>时长</th><th>计算配速</th><th>平均/最大心率</th><th>步频原值</th><th>功率</th><th>热量</th></tr></thead><tbody>${g.laps.map((l,i)=>`<tr><td>${E(l.lap_number??i+1)}</td><td>${val(finite(l.distance_meters)?l.distance_meters/1000:null,' km',2)}</td><td>${duration(l.duration_seconds)}</td><td>${pace(l.duration_seconds,l.distance_meters)}</td><td>${val(l.avg_hr_bpm)} / ${val(l.max_hr_bpm)} bpm</td><td>${val(l.avg_cadence,' /min',1)}</td><td>${val(l.avg_power_watts,' W')}</td><td>${val(l.calories,' kcal')}</td></tr>`).join('')}</tbody></table></div>`;
 if(g.strengthSets?.length)html+=`<h3>设备力量组次</h3><p class="health-note">以下为设备记录，不自动匹配到A/B动作或替代本人确认的组次。</p><div class="table-scroll"><table class="history-table"><thead><tr><th>组</th><th>类型</th><th>次数</th><th>重量 / 设备单位</th><th>时长（设备原值）</th></tr></thead><tbody>${g.strengthSets.map((s,i)=>`<tr><td>${i+1}</td><td>${E(s.setType||'未取得')}</td><td>${val(s.repetitionCount)}</td><td>${E(finite(s.weight)?String(s.weight)+(s.weightUnit?' / '+s.weightUnit:' / 单位未取得'):'未取得')}</td><td>${val(s.duration)}</td></tr>`).join('')}</tbody></table></div>`;
 return html+`<p class="health-note">缺失指标显示“未取得”；步频保留佳明原值，没有自行换算单双脚计数。云端定时任务会检查近7天的新运动和缺少详情的运动，线上尚未提供指定运动或完整历史补取。${g.complete?'本次详情已检查。':'本次详情仍有缺项，已取得的指标继续保留。'} 设备估算的消耗、汗液与负荷不作为补给或健康诊断的精确依据。</p></section>`;
}
document.addEventListener('change',e=>{if(e.target.matches('[data-garmin-day]')){if(dateOK(e.target.value)){selectedDay=e.target.value;c.render()}}});
document.addEventListener('change',e=>{if(e.target.matches('[data-garmin-range]')){historyRange=e.target.value;historyOpen=true;c.render()}});
document.addEventListener('click',async e=>{
 const dateButton=e.target.closest('[data-health-date]');if(dateButton&&dateOK(dateButton.dataset.healthDate)){selectedDay=dateButton.dataset.healthDate;c.render();return}
 const rangeButton=e.target.closest('[data-health-range]');if(rangeButton&&[7,28].includes(Number(rangeButton.dataset.healthRange))){trendRange=Number(rangeButton.dataset.healthRange);c.render();return}
 const workoutButton=e.target.closest('[data-health-workout]');if(workoutButton){selectedWorkout=workoutButton.dataset.healthWorkout;c.render();return}

 if(e.target.closest('[data-garmin-history]')){const d=await window.WildLocal?.start('history');const out=document.querySelector('#garmin-history-status');if(out)out.textContent=d?.error||d?.message||'线上尚未提供完整历史补取，已有资料保留。';return}
 if(e.target.closest('[data-garmin-page-refresh]'))document.querySelector('#local-refresh')?.click();
 const b=e.target.closest('[data-garmin-detail]');if(!b)return;const out=document.querySelector('[data-detail-sync-status]');b.disabled=true;
 try{const r=await fetch('/api/garmin-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'activity',activityId:b.dataset.garminDetail})});const d=await r.json();if(out)out.textContent=d.error||d.message||'尚未确认本次补取已启动，已有详情保留。'}
 catch{if(out)out.textContent='暂时无法读取补取状态，已有运动详情保留。'}finally{b.disabled=false}
});
window.addEventListener('garmin-job',e=>{const el=document.querySelector('#garmin-history-status');if(el){const j=e.detail;el.textContent=j.cloud?j.message||j.stage||'':j.status==='running'?`${j.stage} · 恢复 ${j.daysDone||0}/${j.totalDays||'—'} 天 · 运动详情 ${j.activitiesDone||0}/${j.activityCount||'—'} 次`:j.message||''}});
window.WildGarmin={configure:ctx=>{c=ctx},panel,workout};
})();
