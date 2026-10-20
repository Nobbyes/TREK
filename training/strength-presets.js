/* Personal routine templates. Planned sets do not create completed workouts. */
(() => {
const item=(id,name,reps,options={})=>({id,name,sets:2,reps,mode:'reps',...options});
const step=item('routine-step-down','Step-down 台阶下蹲',8,{perSide:true,cue:'下降3秒，膝盖对准脚尖；轻触地后起身。'});
window.WildStrengthPrograms=[
 {id:'strength-a',short:'A',title:'A 套 · 下肢力量＋核心稳定',description:'臀腿力量、单腿稳定与核心控制',durationHint:'原方案预计30–40分钟；记录时填写实际用时',source:'已确定的 A 套方案',notes:'原方案参考：热身5分钟；组间休息45–75秒，分腿蹲可90秒；原计划RPE6–7。以上是计划参考，实际时长、负重与RPE请按完成情况填写。',exercises:[
  item('ex2','保加利亚分腿蹲',10,{perSide:true,cue:'下降2–3秒。'}),
  item('ex5','单腿罗马尼亚硬拉',8,{perSide:true,cue:'屈髋，骨盆保持稳定。'}),
  {...step},
  item('ex10','站姿提踵',15,{range:'15–20',cue:'顶端停1秒，缓慢下降。'}),
  item('ex21','侧平板支撑',30,{perSide:true,mode:'seconds',range:'30–40',cue:'保持侧向稳定，骨盆不下沉。'}),
  item('ex20','平板支撑',60,{mode:'seconds',cue:'保持正常呼吸。'})
 ]},
 {id:'strength-b',short:'B',title:'B 套 · 臀髋稳定＋下坡控制',description:'按你补充的 B 套清单整理',durationHint:'6 个动作 · 每动作 2 组 · 按实际情况记录',source:'本人于2026-10-19补充的 B 套完整清单',notes:'动作与组次按本人提供的B套方案预填。单侧动作按每侧完成；实际用时、负重及主观强度请自行填写。',exercises:[
  item('ex26','弹力带侧向行走',12,{perDirection:true,range:'12–15',unit:'步',cue:'膝盖对准脚尖，骨盆稳定，臀外侧发力。'}),
  {...step,cue:'下降3秒；右膝不要内扣，轻触地后起身。'},
  item('routine-single-leg-bridge','单腿臀桥',12,{perSide:true,cue:'顶端停1秒，骨盆不要旋转。'}),
  item('ex5','单腿罗马尼亚硬拉',8,{perSide:true,cue:'屈髋，背部中立；感受臀和腘绳肌，不追求下得深。'}),
  item('ex21','侧平板支撑',30,{perSide:true,mode:'seconds',cue:'身体成直线，骨盆不下沉。'}),
  item('ex10','站姿提踵',15,{range:'15–20',cue:'慢起慢落，顶部停1秒。'})
 ]}
];
})();
