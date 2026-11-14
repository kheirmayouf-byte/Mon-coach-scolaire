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
  const members=membership.ok?await membership.json():[];
  if(members.length!==1)return reply({error:'Compte parent non autorisé dans ce foyer.'},403);
  const family=members[0].family_id;
  if(Number(req.headers.get('content-length')||0)>65000)return reply({error:'Demande trop volumineuse.'},413);
  const raw=await req.text();if(raw.length>65000)return reply({error:'Demande trop volumineuse.'},413);
  const body=JSON.parse(raw);
  if(!['login','answer','homework','download','status','disconnect','timetable'].includes(body.action))return reply({error:'Action non autorisée.'},400);
  rate(parent.id,body.action);
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,secret=Deno.env.get('MCS_ED_ENCRYPTION_KEY')||service;
  if(!secret||!service)throw Error();
  const envelope=await makeEnvelope(secret),serverHeaders={Authorization:'Bearer '+service,apikey:service,'Content-Type':'application/json'};
  const connectionURL=base+'/rest/v1/mcs_connections?user_id=eq.'+encodeURIComponent(parent.id)+'&family_id=eq.'+encodeURIComponent(family);
  async function stored(){
   const r=await fetch(connectionURL+'&select=sealed_state',{headers:serverHeaders,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();
   const rows=await r.json();if(!rows[0]?.sealed_state)return null;
   try{return (await envelope.open(rows[0].sealed_state,parent.id)).state;}catch{return null;}
  }
  async function persist(state:any,credentials:any,publicState:any){
   const sealed_state=await envelope.seal({adapter:state,credentials,public:publicState},parent.id,Date.now()+90*86400000);
   const r=await fetch(base+'/rest/v1/mcs_connections?on_conflict=user_id',{method:'POST',headers:{...serverHeaders,Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:parent.id,family_id:family,sealed_state,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();
  }
  if(body.action==='disconnect'){
   const r=await fetch(connectionURL,{method:'DELETE',headers:serverHeaders,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();
   return reply({stage:'disconnected'});
  }
  let adapter:EDClient,result:any,credentials:any=null;
  const saved=body.action==='login'?null:await stored();
  if(body.action==='status'){
   if(!saved)return reply({stage:'disconnected'});
   const expires=Date.now()+20*60000;
   return reply({...saved.public,links:saved.adapter.links||{},session:await envelope.seal(saved.adapter,parent.id,expires),expires});
  }
  if(body.action==='login'){
   if(typeof body.username!=='string'||!body.username.trim()||body.username.length>200||typeof body.password!=='string'||!body.password||body.password.length>500)return reply({error:'Renseigne tes identifiants ÉcoleDirecte.'},400);
   credentials={username:body.username.trim(),password:body.password};adapter=new EDClient();result=await adapter.login(credentials.username,credentials.password);
  }else{
   let state=saved?.adapter;
   if(body.session){try{state=(await envelope.open(body.session,parent.id)).state;}catch{if(!saved)return reply({error:'Session ÉcoleDirecte expirée. Reconnecte-toi.',reset:true},401);}}
   if(!state)return reply({error:'Configure ÉcoleDirecte dans Mon compte.',reset:true},401);
   credentials=saved?.credentials;adapter=new EDClient(state);
   if(body.action==='answer')result=await adapter.answer(body.answer);
   else {
    const execute=()=>body.action==='download'?adapter.download(body.key):body.action==='timetable'?adapter.timetable(body.student,body.from,body.to):adapter.homework(body.student,body.from,body.to);
    try{result=await execute();}
    catch(error){
     // One re-login for an expired upstream token; never retry a rejected password or a challenge.
     if(!(error instanceof EDProblem)||!error.message.includes('Session ÉcoleDirecte expirée')||!credentials)throw error;
     adapter=new EDClient();const renewed=await adapter.login(credentials.username,credentials.password);
     if(renewed.stage!=='ready'){await persist(adapter.state,credentials,renewed);const expires=Date.now()+5*60000;return reply({...renewed,session:await envelope.seal(adapter.state,parent.id,expires),expires});}
     result=await execute();
    }
   }
  }
  if(body.action==='timetable'){
   if(typeof body.child!=='string'||!/^[-a-f0-9]{36}$/.test(body.child))return reply({error:'Profil destinataire invalide.'},400);
   // The caller JWT and FK/RLS authorize this exact child and family.
   const r=await fetch(base+'/rest/v1/mcs_timetables?on_conflict=child_id',{method:'POST',headers:{...authHeaders,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},body:JSON.stringify({family_id:family,child_id:body.child,events:result.courses,period_from:body.from,period_to:body.to,synced_at:new Date().toISOString()}),signal:AbortSignal.timeout(10000)});
   if(!r.ok)return reply({error:'Emploi du temps non enregistré. Vérifie le profil destinataire.'},403);
   adapter.state.links={...(adapter.state.links||{}),[body.child]:body.student};
  }
  const publicState={stage:result.stage,...(result.students?{students:result.students}:{}),...(result.question?{question:result.question,choices:result.choices}:{})};
  await persist(adapter.state,credentials,publicState);
  const expires=Date.now()+(result.stage==='ready'?20:5)*60000;
  return reply({...result,session:await envelope.seal(adapter.state,parent.id,expires),expires});
 }catch(error){
  // Never return credentials, upstream messages, request bodies or stack traces.
  if(error instanceof EDProblem){
   if(error.code==='ED_NO_PROFILES')console.warn(JSON.stringify({event:'mcs_ed_login_shape',code:error.code,shape:error.diagnostic}));
   return reply({error:error.message,code:error.code,reset:true},400);
  }
  return reply({error:'Connexion indisponible. Aucun import effectué. Réessaie plus tard.',reset:true},502);
 }
});
