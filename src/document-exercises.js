// Conservative, source-based local practice. Never turn arbitrary OCR punctuation
// into a definition; no semantic claims are invented when no AI is connected.
const words=text=>text.match(/[\p{L}]+(?:['’\-][\p{L}]+)*/gu)||[];
export function readablePassage(text,minWords=3){
 const s=String(text||'').trim(),tokens=words(s),letters=(s.match(/\p{L}/gu)||[]).length;
 const noise=(s.match(/[^\p{L}\p{N}\p{M}\s.,;:!?¿¡'’"«»()\[\]°%+−×÷/=<>≤≥²³√–—\-]/gu)||[]).length;
 const tiny=tokens.filter(w=>w.length===1&&!/^[aààyôo]$/iu.test(w)).length;
 return s.length>=12&&tokens.length>=minWords&&letters/s.length>.55&&noise<=Math.max(1,s.length*.025)&&tiny<=Math.max(1,tokens.length*.15)&&!/[\uFFFD\uE000-\uF8FF]/u.test(s);
}
export function documentQuestions(doc){
 if(!doc.verified||!doc.content_text)return [];
 const lines=doc.content_text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^Page \d+$/i.test(s));
 const paragraphs=[];let current='';
 for(const line of lines){
  if(!readablePassage(line)&&(!words(line).some(w=>w.length>=4)||/[{}|#]/.test(line))){if(current){paragraphs.push(current);current='';}continue;}
  if(current&&(/^(?:Q\d+[a-z]?\s*[:.)]|[A-Z]\)|[-•]|[\p{L}][\p{L} '’\-]{1,50}\s*:)/u.test(line)||/^[\p{Lu}]/u.test(line)&&/^[\p{L}][\p{L} '’\-]{1,55}\s*:/u.test(current))){paragraphs.push(current);current='';}
  current+=(current?' ':'')+line;
  if(/[.!?]$/.test(line)||current.length>450){paragraphs.push(current);current='';}
 }
 if(current)paragraphs.push(current);
 const out=[];
 for(const raw of paragraphs){
  const text=raw.replace(/^[-•]\s*/,'').replace(/^Q\d+[a-z]?\s*[:.)]\s*/i,'').replace(/^[A-Z]\)\s*/,'').trim();
  if(!readablePassage(text)||text.length>600)continue;
  const definition=text.match(/^([\p{L}][\p{L} '’\-]{1,55})\s*:\s*(.+)$/u);
  if(definition&&words(definition[1]).length<=6&&readablePassage(definition[2],2)){
   out.push({question:'Explique : '+definition[1].trim(),answer:definition[2].trim(),kind:'open'});
  }else if(words(text).length>=6&&/[.!?]$/.test(text)&&!/[{}|]/.test(text)){
   const candidates=words(text).filter(w=>w.length>=5&&!/^(questions?|exercices?|document|compl[eè]te[rz]?|explique[rz]?|construire|recopier|reproduire|entourer|souligner|r[eé]pondre)$/i.test(w));
   const answer=candidates.sort((a,b)=>b.length-a.length)[0];
   if(answer)out.push({question:'Complète cet extrait du cours :\n'+text.replace(answer,'_____'),answer,kind:'open',excerpt:text});
  }
 }
 return out.slice(0,15).map((q,i)=>({...q,id:'doc:'+doc.id+':'+i,source:doc.name,source_id:doc.id}));
}
