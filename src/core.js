export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(new Date(s+'T12:00:00')) === s; }
export function validateTask(t) {
  if (!t.child || !t.subject?.trim() || t.subject.length>80 || !t.description?.trim() || t.description.length>4000) throw Error('Renseigne une matière (80 caractères maximum) et une consigne (4 000 maximum).');
  if (!validDate(t.given) || !validDate(t.due) || t.due < t.given) throw Error('Vérifie les dates : l’échéance doit suivre la date donnée.');
  if (!Number.isInteger(t.minutes) || t.minutes<5 || t.minutes>240) throw Error('Prévois entre 5 et 240 minutes.');
  return t;
}
// A proposal only: daily capacity per child, chunks <=25 min, no work before given.
export function plan(tasks, capacity=40, start=dateKey(), horizon=14, preferences=[],profiles=[]) {
  const slots=[], unscheduled=[];
  const priority=t=>Date.parse(t.due+'T12:00:00')-(t.is_assessment?2*86400000:0);
  const used=new Map();
  for (const t of tasks.filter(t=>!t.done).slice().sort((a,b)=>priority(a)-priority(b)||a.due.localeCompare(b.due)||a.given.localeCompare(b.given)||a.id.localeCompare(b.id))) {
    let remaining=t.minutes||20;
    const requested=profiles.find(p=>p.child===t.child||p.child_id===t.child)?.settings?.session_minutes;
    const chunkLimit=Number.isInteger(requested)&&requested>=5&&requested<=25?requested:25;
    for(let day=0; day<horizon && remaining>0; day++) {
      const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+day);const date=dateKey(d);
      if(date<t.given || date>t.due) continue;
      const slot=daySlot(date,preferences.find(p=>p.child===t.child||p.child_id===t.child),capacity);
      const key=t.child+date;
      while(remaining>0) {
        const previous=used.get(key)||0, pause=previous?5:0;
        const available=slot.capacity-previous-pause;
        if(available<=0)break;
        const minutes=Math.min(chunkLimit,available,remaining);
        slots.push({task:t,date,minutes,label:slot.label,start:slot.start,pause_before:pause});remaining-=minutes;
        used.set(key,previous+pause+minutes);
      }
    }
    if(remaining) unscheduled.push({task:t,minutes:remaining});
  }
  return {slots,unscheduled};
}
export function parseImport(text, children, allowedChild) {
  const tasks=[], errors=[];
  text.split(/\r?\n/).forEach((line,i)=>{
    if(!line.trim()) return;
    const p=line.split('|').map(s=>s.trim());
    const child=children.find(c=>c.name.toLowerCase()===p[0].toLowerCase());
    try {
      if(p.length<5 || !child || (allowedChild && allowedChild!==child.id)) throw Error('Espace enfant incorrect.');
      tasks.push(validateTask({id:crypto.randomUUID(),child:child.id,subject:p[1],given:p[2],due:p[3],description:p.slice(4).join(' | '),minutes:20,done:false}));
    }catch(e){errors.push(`Ligne ${i+1} : ${e.message}`);}
  });
  return {tasks,errors};
}
export function nextReview(level, now=dateKey()) {
  const d=new Date(now+'T12:00:00');d.setDate(d.getDate()+[1,3,7,14,30][Math.min(4,Math.max(0,level))]);return dateKey(d);
}

export function validatePreferences(p) {
 for(const key of ['week_minutes','day_labels','day_starts'])if(!Array.isArray(p[key])||p[key].length!==7)throw Error('Renseigne les sept jours du planning.');
 if(p.week_minutes.some(n=>!Number.isInteger(n)||n<0||n>120))throw Error('Prévois entre 0 et 120 minutes par jour.');
 if([...p.day_labels,...p.day_starts,p.monday_home_start].some(s=>typeof s!=='string'||s.length>100))throw Error('Limite les libellés à 100 caractères.');
 if(p.alternating_monday&&(!validDate(p.monday_anchor)||new Date(p.monday_anchor+'T12:00:00').getDay()!==1))throw Error('Le lundi de référence doit être une date de lundi.');
 if(!Number.isInteger(p.monday_home_minutes)||p.monday_home_minutes<0||p.monday_home_minutes>120||!Number.isInteger(p.vacation_minutes)||p.vacation_minutes<5||p.vacation_minutes>40||!['morning','noon'].includes(p.vacation_slot))throw Error('Vérifie les durées du lundi et des vacances.');
 return p;
}
export function daySlot(date,p,fallback=40) {
 if(!p)return {capacity:fallback,label:'Séance à organiser',start:''};
 if(p.vacation_mode)return {capacity:p.vacation_minutes,label:'Vacances · séance courte',start:p.vacation_slot==='noon'?'pause déjeuner':'matin'};
 const day=new Date(date+'T12:00:00').getDay();
 if(day===1&&p.alternating_monday){const delta=Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(p.monday_anchor+'T00:00:00Z'))/86400000);if(((Math.floor(delta/7)%2)+2)%2===1)return {capacity:p.monday_home_minutes,label:'Maison · lundi sans étude',start:p.monday_home_start};}
 return {capacity:p.week_minutes[day],label:p.day_labels[day],start:p.day_starts[day]};
}
