/* Validate an entire backup before it can replace state, cache, or rendered content.
 * Keep numeric limits and required record shapes aligned with lib/training.ts.
 */
(() => {
'use strict';
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const optionalNumber=(value,min,max)=>value===null||value===''||value===undefined||(typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max);
const finiteNumber=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function dateValid(value,allowFuture=true){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T12:00:00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value&&(allowFuture||value<=today())}
const unique=items=>new Set(items.map(item=>item.id)).size===items.length;
function validDossier(d){
 if(!record(d)||JSON.stringify(d).length>800000)return false;
 if(!['gear','stations','sources'].every(key=>Array.isArray(d[key])&&d[key].length<=300))return false;
 if(!record(d.plan)||!record(d.logistics))return false;
 for(const value of Object.values(d))if(typeof value==='string'&&value.length>12000)return false;
 for(const key of ['courseDistance','ascent','descent','cutoffHours','mandatoryTotal'])if(!optionalNumber(d[key],0,100000))return false;
 if(!d.gear.every(item=>record(item)&&text(item.id,100)&&text(item.name,200)&&text(item.note??'',6000)&&typeof item.done==='boolean'&&typeof item.mandatory==='boolean'))return false;
 if(!d.stations.every(item=>record(item)&&text(item.id,100)&&text(item.name,100)&&optionalNumber(item.km,0,2000)&&text(item.closeTime??'',100)&&text(item.note??'',6000)))return false;
 if(!d.sources.every(item=>record(item)&&text(item.id,100)&&text(item.title,300)&&text(item.url,4000)&&text(item.publisher??'',200)&&text(item.summary??'',12000)&&typeof item.verified==='boolean'))return false;
 if(!Object.values(d.plan).every(value=>text(value,6000))||!Object.values(d.logistics).every(value=>text(value,6000)))return false;
 return ['gear','stations','sources'].every(key=>unique(d[key]));
}
function validState(s){
 try{
  if(!record(s)||s.schemaVersion!==2||!record(s.profile)||typeof s.profile.coachConsent!=='boolean')return false;
  for(const key of ['workouts','health','races','customExercises'])if(!Array.isArray(s[key])||s[key].length>12000)return false;
  const profile=s.profile;
  if(!text(profile.name,30)||!optionalNumber(profile.weeklyKm,1,1000)||!optionalNumber(profile.weeklyStrength,1,14))return false;
  for(const key of ['experience','availableDays','injury','notes'])if(!text(profile[key]??'',4000))return false;
  if(!s.workouts.every(workout=>record(workout)&&text(workout.id,100)&&text(workout.title??'',100)&&dateValid(workout.date,false)&&['road','trail','strength','other'].includes(workout.type)&&finiteNumber(workout.duration,1,5000)&&optionalNumber(workout.distance,0,2000)&&optionalNumber(workout.elevation,0,50000)&&optionalNumber(workout.heartRate,25,250)&&optionalNumber(workout.rpe,1,10)&&text(workout.notes??'',4000)&&Array.isArray(workout.exercises)&&workout.exercises.length<=200&&workout.exercises.every(exercise=>record(exercise)&&text(exercise.id,100)&&text(exercise.name,200)&&Array.isArray(exercise.sets)&&exercise.sets.length>0&&exercise.sets.length<=200&&exercise.sets.every(set=>record(set)&&optionalNumber(set.weight,0,1500)&&finiteNumber(set.reps,1,10000)&&['reps','seconds'].includes(set.mode)))))return false;
  if(!s.health.every(health=>record(health)&&text(health.id,100)&&dateValid(health.date,false)&&optionalNumber(health.sleep,0,24)&&optionalNumber(health.restHr,25,250)&&optionalNumber(health.weight,20,400)&&optionalNumber(health.fatigue,0,10)&&optionalNumber(health.pain,0,10)&&text(health.notes??'',4000)))return false;
  if(!s.races.every(race=>record(race)&&text(race.id,100)&&text(race.name,120)&&['road','trail'].includes(race.type)&&['A','B','C'].includes(race.priority)&&(!race.date||dateValid(race.date))&&optionalNumber(race.distance,0.1,2000)&&optionalNumber(race.elevation,0,100000)&&text(race.goal??'',300)&&(race.dossier===undefined||validDossier(race.dossier))))return false;
  if(!s.customExercises.every(exercise=>record(exercise)&&text(exercise.id,100)&&text(exercise.name,100)&&text(exercise.group,50)&&text(exercise.equipment,50)&&text(exercise.muscles??'',300)&&(exercise.instructions===undefined||(Array.isArray(exercise.instructions)&&exercise.instructions.length<=200&&exercise.instructions.every(value=>text(value,6000))))))return false;
  return ['workouts','health','races','customExercises'].every(key=>unique(s[key]))&&new Set(s.health.map(health=>health.date)).size===s.health.length;
 }catch{return false}
}
window.WildValidation={validState,validDossier};
})();
