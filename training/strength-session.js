/* Pure session accounting: elapsed timers never imply a completed set. */
(() => {
const copy=x=>JSON.parse(JSON.stringify(x));
function create(draft){
 if(draft.type!=='strength'||!draft.exercises?.length)throw Error('请先选择力量动作');
 const queue=[];
 draft.exercises.forEach((x,i)=>x.sets.forEach((set,j)=>{
  const sided=x.perSide||x.perDirection||/每侧|每方向/.test(x.name);
  for(const side of sided?['left','right']:['both'])queue.push({exercise:i,set:j,side,mode:set.mode||'reps',target:Number(set.reps)||1});
 }));
 if(queue.length>1000)throw Error('本次动作过多，请拆成多次训练');
 return {version:1,draft:copy(draft),queue,index:0,phase:'ready',phaseMs:0,elapsedMs:0,restSeconds:60,paused:false,results:[],voice:true,voiceStatus:'点击开始后启用',cue:'准备好后点击开始本组',lastCountdown:null};
}
function current(s){return s.queue[s.index]}
function begin(s){if(!['ready','switch'].includes(s.phase))return;s.phase='work';s.phaseMs=0;s.paused=false;s.lastCountdown=null}
function tick(s,delta){if(s.paused||!['work','rest'].includes(s.phase))return;delta=Math.max(0,delta);const item=current(s);if(s.phase==='work'&&item?.mode==='seconds')delta=Math.min(delta,Math.max(0,item.target*1000-s.phaseMs));s.elapsedMs+=delta;s.phaseMs+=delta;if(s.phase==='work'&&item?.mode==='seconds'&&s.phaseMs>=item.target*1000)s.phase='confirm';if(s.phase==='rest'&&s.phaseMs>=s.restSeconds*1000){s.phase='ready';s.phaseMs=0}}
function complete(s,quantity,weight){
 if(!['work','confirm'].includes(s.phase)||s.paused)return false;
 if(!Number.isFinite(quantity)||quantity<1||quantity>10000)throw Error('请确认实际完成次数或秒数');
 if(weight!==null&&(!Number.isFinite(weight)||weight<0||weight>1500))throw Error('请检查实际负重');
 const item=current(s);s.results.push({...item,quantity,weight,elapsedMs:s.phaseMs});s.index++;s.phaseMs=0;
 const next=current(s);
 s.phase=!next?'finished':next.exercise===item.exercise&&next.set===item.set?'switch':'rest';return true;
}
function progress(s){const completed=new Set();for(const r of s.results){const key=r.exercise+':'+r.set;const all=s.queue.filter(q=>q.exercise===r.exercise&&q.set===r.set);if(all.every(q=>s.results.some(v=>v.exercise===q.exercise&&v.set===q.set&&v.side===q.side)))completed.add(key)}return {done:completed.size,total:s.draft.exercises.reduce((n,e)=>n+e.sets.length,0),segments:s.results.length}}
function review(s){
 const output=copy(s.draft);output.exercises=[];
 for(const r of s.results){const source=s.draft.exercises[r.exercise],suffix=r.side==='both'?'':r.side==='left'?'（左侧）':'（右侧）',key=r.exercise+':'+r.side;let x=output.exercises.find(x=>x.focusKey===key);if(!x){x={...source,id:source.id.slice(0,80)+(r.side==='both'?'':'-'+r.side),focusKey:key,name:source.name.replace(/（每侧）|（每方向）/g,'')+suffix,perSide:false,perDirection:false,sets:[]};output.exercises.push(x)}x.sets.push({weight:r.weight,reps:r.quantity,mode:r.mode})}
 output.duration=s.elapsedMs>=60000?Math.round(s.elapsedMs/6000)/10:'';output.rpe=null;
 output.focusSession={version:1,elapsedSeconds:Math.round(s.elapsedMs/1000),completedGroups:progress(s).done,plannedGroups:progress(s).total,segments:s.results.length,partial:s.index<s.queue.length};
 output.notes=(output.templateNotes||output.notes||'')+'\n专注训练：仅记录本人确认完成的组次；左右侧分别列出，计时含休息、不含暂停。';
 return output;
}
window.WildSession={create,current,begin,tick,complete,progress,review};
})();
