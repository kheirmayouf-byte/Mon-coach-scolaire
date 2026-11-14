const origin='https://kheirmayouf-byte.github.io';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS',Vary:'Origin'};
const methods=new Set(['status','connect','cancel','models','test','ask','unlink','usage']);
const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encoder=new TextEncoder();
Deno.serve(async(req:Request)=>{
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('origin')!==origin)return reply({error:'Origine non autorisée.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Méthode non autorisée.'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>6000)return reply({error:'Demande trop volumineuse.'},413);
  let raw='',size=0;const reader=req.body?.getReader(),decoder=new TextDecoder();if(reader)while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>6000){await reader.cancel();return reply({error:'Demande trop volumineuse.'},413);}raw+=decoder.decode(chunk.value,{stream:true});}const body=JSON.parse(raw);
  const secret=Deno.env.get('MCS_COACH_RELAY_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!secret)throw Error();
  const key=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('mcs-relay-ticket-v1\0'+secret)),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  if(!methods.has(body.method)||!/^[a-f0-9]{64}$/.test(body.digest||''))return reply({error:'Demande invalide.'},400);
  if(body.action==='verify'){
   if(typeof body.ticket!=='string'||body.ticket.length>3000)throw Error();const parts=body.ticket.split('.');if(parts.length!==2)throw Error();
   if(!await crypto.subtle.verify('HMAC',key,decode(parts[1]),encoder.encode(parts[0])))throw Error();
   const payload=JSON.parse(new TextDecoder().decode(decode(parts[0]))),now=Math.floor(Date.now()/1000);
   if(payload.aud!=='mcs-local-coach-v1'||payload.exp<now||payload.exp>now+60||payload.method!==body.method||payload.digest!==body.digest||typeof payload.user!=='string'||typeof payload.family!=='string'||typeof payload.nonce!=='string')throw Error();
   return reply({parent:{user:payload.user,family:payload.family,email:payload.email,nonce:payload.nonce}});
  }
  if(body.action!=='issue')return reply({error:'Action non autorisée.'},400);
  const authorization=req.headers.get('authorization')||'';if(!/^Bearer [\w.-]+$/.test(authorization))return reply({error:'Connexion parent requise.'},401);
  const base=Deno.env.get('SUPABASE_URL')!,apikey=Deno.env.get('SUPABASE_ANON_KEY')!,authHeaders={Authorization:authorization,apikey};
  const auth=await fetch(base+'/auth/v1/user',{headers:authHeaders,redirect:'error',signal:AbortSignal.timeout(10000)});if(!auth.ok)return reply({error:'Session parent expirée.'},401);const user=await auth.json();
  const r=await fetch(base+'/rest/v1/mcs_members?select=family_id&user_id=eq.'+encodeURIComponent(user.id),{headers:authHeaders,redirect:'error',signal:AbortSignal.timeout(10000)}),members=r.ok?await r.json():[];if(members.length!==1)return reply({error:'Foyer non autorisé.'},403);
  const payload={aud:'mcs-local-coach-v1',user:user.id,family:members[0].family_id,email:String(user.email||'').slice(0,200),nonce:crypto.randomUUID(),method:body.method,digest:body.digest,exp:Math.floor(Date.now()/1000)+45};
  const text=encode(encoder.encode(JSON.stringify(payload))),signature=encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text))));
  return reply({ticket:text+'.'+signature});
 }catch{return reply({error:'Autorisation du relais invalide ou expirée.'},401);}
});
