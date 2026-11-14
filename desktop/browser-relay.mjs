import {createServer} from 'node:http';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
export const SITE_ORIGIN='https://kheirmayouf-byte.github.io';
export const RELAY_PORT=4174;
export function createPairStore(file,encryption){
 let cached;
 return {
  async get(){if(cached!==undefined)return cached;try{const payload=JSON.parse(encryption.decrypt(await readFile(file)));if(payload===null)return cached=null;if(typeof payload.user==='string'&&typeof payload.family==='string'&&typeof payload.binding==='string')return cached=payload;throw Error();}catch(error){if(error.code==='ENOENT')return null;throw Error('Le rattachement sécurisé du navigateur est illisible.');}},
  async set(value){const encrypted=encryption.encrypt(JSON.stringify(value));await mkdir(dirname(file),{recursive:true});const temporary=file+'.'+randomBytes(8).toString('hex')+'.tmp';await writeFile(temporary,encrypted,{mode:0o600,flag:'wx'});await rename(temporary,file);cached=value;}
 };
}
export function accountBinding(status){return String(status.binding||'');}
export async function verifyParent(ticket,request,config,fetcher=fetch){
 if(typeof ticket!=='string'||ticket.length>3000)throw Error('Autorisation du relais invalide.');
 const digest=createHash('sha256').update(JSON.stringify(request.body)).digest('hex');
 const response=await fetcher(config.url+'/functions/v1/coach-relay',{method:'POST',headers:{'Content-Type':'application/json',apikey:config.key,Origin:SITE_ORIGIN},body:JSON.stringify({action:'verify',ticket,method:request.method,digest}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Autorisation du relais expirée ou invalide. Reconnecte-toi au compte parent.');
 const result=await response.json();if(!result.parent?.user||!result.parent?.family||!result.parent?.nonce)throw Error('Compte parent invalide.');return result.parent;
}

function sameBinding(a,b){if(!a||!b)return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export function createRelayHandler({coach,verify,pairs,approve,connect,cancel,models,usage,errors=()=> 'Le relais ChatGPT n’a pas pu répondre.'}){
 let connecting=false;const history=new Map(),usedTickets=new Map();
 return async(req,res)=>{
  const origin=req.headers.origin;
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':SITE_ORIGIN,Vary:'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Private-Network':'true','X-Content-Type-Options':'nosniff'};
  const reply=(status,body)=>{if(!res.destroyed){res.writeHead(status,headers);res.end(JSON.stringify(body));}};
  if(origin!==SITE_ORIGIN||req.headers.host!=='127.0.0.1:'+RELAY_PORT)return reply(403,{ok:false,error:'Origine ou hôte non autorisé.'});
  if(req.method==='OPTIONS'){res.writeHead(204,headers);res.end();return;}
  if(req.method!=='POST'||req.headers['content-type']?.split(';')[0]!=='application/json')return reply(405,{ok:false,error:'Méthode non autorisée.'});
  const methods=new Set(['status','connect','cancel','models','test','ask','unlink','usage']);
  const match=req.url?.match(/^\/v1\/([a-z]+)$/),method=match?.[1];
  if(!methods.has(method))return reply(404,{ok:false,error:'Action non autorisée.'});
  try{
   const auth=req.headers.authorization||'';if(!auth.startsWith('MCS-Relay '))return reply(401,{ok:false,error:'Connecte-toi au compte parent.'});
   let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>150000)return reply(413,{ok:false,error:'Réduis la taille du support.'});}
   const body=JSON.parse(raw||'{}'),parent=await verify(auth.slice(10),{method,body});
   const checked=Date.now();for(const [nonce,at]of usedTickets)if(checked-at>60000)usedTickets.delete(nonce);if(usedTickets.has(parent.nonce))return reply(401,{ok:false,error:'Cette autorisation a déjà été utilisée. Réessaie.'});usedTickets.set(parent.nonce,checked);
   const now=Date.now(),recent=(history.get(parent.user)||[]).filter(t=>now-t<60000);if(recent.length>=30)return reply(429,{ok:false,error:'Trop de demandes. Patiente une minute.'});history.set(parent.user,[...recent,now]);
   if(history.size>200)for(const [key,times]of history)if(times.every(t=>now-t>60000))history.delete(key);
   let pair=await pairs.get();
   const owned=pair?.user===parent.user&&pair?.family===parent.family;
   if(method==='connect'){
    if(connecting)return reply(409,{ok:false,error:'Une connexion est déjà en cours. Valide-la dans l’application Windows.'});
    connecting=true;
    try{
     // A different parent may never replace another parent's link remotely.
     if(pair&&!owned)return reply(403,{ok:false,error:'Ce relais est rattaché à un autre compte parent. Retire ce rattachement dans l’application Windows.'});
     let status=await coach.status();
     if((!owned||pair?.binding&&!sameBinding(pair.binding,accountBinding(status)))&&!await approve(parent))return reply(403,{ok:false,error:'Rattachement du navigateur refusé dans l’application Windows.'});
     if(!status.available)status=await connect();
     const binding=accountBinding(status);if(!status.available||!binding)return reply(409,{ok:false,error:'Autorise l’utilisation de ton abonnement ChatGPT, puis reconnecte-toi.'});
     await pairs.set({user:parent.user,family:parent.family,binding});
     const {binding:_,...publicStatus}=status;return reply(200,{ok:true,data:{...publicStatus,paired:true,relay:true}});
    }finally{connecting=false;}
   }
   if(!owned){if(method==='status')return reply(200,{ok:true,data:{available:false,status:'unpaired',paired:false,relay:true}});return reply(403,{ok:false,error:'Relie ce compte parent au relais depuis Mon compte.'});}
   if(method==='unlink'){await pairs.set(null);return reply(200,{ok:true,data:{available:false,paired:false,relay:true,status:'unpaired'}});}
   if(method==='cancel'){await cancel();return reply(200,{ok:true,data:{cancelled:true}});}
   const status=await coach.status(),bound=sameBinding(pair.binding,accountBinding(status));
   if(method==='status'){const {binding:_,...publicStatus}=status;return reply(200,{ok:true,data:{...publicStatus,available:status.available&&bound,paired:true,relay:true,status:bound?status.status:'account_changed'}});}
   if(!status.available||!bound)return reply(403,{ok:false,error:'Le compte ChatGPT a changé ou a été déconnecté. Relie-le de nouveau dans Mon compte.'});
   let result;
   if(method==='models')result=await models();
   if(method==='test')result=await coach.test(typeof body.model==='string'?body.model:'');
   if(method==='usage'){await usage();result={opened:true};}
   if(method==='ask')result=await coach.request(body);
   return reply(200,{ok:true,data:result});
  }catch(error){return reply(400,{ok:false,error:errors(error)});}
 };
}
export async function startBrowserRelay(options){
 const server=createServer(createRelayHandler(options));server.requestTimeout=300000;server.headersTimeout=10000;server.maxHeadersCount=30;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(RELAY_PORT,'127.0.0.1',resolve);});return server;
}
