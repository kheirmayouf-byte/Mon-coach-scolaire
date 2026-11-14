const letters=value=>(value.match(/\p{L}/gu)||[]).length;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)]||1;
export function readableOCR(data){
 const lines=(data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));
 if(!lines.length)return {text:String(data.text||'').normalize('NFC').trim(),uncertain:false};
 let uncertain=false;
 const text=lines.map(line=>{
  const words=line.words||[],raw=words.map(w=>w.text).join(' ');
  // A formula is content even when it consists entirely of short tokens.
  const formula=/[\p{L}\p{N}]\s*[=+×÷<>≤≥±−]\s*[+−-]?\s*[\p{L}\p{N}]|[√∑∫]\s*[\p{L}\p{N}]/u.test(raw);
  const prose=words.filter(w=>w.confidence>=70&&letters(w.text)>=2);
  if(!formula&&(prose.length>=2||prose.some(w=>letters(w.text)>=5))){
   const anchors=words.filter(w=>w.confidence>=60&&(letters(w.text)>=2||/\p{N}/u.test(w.text)));
   const left=Math.min(...anchors.map(w=>w.bbox.x0)),right=Math.max(...anchors.map(w=>w.bbox.x1));
   const gap=median(prose.map(w=>Math.max(1,w.bbox.y1-w.bbox.y0)))*1.5;
   return words.filter(w=>!(w.text.length<=3&&(w.bbox.x1<left-gap||w.bbox.x0>right+gap)))
    .map(w=>{if(w.confidence<45)uncertain=true;return w.text;}).join(' ');
  }
  // Omit isolated decoration, never whole words or recognisable formulas.
  if(!formula&&!words.some(w=>letters(w.text)>=3||w.confidence>=60&&/[\p{L}\p{N}]/u.test(w.text)))return '';
  if(words.some(w=>w.confidence<45))uncertain=true;
  return raw;
 }).filter(Boolean).join('\n').normalize('NFC').trim();
 return {text,uncertain};
}
