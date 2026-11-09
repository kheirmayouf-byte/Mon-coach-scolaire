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
