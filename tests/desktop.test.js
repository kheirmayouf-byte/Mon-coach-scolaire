import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {learningContext} from '../src/desktop.js';
const data={children:[{id:'a'},{id:'b'}],tasks:[{id:'ta',child:'a',subject:'Maths',description:'Fractions'}],profiles:[{child:'a',settings:{confirmed:true,needs:'Un pas',instructions:'Consigne A'}},{child:'b',settings:{confirmed:true,instructions:'secret B'}}],documents:[{id:'da',child:'a',task_id:'ta',verified:true,name:'Cours A',content_text:'Fraction : part'},{id:'db',child:'b',verified:true,content_text:'secret B'},{id:'dc',child:'a',verified:false,content_text:'non vérifié'}]};
test('desktop request excludes the sibling, unverified material and account credentials',()=>{
 const result=learningContext(data,'a','ta');assert.equal(result.supports.length,1);assert.match(JSON.stringify(result),/Consigne A/);assert.doesNotMatch(JSON.stringify(result),/secret B|non vérifié/);
 assert.throws(()=>learningContext(data,'b','ta'),/ne correspond/);assert.throws(()=>learningContext({...data,profiles:[]},'a','ta'),/confirme/);
});
test('desktop UI connects, tests and disconnects through its bridge without invoking paid functions',async t=>{
 const html=readFileSync('index.html','utf8').replace(/<script defer src="app\.js[^"]*"><\/script>/,''),dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'});t.after(()=>dom.window.close());
 const w=dom.window;let connected=false,calls=[];const status=()=>({available:connected,status:connected?'connected':'disconnected',account:'parent@example.test'});
 w.coachDesktop={status:async()=>({ok:true,data:status()}),connect:async()=>{calls.push('connect');connected=true;return {ok:true,data:status()};},models:async()=>({ok:true,data:[{slug:'allowed',displayName:'Modèle test'}]}),test:async model=>{calls.push(model);return {ok:true,data:{answer:'Connexion réussie'}};},disconnect:async()=>{connected=false;return {ok:true,data:status()};}};
 w.eval(readFileSync('app.js','utf8'));const tick=()=>new Promise(r=>setTimeout(r,30));await tick();w.document.querySelector('[data-tab=settings]').click();w.document.querySelector('[data-x=desktop-connect]').click();await tick();assert.ok(w.document.querySelector('[data-x=desktop-test]'));assert.match(w.document.querySelector('#chatgptSettings').textContent,/aucun|Aucun/);
 w.document.querySelector('[data-x=desktop-test]').click();await tick();assert.deepEqual(calls,['connect','allowed']);assert.match(w.document.querySelector('#chatgptSettings').textContent,/Test réussi/);
 w.document.querySelector('[data-x=desktop-disconnect]').click();await tick();assert.equal(w.document.querySelector('[data-x=desktop-test]'),null);assert.match(w.document.querySelector('#chatgptSettings').textContent,/déconnecté/);
});
test('changing child while an answer is pending never displays the previous child’s answer',async t=>{
 const html=readFileSync('index.html','utf8').replace(/<script defer src="app\.js[^"]*"><\/script>/,''),dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'});t.after(()=>dom.window.close());const w=dom.window;
 w.localStorage.setItem('mcs-local-v2',JSON.stringify({...data,cards:[]}));let finish,submitted;
 w.coachDesktop={status:async()=>({ok:true,data:{available:true,status:'connected'}}),models:async()=>({ok:true,data:[{slug:'allowed'}]}),ask:async body=>{submitted=body;return new Promise(r=>{finish=r;});}};
 w.eval(readFileSync('app.js','utf8'));const tick=()=>new Promise(r=>setTimeout(r,30));await tick();
 const select=w.document.querySelector('#profile');select.value='a';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 w.document.querySelector('#coachQuestion').value='Aide-moi';w.document.querySelector('[data-x=ask]').click();await tick();assert.equal(submitted.child,'a');assert.doesNotMatch(JSON.stringify(submitted),/secret B/);
 select.value='b';select.dispatchEvent(new w.Event('change',{bubbles:true}));finish({ok:true,data:{answer:'Réponse privée pour A'}});await tick();assert.doesNotMatch(w.document.querySelector('#coachAnswer').textContent,/Réponse privée pour A/);
});
