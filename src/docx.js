export const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_XML=2097152,WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export async function extractDOCX(file,{signal,Parser=globalThis.DOMParser}={}){
 if(file.size>10485760)throw Error('Choisis un document Word de 10 Mo maximum.');
 const check=()=>{if(signal?.aborted)throw Error('Lecture annulée. Le fichier original reste disponible.');};check();
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0)throw Error('Le document Word est incomplet ou illisible.');
 const entries=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);
 if(entries>2000||view.getUint16(end+4,true)||view.getUint16(end+6,true)||offset>=end)throw Error('Archive Word non prise en charge. Enregistre-la en DOCX standard ou en PDF.');
 let entry,at=offset;
 for(let i=0;i<entries;i++){
  check();if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw Error('Structure Word invalide.');
  const n=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true);
  if(at+46+n+extra+comment>end)throw Error('Structure Word invalide.');
  const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+n));
  if(name==='word/document.xml')entry={flags:view.getUint16(at+8,true),method:view.getUint16(at+10,true),compressed:view.getUint32(at+20,true),size:view.getUint32(at+24,true),local:view.getUint32(at+42,true)};
  at+=46+n+extra+comment;
 }
 if(!entry)throw Error('Ce fichier ne contient pas de document Word lisible.');
 if(entry.flags&1)throw Error('Ce document Word est chiffré. Ajoute une version non protégée.');
 if(entry.size>MAX_XML||entry.compressed>10485760)throw Error('Ce document Word est trop long : ajoute-le en plusieurs parties.');
 if(entry.local+30>offset||view.getUint32(entry.local,true)!==0x04034b50)throw Error('Structure Word invalide.');
 const start=entry.local+30+view.getUint16(entry.local+26,true)+view.getUint16(entry.local+28,true);
 if(start+entry.compressed>offset)throw Error('Structure Word invalide.');
 let raw=bytes.subarray(start,start+entry.compressed);
 if(entry.method===8){
  let stream;try{stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw Error('Ce navigateur ne peut pas lire ce fichier Word. Utilise un navigateur récent ou une version PDF.');}
  const reader=stream.getReader(),chunks=[];let total=0;
  const abort=()=>{void reader.cancel();};signal?.addEventListener('abort',abort,{once:true});
  try{while(true){check();const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_XML){await reader.cancel();throw Error('Ce document Word dépasse la limite de lecture.');}chunks.push(value);}check();raw=new Uint8Array(total);let i=0;for(const chunk of chunks){raw.set(chunk,i);i+=chunk.length;}}
  finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
 }else if(entry.method!==0)throw Error('Compression Word non prise en charge. Enregistre le fichier en PDF.');
 if(raw.length!==entry.size)throw Error('Le document Word est incomplet.');
 const xml=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Structure Word non prise en charge.');
 const doc=new Parser().parseFromString(xml,'application/xml');
 if(doc.querySelector('parsererror'))throw Error('Le texte du document Word est illisible.');
 const read=node=>{if(node.namespaceURI===WORD_NS){if(node.localName==='t')return node.textContent;if(node.localName==='tab')return '\t';if(node.localName==='br')return '\n';}return [...node.childNodes].map(read).join('');};
 const text=[...doc.getElementsByTagNameNS(WORD_NS,'p')].map(read).join('\n').trim();
 if(!text)throw Error('Ce fichier Word contient seulement des images ou aucun texte lisible. Ajoute une version PDF ou une photo.');
 if(text.length>60000)throw Error('Ce document dépasse 60 000 caractères. Ajoute-le en plusieurs parties.');
 return text;
}
