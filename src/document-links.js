export const subjectKey=value=>{
 const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 if(/^(maths?|mathematiques?)$/.test(key))return 'mathematiques';
 if(/^(histoire|geographie|histoire geographie|hist geo)$/.test(key))return 'histoire geographie';
 if(/^(svt|sciences (de la )?vie (et |de la )?terre)$/.test(key))return 'svt';
 if(/^francais$/.test(key))return 'francais';
 return key;
};
export function linkedTaskIds(doc,links=[]){return [...new Set([doc.task_id,...links.filter(l=>l.document_id===doc.id&&l.child===doc.child).map(l=>l.task_id)].filter(Boolean))];}
export function mentionsDocument(task,doc){
 const flat=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const name=flat(doc.name);
 return name.length>=12&&!/^(image|photo|scan|document)\d*/.test(name)&&(!doc.subject||subjectKey(doc.subject)===subjectKey(task.subject))&&flat(task.description).includes(name);
}
export function taskDocuments(task,documents=[],links=[]){
 const selected=documents.filter(doc=>doc.child===task.child&&(linkedTaskIds(doc,links).includes(task.id)||mentionsDocument(task,doc)||!linkedTaskIds(doc,links).length&&subjectKey(doc.subject)&&subjectKey(doc.subject)===subjectKey(task.subject)));
 selected.sort((a,b)=>Number(linkedTaskIds(b,links).includes(task.id))-Number(linkedTaskIds(a,links).includes(task.id)));
 const seen=new Set();return selected.filter(doc=>{const parts=String(doc.source_key||'').split(':'),key=parts[0]==='ed'?parts[1]+':'+parts.at(-1):doc.id;if(seen.has(key))return false;seen.add(key);return true;});
}
export function documentSubject(doc,tasks=[]){return tasks.find(t=>t.id===doc.task_id&&t.child===doc.child)?.subject||doc.subject||'Matière à préciser';}
export function attachmentIdentity(ref){return String(ref.key||'');}
