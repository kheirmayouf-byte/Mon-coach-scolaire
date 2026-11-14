import {enhanceDocumentImage} from './ocr-image.js';
import {readableOCR} from './ocr-text.js';
// Images stay on the device. Only same-origin OCR engine assets are fetched.
export function ocrAssetURLs(base=globalThis.location?.href){
 const root=new URL('./ocr/',base);
 return {workerPath:new URL('worker.min.js',root).href,corePath:root.href,langPath:new URL('lang',root).href,workerBlobURL:false,cacheMethod:'none'};
}
export async function prepareImage(file){
 let image,url;
 try{
  if(typeof createImageBitmap==='function')image=await createImageBitmap(file,{imageOrientation:'from-image'});
  else{url=URL.createObjectURL(file);image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Photo illisible. Utilise une photo JPEG ou PNG nette.'));img.src=url;});}
  const width=image.width||image.naturalWidth,height=image.height||image.naturalHeight;
  if(!width||!height)throw Error('Cette photo est vide ou illisible.');
  const scale=Math.min(1,2400/Math.max(width,height),Math.sqrt(4000000/(width*height)));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('La lecture des images n’est pas disponible dans ce navigateur.');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas;
 }finally{image?.close?.();if(url)URL.revokeObjectURL(url);}
}
export async function createLocalOCR({signal,onProgress=()=>{},onWarning=()=>{},processImage=enhanceDocumentImage,load=()=>import('tesseract.js'),timeout=180000,baseURL=globalThis.location?.href}={}){
 let worker,closed=false,timer,rejectStop;
 const stopped=new Promise((_,reject)=>{rejectStop=reject;});
 const cancel=()=>rejectStop(Error('Lecture annulée. Le fichier original reste disponible.'));
 signal?.addEventListener('abort',cancel,{once:true});
 timer=setTimeout(()=>rejectStop(Error('Lecture trop longue. Réessaie avec une page ou une photo plus nette.')),timeout);
 async function close(){closed=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(worker)await worker.terminate();}
 try{
  if(signal?.aborted)cancel();
  const pending=(async()=>{const {createWorker}=await load();const w=await createWorker('fra',1,{...ocrAssetURLs(baseURL),logger:m=>onProgress(m.status==='recognizing text'?'Lecture du texte : '+Math.round(m.progress*100)+' %':'Préparation de la lecture…'),errorHandler:()=>rejectStop(Error('Le moteur de lecture n’a pas pu démarrer. Vérifie la connexion et réessaie.'))});if(closed){await w.terminate();throw Error('Lecture arrêtée.');}worker=w;return w;})();
  await Promise.race([pending,stopped]);
  return {async recognize(image){
   onProgress('Amélioration du contraste et réduction des ombres…');
   processImage(image);
   const result=await Promise.race([worker.recognize(image,{rotateAuto:true},{text:true,blocks:true}),stopped]);
   const {text,uncertain}=readableOCR(result.data||{});
   if(uncertain)onWarning('Certains mots sont incertains : compare le texte à la photo avant de valider.');
   return text;
  },close};
 }catch(e){await close();throw e;}
}
