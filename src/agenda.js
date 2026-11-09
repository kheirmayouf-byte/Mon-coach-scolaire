import {dateKey,validDate,daySlot} from './core.js';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const addDays=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d);};
export const monday=date=>addDays(date,-((new Date(date+'T12:00:00').getDay()+6)%7));
export const categories={
 exercise:{label:'Exercice',priority:2,icon:'✎',color:'blue'},
 exercise_assessment:{label:'Exercice pour un contrôle',priority:1,icon:'🎯',color:'coral'},
 revision:{label:'Révision sans contrôle',priority:3,icon:'🌱',color:'green'},
 revision_assessment:{label:'Révision pour un contrôle',priority:1,icon:'🎯',color:'amber'},
 national:{label:'Évaluation nationale · préparation',priority:1,icon:'🏅',color:'violet'}
};
export function classifyTask(task,override){
 const text=norm(task.subject+' '+task.description),clean=text.replace(/(?:sans|pas d[e’']?)\s+(?:controle|evaluation|interrogation)/g,'');
 const national=/evaluations?\s+nationales?/.test(clean),assessment=national||/controle|evaluation|interrogation|\bds\b|\btest\b/.test(clean)||!!task.is_assessment&&!/sans\s+(controle|evaluation)/.test(text);
 const exercise=/exercices?|\bex\.?\s*\d|redig|resou|calcul|complet|repond|probleme/.test(text),revision=/revis|apprend|memor|lecon|relire|reciter|vocabulaire|prepar/.test(text);
 const key=Object.hasOwn(categories,override)?override:national?'national':assessment?(exercise?'exercise_assessment':'revision_assessment'):revision&&!exercise?'revision':'exercise';
 return {key,...categories[key],manual:!!override};
}
export const minuteOf=time=>/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'')?Number(time.slice(0,2))*60+Number(time.slice(3)):null;
export const clock=n=>n==null?'À fixer':`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function startOf(date,pref,fallback){const p=daySlot(date,pref,fallback);let n=minuteOf(p.start);if(n===null){const match=String(p.start||'').match(/(?:^|\s)([01]?\d|2[0-3])\s*[h:]\s*([0-5]\d)?/i);if(match)n=Number(match[1])*60+Number(match[2]||0);}const exact=n!==null;if(!exact){const text=norm(p.start);n=/midi|dejeuner/.test(text)?750:/matin|morning/.test(text)?600:/soir|evening/.test(text)?1080:[0,6].includes(new Date(date+'T12:00:00').getDay())?600:1050;}return {...p,startMinute:n,indicative:!exact};}
// Every remaining minute has a dated card. Capacity/deadline conflicts remain explicit.
export function buildAgenda(tasks,preferences=[],profiles=[],rules=[],today=dateKey(),fallback=40,nowMinute=null){
 const slots=[],days=new Map();let ignoredPins=0;
 const getDay=(child,date)=>{const key=child+'|'+date;if(!days.has(key)){const pref=preferences.find(p=>(p.child||p.child_id)===child),setting=startOf(date,pref,fallback);if(date===today&&nowMinute!==null){const passed=Math.max(0,Math.ceil(nowMinute/5)*5-setting.startMinute);setting.capacity=Math.max(0,setting.capacity-passed);if(passed){setting.startMinute+=passed;setting.indicative=true;}}days.set(key,{child,date,...setting,slots:[],work:0,breaks:0,total:0});}return days.get(key);};
 const active=tasks.filter(t=>!t.done).map(task=>{const rule=rules.find(r=>r.task_id===task.id&&(r.child||r.child_id)===task.child),kind=classifyTask(task,rule?.category);return {task,rule,kind};}).sort((a,b)=>a.kind.priority-b.kind.priority||a.task.due.localeCompare(b.task.due)||a.task.id.localeCompare(b.task.id));
 const blocks=[];
 for(const {task,rule,kind} of active){const requested=profiles.find(p=>(p.child||p.child_id)===task.child)?.settings?.session_minutes,chunk=Number.isInteger(requested)&&requested>=5&&requested<=25?requested:20;const count=Math.ceil((task.minutes||20)/chunk);for(let i=0;i<count;i++){const pin=rule?.placements?.[i];const valid=pin&&validDate(pin.date)&&pin.date>=today&&pin.date>=task.given&&minuteOf(pin.time)!==null&&minuteOf(pin.time)+Math.min(chunk,(task.minutes||20)-i*chunk)<=1440;if(pin&&!valid)ignoredPins++;blocks.push({id:task.id+':'+i,block:i,count,task,kind,minutes:Math.min(chunk,(task.minutes||20)-i*chunk),pin:valid?pin:null});}}
 function put(block,date,pin=null){const d=getDay(block.task.child,date),s={...block,date,start:pin?minuteOf(pin.time):null,pinned:!!pin};d.slots.push(s);d.work+=s.minutes;d.breaks=Math.max(0,d.slots.length-1)*5;d.total=d.work+d.breaks;slots.push(s);return s;}
 for(const b of blocks.filter(b=>b.pin))put(b,b.pin.date,b.pin);
 for(const b of blocks.filter(b=>!b.pin)){
  let first=b.task.given>today?b.task.given:today;const before=slots.filter(s=>s.task.id===b.task.id&&s.block<b.block);for(const prior of before)if(prior.date>first)first=prior.date;let last=b.task.due>first?addDays(b.task.due,-1):first;const nextPins=blocks.filter(s=>s.task.id===b.task.id&&s.block>b.block&&s.pin).map(s=>s.pin.date).sort();if(nextPins[0]&&nextPins[0]<last)last=nextPins[0];if(last<first)last=first;
  let candidates=[];for(let date=first;date<=last&&date<=addDays(first,89);date=addDays(date,1)){const d=getDay(b.task.child,date);candidates.push(d);}
  const fitting=candidates.filter(d=>d.capacity>=d.total+b.minutes+(d.slots.length?5:0));
  const pool=fitting.length?fitting:candidates.filter(d=>d.capacity>0).length?candidates.filter(d=>d.capacity>0):candidates;
  pool.sort((a,b)=>(a.total/Math.max(1,a.capacity)-b.total/Math.max(1,b.capacity))||a.date.localeCompare(b.date));
  put(b,pool[0].date);
 }
 for(const d of days.values()){
  const occupied=d.slots.filter(s=>s.pinned).map(s=>({start:s.start,end:s.start+s.minutes,slot:s}));
  for(const s of d.slots.filter(s=>!s.pinned)){
   let n=Math.max(d.startMinute,...d.slots.filter(o=>o.task.id===s.task.id&&o.block<s.block&&o.start!==null).map(o=>o.start+o.minutes+5));for(const other of occupied.slice().sort((a,b)=>a.start-b.start)){if(n+s.minutes+5<=other.start)break;if(n<other.end+5&&n+s.minutes+5>other.start)n=other.end+5;}
   s.start=n+s.minutes<=1440?n:null;if(s.start!==null)occupied.push({start:n,end:n+s.minutes,slot:s});
  }
  d.slots.sort((a,b)=>(a.start??1441)-(b.start??1441)||a.id.localeCompare(b.id));
  d.overload=Math.max(0,d.total-d.capacity);d.closed=d.capacity===0&&d.slots.length>0;
  for(const s of d.slots){s.end=s.start===null?null:s.start+s.minutes;s.indicative=!s.pinned&&d.indicative;s.label=d.label;s.overload=d.overload;s.closed=d.closed;s.pastDeadline=s.date>s.task.due;s.dueToday=s.date===s.task.due;s.noTime=s.start===null;s.lateHour=s.end!==null&&s.end>1320;s.outsideWindow=s.start!==null&&(s.start<d.startMinute||s.end>d.startMinute+d.capacity);s.conflict=d.slots.some(o=>o!==s&&o.start!==null&&s.start!==null&&s.start<o.start+o.minutes+5&&s.end+5>o.start);s.pastTime=s.pinned&&s.date===today&&nowMinute!==null&&s.end<=nowMinute;s.orderConflict=slots.some(o=>o.task.id===s.task.id&&o.block<s.block&&(o.date>s.date||o.date===s.date&&o.start!==null&&s.start!==null&&o.start>s.start));s.warning=s.orderConflict||s.pastTime||s.pastDeadline||s.dueToday||s.overload>0||s.closed||s.noTime||s.conflict||s.lateHour||s.outsideWindow;}
 }
 return {slots,days:[...days.values()],ignoredPins,taskCount:active.length,minutes:slots.reduce((n,s)=>n+s.minutes,0)};
}
export function validateMove(slot,date,time,today=dateKey()){
 if(!validDate(date)||date<today||date<slot.task.given)throw Error('Choisis une date à partir d’aujourd’hui, après la distribution du devoir.');
 const n=minuteOf(time);if(n===null||n+slot.minutes>1440)throw Error('Choisis un horaire valide qui se termine dans la journée.');
 return {date,time};
}
