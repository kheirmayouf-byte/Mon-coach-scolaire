import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const bundled=await build({entryPoints:['src/app.js'],bundle:true,write:false,format:'iife',plugins:[{name:'mock-supabase',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'client',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export function createClient(){return window.__supabaseMock;}'}));}}]});
const html=readFileSync('index.html','utf8').replace(/<script defer src="app\.js[^"]*"><\/script>/,'');
const tick=()=>new Promise(r=>setTimeout(r,20));
function boot(){
 const dom=new JSDOM(html,{url:'https://kheirmayouf-byte.github.io/Mon-coach-scolaire/',runScripts:'dangerously'}),w=dom.window;
 const tasks=[],calls=[];let onAuth;
 const children=[{id:'a',name:'Élève A'},{id:'b',name:'Élève B'}];
 w.__supabaseMock={auth:{onAuthStateChange:fn=>{onAuth=fn;},getSession:async()=>({data:{session:{}}}),getUser:async()=>({data:{user:{id:'parent'}}}),signOut:async()=>{onAuth('SIGNED_OUT');return {}; }},from(table){return {select(){return {eq:async()=>({data:table==='mcs_members'?[{family_id:'family'}]:table==='mcs_children'?children:table==='mcs_tasks'?tasks:[],error:null})};},insert:async(rows)=>{tasks.push(...rows);return {};}};},rpc:async(name,{p_rows})=>{tasks.push(...p_rows.map(r=>({...r,version:1})));return {data:{added:p_rows.length,updated:0}};},functions:{invoke:async(name,{body})=>{
 if(name==='coach-ai')return {data:{available:false}};
 calls.push({name,body});const base={stage:'ready',session:'encrypted-session',expires:Date.now()+1200000,students:[{key:'10:25',name:'Élève A',className:'Classe'},{key:'10:26',name:'Élève B',className:'Classe'}]};
 if(body.action==='homework')base.rows=[{studentId:25,remoteId:123,subject:'Maths',given:'2026-11-09',due:'2026-11-10',html:'<p>Exercice</p>',documents:[]}];return {data:base};}}};
 w.eval(bundled.outputFiles[0].text);return {dom,w,tasks,calls};
}
const click=(w,s)=>w.document.querySelector(s).click();
function submit(w,id,values={}){const form=w.document.getElementById(id);for(const [k,v]of Object.entries(values))form.elements[k].value=v;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
test('parent connects, maps a child, previews, imports once and logs out without persisting credentials',async(t)=>{
 const {dom,w,tasks,calls}=boot();t.after(()=>dom.window.close());await tick();click(w,'[data-tab=import]');
 submit(w,'edLoginForm',{username:'ed-user',password:'private-password'});await tick();assert.equal(calls[0].body.action,'login');assert.ok(w.document.getElementById('edFetchForm'));
 submit(w,'edFetchForm',{student:'10:25',child:'a',from:'2026-11-09',to:'2026-11-22'});await tick();assert.match(w.document.getElementById('content').textContent,/Aperçu pour Élève A/);assert.equal(tasks.length,0);
 submit(w,'edImportForm');await tick();assert.equal(tasks.length,1);assert.equal(tasks[0].child_id,'a');assert.equal(tasks[0].source_key,'ecoledirecte:2026:25:123');
 click(w,'[data-tab=import]');submit(w,'edFetchForm',{student:'10:25',child:'a',from:'2026-11-09',to:'2026-11-22'});await tick();assert.match(w.document.getElementById('content').textContent,/Déjà importé/);assert.equal(w.document.querySelector('[name=item]').disabled,true);
 submit(w,'edImportForm');await tick();assert.equal(tasks.length,1);
 assert.equal(JSON.stringify({...w.localStorage,...w.sessionStorage}).includes('private-password'),false);
 click(w,'[data-tab=settings]');click(w,'#logout');await tick();click(w,'[data-tab=import]');assert.equal(w.document.getElementById('edFetchForm'),null);
});
test('child view cannot start an ÉcoleDirecte connection',async(t)=>{
 const {dom,w,calls}=boot();t.after(()=>dom.window.close());await tick();w.document.getElementById('profile').value='a';w.document.getElementById('profile').dispatchEvent(new w.Event('change'));click(w,'[data-tab=import]');assert.equal(w.document.getElementById('edLoginForm'),null);assert.equal(calls.length,0);
});
