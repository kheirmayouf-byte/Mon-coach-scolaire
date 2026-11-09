import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let handler;globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://project.supabase.co',SUPABASE_ANON_KEY:'test-public',OPENAI_API_KEY:'test-not-active'}[name])},serve:fn=>{handler=fn;}};
const result=await build({entryPoints:['supabase/functions/coach-ai/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral'});await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const req=body=>new Request('https://project.supabase.co/functions/v1/coach-ai',{method:'POST',headers:{origin:'https://kheirmayouf-byte.github.io',authorization:'Bearer user.jwt.token'},body:JSON.stringify(body)});
test('AI is disabled without explicit server activation even when a key exists; no provider is called',async()=>{
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.includes('/auth/')?{id:'parent'}:[{family_id:'family'}]));};
 try{const status=await handler(req({action:'status'}));assert.equal((await status.json()).available,false);const answer=await handler(req({action:'ask',child:'child',question:'test'}));assert.equal(answer.status,503);assert.ok(calls.every(url=>url.startsWith('https://project.supabase.co/')));}finally{globalThis.fetch=old;}
});
