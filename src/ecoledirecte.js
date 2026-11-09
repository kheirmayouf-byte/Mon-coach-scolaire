import {validDate,validateTask} from './core.js';
// Parse teacher HTML in an inert document. No HTML or authenticated resource URLs enter the app.
export function teacherText(html,Parser=DOMParser){
 const doc=new Parser().parseFromString(String(html),'text/html');
 doc.querySelectorAll('script,style,iframe,object,embed,svg,math,img,video,audio,source,link,meta').forEach(n=>n.remove());
 doc.querySelectorAll('a').forEach(a=>a.replaceWith(doc.createTextNode(a.textContent||'')));
 doc.querySelectorAll('br').forEach(n=>n.replaceWith(doc.createTextNode('\n')));
 doc.querySelectorAll('p,div,li,tr,h1,h2,h3,h4').forEach(n=>n.append(doc.createTextNode('\n')));
 return doc.body.textContent.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function prepareEDImport(rows,child,existing,Parser=DOMParser){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Liste des devoirs invalide.');
 const seen=new Set(),result=[];
 for(const row of rows){
  if(!Number.isSafeInteger(row.studentId)||!Number.isSafeInteger(row.remoteId)||!validDate(row.due)||!validDate(row.given))throw Error('Un devoir contient un identifiant ou une date invalide. Aucun import effectué.');
  const year=Number(row.due.slice(0,4))-(Number(row.due.slice(5,7))<8?1:0);
  const key=`ecoledirecte:${year}:${row.studentId}:${row.remoteId}`;
  if(seen.has(key))continue;seen.add(key);
  const text=teacherText(row.html,Parser),missing=!text;
  const documents=Array.isArray(row.documents)?row.documents:[];
  const description=(text||'Consigne absente dans ÉcoleDirecte : à compléter.')+(row.hasDocuments?'\n\nPièces jointes à consulter dans ÉcoleDirecte'+(documents.length?' : '+documents.join(', '):'.'):'');
  const task=validateTask({id:crypto.randomUUID(),child,source_key:key,subject:row.subject,given:row.given,due:row.due,description,minutes:20,done:false,attachment_refs:row.attachment_refs||[],detail_missing:missing,is_assessment:!!row.is_assessment});
  const old=existing.find(t=>t.child===child&&t.source_key===key);
  if(old)task.id=old.id;
  const changed=!!old&&['subject','description','given','due','is_assessment','detail_missing'].some(k=>old[k]!==task[k]);
  result.push({task,status:old?'existing':'new',changed:changed||!!old&&JSON.stringify(old.attachment_refs||[])!==JSON.stringify(task.attachment_refs),expected_version:old?.version});
 }
 return result;
}
