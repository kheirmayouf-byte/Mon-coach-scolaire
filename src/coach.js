import {dateKey,validDate,daySlot,plan,validateTask} from './core.js';
export const daysAfter=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return dateKey(d);};
export const weekStart=(today=dateKey())=>daysAfter(today,-((new Date(today+'T12:00:00').getDay()+6)%7));
export const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').replace(/\s+/g,' ').trim();
export function estimateTask(task,profile={},sessions=[]){
 const text=normalize(task.description),assessment=task.is_assessment||/controle|evaluation|interrogation/.test(text);
 let minutes=assessment?35:/redig|redaction|dissertation|expose/.test(text)?35:/apprendre|memoriser|reviser/.test(text)?20:/lire|lecture/.test(text)?15:20;
 const match=text.match(/(\d+) exercices?/);if(match)minutes=Math.min(90,Number(match[1])*8);
 const page=text.match(/(\d+) pages?/);if(page&&/lire|lecture/.test(text))minutes=Math.min(60,Math.max(10,Number(page[1])*3));
 const prior=sessions.filter(s=>s.child===task.child&&s.subject===task.subject&&s.status==='completed'&&s.seconds>=120&&s.seconds<=7200).slice(-8);
 if(prior.length>=3){const sorted=prior.map(s=>s.seconds/60).sort((a,b)=>a-b);minutes=Math.round((minutes+sorted[Math.floor(sorted.length/2)])/2);}
 const middle=Math.max(5,Math.min(120,Math.round(minutes/5)*5));
 return {minutes:middle,min:Math.max(5,middle-5),max:middle+10,basis:prior.length>=3?'Consigne et séances déclarées dans cette matière':'Estimation indicative à partir de la consigne',assessment};
}
export function weekMetrics(tasks,children,preferences=[],today=dateKey(),fallback=40,profiles=[]){
 const start=weekStart(today),end=daysAfter(start,6),week=tasks.filter(t=>t.due>=start&&t.due<=end),overdue=tasks.filter(t=>!t.done&&t.due<today);
 const total=week.reduce((n,t)=>n+t.minutes,0),completed=week.filter(t=>t.done).reduce((n,t)=>n+t.minutes,0);
 const ids=new Set(week.filter(t=>!t.done).concat(overdue).map(t=>t.id));
 const todo=tasks.filter(t=>ids.has(t.id));const remaining=todo.reduce((n,t)=>n+t.minutes,0);
 let available=0,worst=0;
 const perChild=children.map(child=>{
  const pref=preferences.find(p=>p.child===child.id),mine=todo.filter(t=>t.child===child.id);let capacity=0,overload=false;
  for(let d=today;d<=end;d=daysAfter(d,1)){
   capacity+=daySlot(d,pref,fallback).capacity;
   const demanded=mine.filter(t=>t.due<=d).reduce((n,t)=>n+t.minutes,0);
   // Reserve breaks for multiple work blocks in each child-day budget.
   const workCapacity=capacity; if(demanded>workCapacity)overload=true;
  }
  const demand=mine.reduce((n,t)=>n+t.minutes,0);available+=capacity;
  const ratio=capacity?demand/capacity:demand?Infinity:0;worst=Math.max(worst,ratio);
  return {child:child.id,remaining:demand,available:capacity,ratio,overload};
 });
 const infeasible=plan(todo,fallback,today,Math.round((Date.parse(end)-Date.parse(today))/86400000)+1,preferences,profiles).unscheduled.length>0;
 const overloaded=infeasible||perChild.some(c=>c.overload),ratio=available?remaining/available:remaining?Infinity:0;
 const level=overloaded||worst>1?'red':worst>.85?'orange':worst>.6?'yellow':'green';
 return {start,end,total,completed,percent:total?Math.round(completed/total*100):0,done:week.filter(t=>t.done).length,count:week.length,remaining,available,ratio,level,overloaded,perChild,label:{green:'Semaine légère',yellow:'Rythme confortable',orange:'Semaine chargée',red:'Planning à alléger'}[level]};
}
export function defaultPedagogy(){return {needs:'',strengths:'',instructions:'Expliquer simplement, reformuler, utiliser des exemples et schémas, guider par questions et favoriser l’autonomie sans donner immédiatement la réponse.',source_notes:'Principes généraux de Mr Prof. Les consignes individuelles de cet enfant restent à compléter et vérifier.',session_minutes:20,one_step:true,read_aloud:false,large_text:false,hide_timer:false,encouragement:true,confirmed:false};}
export function validatePedagogy(p){
 const result={...defaultPedagogy(),...p};for(const key of ['needs','strengths','instructions','source_notes']){if(typeof result[key]!=='string'||result[key].length>8000)throw Error('Limite chaque champ pédagogique à 8 000 caractères.');}
 if(!Number.isInteger(result.session_minutes)||result.session_minutes<5||result.session_minutes>25)throw Error('Choisis une séance de 5 à 25 minutes.');
 for(const key of ['one_step','read_aloud','large_text','hide_timer','encouragement','confirmed'])result[key]=!!result[key];return result;
}
// Measurable practice evidence, never a diagnosis or a comparison between siblings.
export function competency(attempts){
 const groups=new Map();
 for(const a of attempts){const key=a.child+'|'+a.topic;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 return [...groups.values()].map(rows=>{
  rows.sort((a,b)=>a.created_at.localeCompare(b.created_at));const good=rows.filter(a=>a.total>=3&&a.score/a.total>=.8&&!a.assisted);
  const dates=[...new Set(good.map(a=>a.created_at.slice(0,10)))];const questions=new Set(good.flatMap(a=>a.question_ids||[]));
  const elapsed=dates.length?(Date.parse(dates.at(-1))-Date.parse(dates[0]))/86400000:0;
  const level=good.length>=3&&dates.length>=3&&elapsed>=3&&questions.size>=10?'Confirmé':good.length>=2&&dates.length>=2&&questions.size>=6?'À l’aise':'En cours';
  return {child:rows[0].child,topic:rows[0].topic,level,attempts:rows.length,last:rows.at(-1),questions:questions.size};
 });
}
export function sourceQuestions(task,cards,documents){
 const questions=cards.filter(c=>c.child===task.child&&normalize(c.subject)===normalize(task.subject)).map(c=>({id:'card:'+c.id,question:c.question,answer:c.answer,source:'Fiche de révision',source_id:c.id,kind:'open'}));
 for(const doc of documents.filter(d=>d.child===task.child&&d.verified&&d.content_text&&(d.task_id===task.id||!d.task_id&&normalize(d.subject)===normalize(task.subject)))){
  for(const line of doc.content_text.split(/\n/)){
   // Deterministic extraction of explicit definitions, not invented interpretations of a lesson.
   const m=line.trim().match(/^(.{2,100}?)\s*[:=]\s*(.{3,500})$/);
   if(m)questions.push({id:'doc:'+doc.id+':'+normalize(m[1]),question:`Explique : ${m[1].trim()}`,answer:m[2].trim(),source:doc.name,source_id:doc.id,kind:'open'});
  }
 }
 return [...new Map(questions.map(q=>[q.id,q])).values()].slice(0,10);
}
export function gradeAnswer(answer,expected){
 const a=normalize(answer),b=normalize(expected);
 return a===b?'correct':'compare'; // Free writing is self-checked rather than falsely graded by string similarity.
}
export function taskPatchChanged(a,b){return ['subject','description','given','due','detail_missing','is_assessment'].some(k=>a[k]!==b[k]);}
export function validateRefreshTask(task){const {id,child,...r}=validateTask(task);return {id,child,...r};}
export function localCoachAnswer(question,{tasks=[],reminders=[],childName='cet enfant',profile={},selectedTask=null}={}){
 const q=normalize(question);
 if(/fatigu|decourag|pause|bloqu|aide/.test(q))return 'Tu peux choisir : un indice, une autre explication, ou une pause. Dis-moi quelle étape te pose problème. Le bouton « Je bloque » ouvre ces choix ; demander de l’aide ne diminue aucun score.';
 if(/planning|demain|devoir|semaine/.test(q)){const todo=tasks.filter(t=>!t.done).sort((a,b)=>a.due.localeCompare(b.due));return todo.length?`Pour ${childName}, ${todo.length} devoir(s) restent à faire. Prochaine échéance : ${todo[0].subject}, pour le ${todo[0].due}. Ouvre Planning pour les séances proposées, ou le devoir pour sa consigne.`:'Aucun devoir à faire dans la sélection actuelle. Tu peux revoir une fiche dans Révisions.';}
 if(/chrono|temps|duree/.test(q))return 'Ouvre un devoir puis choisis « Je commence ». Tu peux mettre en pause et terminer la séance. Le temps sert à ajuster les estimations, jamais à te noter. En mode écran, le chronomètre se met en pause quand tu quittes l’application.';
 if(/import|actualis|ecole/.test(q))return 'Dans Importer, connecte-toi à ÉcoleDirecte, associe l’élève au bon profil puis lis les devoirs. L’aperçu distingue les ajouts et les modifications. Les doublons sont bloqués ; les mises à jour conservent le statut Fait et tes durées.';
 if(/quiz|quizz|exercice|revision/.test(q))return 'Ouvre un devoir et choisis un quiz de 5 minutes ou des exercices de 10 minutes. Les fiches et définitions des documents vérifiés servent de support. Si le cours manque, ajoute un fichier ou une photo dans Documents.';
 if(/document|photo|cours/.test(q))return 'Dans Documents, choisis le bon enfant puis ajoute un fichier ou une photo. Vérifie le texte extrait avant de l’utiliser pour des exercices. Une photo peut être conservée même si son texte reste à compléter.';
 if(selectedTask)return `Consigne du devoir ouvert : ${selectedTask.description}\n\nPour une explication précise, consulte son support ou demande un indice dans le parcours d’exercice. L’aide locale décrit l’application ; les réponses pédagogiques libres demandent l’activation du moteur IA.`;
 return 'Je peux t’aider à retrouver un devoir, comprendre le planning, utiliser le chronomètre, ajouter un document ou lancer une révision. Pour une explication libre d’un cours, le moteur IA doit être activé ; les fiches et entraînements locaux restent disponibles.';
}
