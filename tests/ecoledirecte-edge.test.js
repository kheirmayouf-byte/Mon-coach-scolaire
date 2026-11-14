import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let handler;
globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-only-test'}[name])},serve:fn=>{handler=fn;}};
const result=await build({entryPoints:['supabase/functions/ecoledirecte/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral'});
await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const origin='https://kheirmayouf-byte.github.io';
function request(body,headers={}){return new Request('https://project.supabase.co/functions/v1/ecoledirecte',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});}
test('edge rejects origin and authentication before any upstream request',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('should not fetch');};
 try{assert.equal((await handler(request({action:'login'},{origin:'https://attacker.invalid'}))).status,403);assert.equal((await handler(request({action:'login'}))).status,401);assert.equal(calls,0);}finally{globalThis.fetch=old;}
});
test('an authenticated user without a family cannot use the upstream connector',async()=>{
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.includes('/auth/')?{id:'parent'}:[]));};
 try{assert.equal((await handler(request({action:'login'},{authorization:'Bearer user.jwt.signature'}))).status,403);assert.ok(calls.every(url=>url.startsWith('https://project.supabase.co/')));}finally{globalThis.fetch=old;}
});
test('parent can only use enumerated actions and valid user-bound encrypted sessions',async()=>{
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.includes('/auth/')?{id:'parent'}:[{family_id:'family'}]));};
 try{
  const bad=await handler(request({action:'proxy',url:'https://attacker.invalid'},{authorization:'Bearer user.jwt.signature'}));assert.equal(bad.status,400);
  const invalid=await handler(request({action:'homework',session:'forged',student:'10:25'},{authorization:'Bearer user.jwt.signature'}));assert.equal(invalid.status,401);assert.equal((await invalid.json()).reset,true);assert.ok(calls.every(url=>url.startsWith('https://project.supabase.co/')));
 }finally{globalThis.fetch=old;}
});

test('saved connection is encrypted, bound to the parent, restored without a password and removable',async()=>{
 const old=globalThis.fetch,connections=new Map(),calls=[];
 const students={accounts:[{id:10,idLogin:11,typeCompte:'F',main:true,profile:{eleves:[{id:25,prenom:'Élève A'}]}}]};
 globalThis.fetch=async(url,init={})=>{
  calls.push({url,method:init.method||'GET'});const parsed=new URL(url);
  if(parsed.pathname==='/auth/v1/user')return Response.json({id:init.headers.Authorization?.includes('other')?'other-parent':'parent'});
  if(parsed.pathname==='/rest/v1/mcs_members')return Response.json([{family_id:'family'}]);
  if(parsed.pathname==='/rest/v1/mcs_connections'){
   assert.equal(init.headers.apikey,'server-only-test');
   if(init.method==='POST'){const row=JSON.parse(init.body);assert.equal(row.sealed_state.includes('private-password'),false);connections.set(row.user_id,row);return new Response(null,{status:201});}
   const id=parsed.searchParams.get('user_id').slice(3);
   if(init.method==='DELETE'){connections.delete(id);return new Response(null,{status:204});}
   return Response.json(connections.has(id)?[connections.get(id)]:[]);
  }
  if(url.includes('login.awp?gtk=1'))return new Response('');
  if(url.includes('login.awp'))return Response.json({code:200,token:'ed-test-token',data:students});
  throw Error('Unexpected endpoint: '+url);
 };
 try{
  const login=await handler(request({action:'login',username:'ed-user',password:'private-password'},{authorization:'Bearer user.jwt.signature'}));assert.equal(login.status,200);const payload=await login.json();assert.equal(payload.stage,'ready');assert.doesNotMatch(JSON.stringify(payload),/private-password|ed-test-token/);
  const before=calls.filter(c=>c.url.startsWith('https://api.ecoledirecte.com')).length;
  const restored=await handler(request({action:'status'},{authorization:'Bearer user.jwt.signature'}));assert.equal((await restored.json()).stage,'ready');assert.equal(calls.filter(c=>c.url.startsWith('https://api.ecoledirecte.com')).length,before);
  const other=await handler(request({action:'status'},{authorization:'Bearer other.jwt.signature'}));assert.equal((await other.json()).stage,'disconnected');
  const removed=await handler(request({action:'disconnect'},{authorization:'Bearer user.jwt.signature'}));assert.equal((await removed.json()).stage,'disconnected');assert.equal(connections.size,0);
 }finally{globalThis.fetch=old;}
});
