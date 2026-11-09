import {EDClient, EDProblem} from './protocol.js';
import {makeEnvelope} from './envelope.js';
const origins=new Set(['https://kheirmayouf-byte.github.io']);
const limits=new Map<string,number[]>();
function rate(uid:string,action:string){
 const key=uid+':'+action,now=Date.now(),windowMs=action==='login'?300000:60000;
 const history=(limits.get(key)||[]).filter(t=>now-t<windowMs);
 if(history.length>=(action==='login'?5:20))throw new EDProblem('Trop de demandes. Patiente quelques minutes avant de réessayer.');
 history.push(now);limits.set(key,history);
 if(limits.size>1000)for(const [k,v] of limits)if(v.every(t=>now-t>300000))limits.delete(k);
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!origins.has(origin))return reply({error:'Origine non autorisée.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
 try{
  const auth=req.headers.get('authorization')||'';
  if(!/^Bearer [\w.-]+$/.test(auth))return reply({error:'Connecte-toi au compte parent.'},401);
  const base=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeaders={Authorization:auth,apikey:anon};
  const check=await fetch(base+'/auth/v1/user',{headers:authHeaders,signal:AbortSignal.timeout(10000)});
  if(!check.ok)return reply({error:'Session parent expirée. Reconnecte-toi.'},401);
  const parent=await check.json();
  const membership=await fetch(base+'/rest/v1/mcs_members?select=family_id&user_id=eq.'+encodeURIComponent(parent.id),{headers:authHeaders,signal:AbortSignal.timeout(10000)});
  if(!membership.ok||(await membership.json()).length!==1)return reply({error:'Compte parent non autorisé dans ce foyer.'},403);
  if(Number(req.headers.get('content-length')||0)>65000)return reply({error:'Demande trop volumineuse.'},413);
  const raw=await req.text();if(raw.length>65000)return reply({error:'Demande trop volumineuse.'},413);
  const body=JSON.parse(raw);
  if(!['login','answer','homework'].includes(body.action))return reply({error:'Action non autorisée.'},400);
  rate(parent.id,body.action);
  // Server-only material; never used to authorize database access or sent to the browser.
  const secret=Deno.env.get('MCS_ED_ENCRYPTION_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!secret)throw Error();
  const envelope=await makeEnvelope(secret);
  let adapter:EDClient,result,expires;
  if(body.action==='login'){
   if(typeof body.username!=='string'||!body.username.trim()||body.username.length>200||typeof body.password!=='string'||!body.password||body.password.length>500)return reply({error:'Renseigne tes identifiants ÉcoleDirecte.'},400);
   adapter=new EDClient();result=await adapter.login(body.username.trim(),body.password);
   expires=Date.now()+(result.stage==='ready'?20:5)*60000;
  }else{
   let saved;try{saved=await envelope.open(body.session,parent.id);}catch{return reply({error:'Session ÉcoleDirecte expirée. Reconnecte-toi.',reset:true},401);}
   adapter=new EDClient(saved.state);expires=saved.expires;
   if(body.action==='answer'){
    result=await adapter.answer(body.answer);
    if(result.stage==='ready')expires=Date.now()+20*60000;
   }else result=await adapter.homework(body.student,body.from,body.to);
  }
  return reply({...result,session:await envelope.seal(adapter.state,parent.id,expires),expires});
 }catch(error){
  // Never return upstream messages, request bodies, headers or stack traces.
  if(error instanceof EDProblem)return reply({error:error.message,reset:true},400);
  return reply({error:'Connexion indisponible. Aucun import effectué. Réessaie plus tard.',reset:true},502);
 }
});
