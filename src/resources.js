export function publicResourceURL(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname))return null;
  if([...url.searchParams.keys()].some(k=>/token|password|secret|authorization|signature|api[_-]?key/i.test(k))||/access_token|id_token/i.test(url.hash))return null;
  return url.href;
 }catch{return null;}
}
export function resourceURLs(text){
 const out=[];for(const match of String(text||'').matchAll(/https:\/\/[^\s<>"«»]+/g)){
  let value=match[0].replace(/[.,;!?]+$/,'');
  while(value.endsWith(')')&&(value.match(/\)/g)||[]).length>(value.match(/\(/g)||[]).length)value=value.slice(0,-1);
  const url=publicResourceURL(value);if(url&&!out.includes(url))out.push(url);
 }return out;
}
export function resourceKind(value){const url=new URL(value);return /tube|youtube|vimeo|dailymotion/.test(url.hostname)?'Vidéo du cours':'Ressource du cours';}
export function mediaResource(value){
 const safe=publicResourceURL(value);if(!safe)return null;const url=new URL(safe),host=url.hostname;
 if(/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(url.pathname))return {kind:'audio',src:safe,original:safe};
 if(/\.(mp4|webm|ogv|m4v)$/i.test(url.pathname))return {kind:'video',src:safe,original:safe};
 let id;
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(host)){
  id=host==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
  if(/^[\w-]{11}$/.test(id||''))return {kind:'iframe',src:'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=0&playsinline=1&rel=0',original:safe};
 }
 if(host==='vimeo.com'||host==='www.vimeo.com'||host==='player.vimeo.com'){
  id=url.pathname.match(/\/(?:video\/)?(\d+)$/)?.[1];if(id)return {kind:'iframe',src:'https://player.vimeo.com/video/'+id+'?autoplay=0&dnt=1',original:safe};
 }
 if(host.endsWith('.apps.education.fr')){
  id=url.pathname.match(/^\/(?:w|videos\/(?:watch|embed))\/([a-zA-Z0-9-]{8,50})(?:\/|$)/)?.[1];
  if(id)return {kind:'iframe',src:url.origin+'/videos/embed/'+id+'?autoplay=0&p2p=0',original:safe};
 }
 return null;
}
