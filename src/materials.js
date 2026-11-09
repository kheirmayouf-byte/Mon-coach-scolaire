export const allowedTypes=new Set(['application/pdf','image/jpeg','image/png','image/webp','text/plain']);
export async function inspectFile(file){
 if(file.size<1||file.size>10485760)throw Error('Choisis un document de 10 Mo maximum.');
 const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
 let mime=file.type;
 if(head[0]===0x25&&head[1]===0x50&&head[2]===0x44&&head[3]===0x46)mime='application/pdf';
 else if(head[0]===0xff&&head[1]===0xd8)mime='image/jpeg';
 else if(head[0]===0x89&&head[1]===0x50&&head[2]===0x4e&&head[3]===0x47)mime='image/png';
 else if(String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP')mime='image/webp';
 else if(mime!=='text/plain')throw Error('Formats acceptés : PDF, JPEG, PNG, WebP et texte. Convertis les autres formats en PDF.');
 if(!allowedTypes.has(mime))throw Error('Format de document non pris en charge.');
 return {mime};
}
export async function extractFileText(file,mime){
 if(mime==='text/plain')return (await file.text()).slice(0,60000);
 if(mime!=='application/pdf')return '';
 try{
  const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdf.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',location.href).href;
  const loading=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
  const doc=await loading.promise;let text='';
  try{for(let page=1;page<=Math.min(doc.numPages,40);page++){const content=await(await doc.getPage(page)).getTextContent();text+=`\nPage ${page}\n`+content.items.map(i=>('str'in i?i.str:'')+(i.hasEOL?'\n':' ')).join('');if(text.length>60000)break;}}finally{await doc.destroy();}
  return text.trim().slice(0,60000);
 }catch{return '';}
}
export const base64File=(base64,name,mime)=>new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],name,{type:mime});
