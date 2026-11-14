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
import {createLocalOCR,prepareImage} from './ocr.js';
export const MAX_DOCUMENT_PAGES=20,MAX_DOCUMENT_TEXT=60000;
export async function extractFileText(file,mime,options={}){
 const {onProgress=()=>{},onWarning=()=>{},signal,loadPDF=()=>import('pdfjs-dist/legacy/build/pdf.mjs'),createOCR=createLocalOCR,imageForOCR=prepareImage,canvasFactory=()=>document.createElement('canvas')}=options;
 let reader,loading,doc,destroyPromise;
 const destroyPDF=()=>destroyPromise??=loading.destroy();
 const check=()=>{if(signal?.aborted)throw Error('Lecture annulée. Le fichier original reste disponible.');};
 const bounded=value=>{if(value.length>MAX_DOCUMENT_TEXT)throw Error('Ce document dépasse 60 000 caractères. Ajoute-le en plusieurs parties pour éviter une lecture incomplète.');return value;};
 const recognize=async(image)=>{check();reader??=await createOCR({signal,onProgress,onWarning});const text=await reader.recognize(image);check();if(!text.trim())throw Error('Aucun texte lisible détecté. Reprends une photo nette, bien éclairée et cadrée sur une page. Les manuscrits et schémas peuvent nécessiter une correction.');return text;};
 try{
  check();
  if(mime==='text/plain')return bounded((await file.text()).trim());
  if(mime.startsWith('image/')){onProgress('Préparation de la photo…');const image=await imageForOCR(file);try{return bounded(await recognize(image));}finally{image.width=0;image.height=0;}}
  if(mime!=='application/pdf')throw Error('Format de document non pris en charge.');
  const pdf=await loadPDF();pdf.GlobalWorkerOptions.workerSrc=new URL('pdf.worker.min.mjs',globalThis.location?.href||'http://localhost/').href;
  loading=pdf.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,useSystemFonts:true});
  const abortPDF=()=>{void destroyPDF();};signal?.addEventListener('abort',abortPDF,{once:true});
  try{
   doc=await loading.promise;check();
   if(doc.numPages>MAX_DOCUMENT_PAGES)throw Error('Ce PDF dépasse 20 pages. Ajoute-le en plusieurs parties : aucune page ne sera ignorée.');
   const pages=[];
   for(let number=1;number<=doc.numPages;number++){
    check();onProgress('Lecture de la page '+number+' sur '+doc.numPages+'…');
    const page=await doc.getPage(number);
    try{
     const content=await page.getTextContent();let text=content.items.map(i=>('str'in i?i.str:'')+(i.hasEOL?'\n':' ')).join('').trim();
     if(text.replace(/\s/g,'').length<60){
      const original=page.getViewport({scale:1}),scale=Math.min(2.5,2400/Math.max(original.width,original.height),Math.sqrt(4000000/(original.width*original.height))),viewport=page.getViewport({scale}),canvas=canvasFactory();canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
      const render=page.render({canvasContext:canvas.getContext('2d'),viewport});const abortRender=()=>render.cancel();signal?.addEventListener('abort',abortRender,{once:true});
      try{await render.promise;text=await recognize(canvas);}finally{signal?.removeEventListener('abort',abortRender);canvas.width=0;canvas.height=0;}
     }
     pages.push('Page '+number+'\n'+text);bounded(pages.join('\n\n'));
    }finally{page.cleanup?.();}
   }
   return pages.join('\n\n').trim();
  }finally{signal?.removeEventListener('abort',abortPDF);}
 }catch(e){if(signal?.aborted)throw Error('Lecture annulée. Le fichier original reste disponible.');throw Error(e?.message||'Ce document ne peut pas être lu automatiquement. Réessaie avec un PDF non protégé ou une photo nette.');}
 finally{await reader?.close();if(loading)await destroyPDF();}
}
export const base64File=(base64,name,mime)=>new File([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],name,{type:mime});
