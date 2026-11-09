export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(new Date(s+'T12:00:00')) === s; }
export function validateTask(t) {
  if (!t.child || !t.subject?.trim() || t.subject.length>80 || !t.description?.trim() || t.description.length>4000) throw Error('Renseigne une matière (80 caractères maximum) et une consigne (4 000 maximum).');
  if (!validDate(t.given) || !validDate(t.due) || t.due < t.given) throw Error('Vérifie les dates : l’échéance doit suivre la date donnée.');
  if (!Number.isInteger(t.minutes) || t.minutes<5 || t.minutes>240) throw Error('Prévois entre 5 et 240 minutes.');
  return t;
}
// A proposal only: daily capacity per child, chunks <=25 min, no work before given.
export function plan(tasks, capacity=40, start=dateKey(), horizon=14) {
  const slots=[], unscheduled=[];
  const used=new Map();
  for (const t of tasks.filter(t=>!t.done).slice().sort((a,b)=>a.due.localeCompare(b.due)||a.given.localeCompare(b.given)||a.id.localeCompare(b.id))) {
    let remaining=t.minutes||20;
    for(let day=0; day<horizon && remaining>0; day++) {
      const d=new Date(start+'T12:00:00');d.setDate(d.getDate()+day);const date=dateKey(d);
      if(date<t.given || date>t.due) continue;
      const key=t.child+date;let available=capacity-(used.get(key)||0);
      while(available>0 && remaining>0) {
        const minutes=Math.min(25,available,remaining);
        slots.push({task:t,date,minutes});remaining-=minutes;available-=minutes;
        used.set(key,(used.get(key)||0)+minutes);
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
