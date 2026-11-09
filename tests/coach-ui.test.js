import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync('index.html','utf8').replace(/<script defer src="app\.js[^"]*"><\/script>/,''),bundle=readFileSync('app.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,25));
const seed=()=>({children:[{id:'a',name:'Enfant A'},{id:'b',name:'Enfant B'}],cards:[],tasks:[{id:'ta',child:'a',subject:'Sciences',description:'Apprendre les définitions',given:'2026-11-09',due:'2026-11-10',minutes:20,done:false},{id:'tb',child:'b',subject:'Anglais',description:'Apprendre le vocabulaire',given:'2026-11-09',due:'2026-11-10',minutes:10,done:false}],documents:[{id:'doc',child:'a',task_id:'ta',name:'Cours',subject:'Sciences',verified:true,content_text:'Atome : constituant de la matière\nMolécule : assemblage d’atomes\nÉlectron : particule chargée négativement',bytes:100,mime:'text/plain'}]});
function boot(data=seed()){const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'}),w=dom.window;w.localStorage.setItem('mcs-local-v2',JSON.stringify(data));let clock=0;Object.defineProperty(w.performance,'now',{value:()=>clock});w.confirm=()=>true;w.eval(bundle);return {dom,w,advance:n=>{clock+=n;}};}
const click=(w,s)=>w.document.querySelector(s).click();
const submit=(w,s)=>w.document.querySelector(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const saved=w=>JSON.parse(w.localStorage.getItem('mcs-local-v2'));
test('parent filters persist through tasks and agenda; details and status are explicit',async(t)=>{
 const {dom,w}=boot();t.after(()=>dom.window.close());click(w,'[data-x=filter][data-id=a]');click(w,'[data-tab=tasks]');assert.equal(w.document.querySelectorAll('.homework').length,1);assert.match(w.document.querySelector('.done-control').textContent,/À faire/);
 click(w,'[data-tab=planning]');assert.equal(w.document.querySelectorAll('.agenda thead th').length,2);assert.match(w.document.querySelector('.agenda').textContent,/Enfant A/);assert.doesNotMatch(w.document.querySelector('.agenda').textContent,/Enfant B/);
 click(w,'[data-tab=tasks]');const check=w.document.querySelector('[data-check=ta]');check.checked=true;check.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.equal(saved(w).tasks[0].done,true);assert.match(w.document.getElementById('modalHost').textContent,/Devoir terminé/);
 click(w,'[data-x=later]');w.document.querySelector('[data-xform=reminder] [name=due]').value=new Date(Date.now()+86400000).toISOString().slice(0,10);submit(w,'[data-xform=reminder]');await tick();assert.equal(saved(w).reminders.length,1);assert.equal(saved(w).tasks[0].done,true);
});
test('task timer counts active segments, pauses and saves a declared correction',async(t)=>{
 const {dom,w,advance}=boot();t.after(()=>dom.window.close());click(w,'[data-tab=tasks]');click(w,'[data-x=start][data-id=ta]');await tick();advance(65000);click(w,'[data-x=pause]');await tick();assert.equal(saved(w).sessions[0].seconds,65);assert.equal(saved(w).sessions[0].status,'paused');advance(120000);click(w,'[data-x=resume]');await tick();advance(45000);click(w,'[data-x=stop-timer]');await tick();assert.equal(saved(w).sessions[0].seconds,110);
 const form=w.document.querySelector('[data-xform=session-end]');form.elements.minutes.value='2';submit(w,'[data-xform=session-end]');await tick();assert.equal(saved(w).sessions[0].seconds,120);assert.equal(saved(w).sessions[0].status,'completed');assert.equal(saved(w).tasks[0].done,false);
});
test('screen timer pauses on backgrounding and a recovered session never counts time away',async(t)=>{
 const {dom,w,advance}=boot();t.after(()=>dom.window.close());click(w,'[data-tab=tasks]');click(w,'[data-x=start][data-id=ta]');await tick();advance(30000);Object.defineProperty(w.document,'visibilityState',{value:'hidden',configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));await tick();assert.equal(saved(w).sessions[0].seconds,30);assert.equal(saved(w).sessions[0].status,'paused');
 const recovered=boot(saved(w));t.after(()=>recovered.dom.window.close());assert.match(recovered.w.document.getElementById('sessionDock').textContent,/En pause/);assert.equal(saved(recovered.w).sessions[0].seconds,30);
});
test('source quiz records independent results, per-question time and correct-child provenance',async(t)=>{
 const {dom,w,advance}=boot();t.after(()=>dom.window.close());click(w,'[data-tab=tasks]');click(w,'[data-x=practice][data-id=ta][data-minutes="5"]');
 const definitions={'Atome':'constituant de la matière','Molécule':'assemblage d’atomes','Électron':'particule chargée négativement'};
 for(let i=0;i<3;i++){
  const question=w.document.querySelector('.modal strong').textContent,term=Object.keys(definitions).find(k=>question.includes(k));const label=[...w.document.querySelectorAll('.modal label')].find(l=>l.textContent.trim()===definitions[term]);assert.ok(label);label.querySelector('input').checked=true;advance(10000);submit(w,'[data-xform=practice-answer]');click(w,'[data-x=next-question]');await tick();
 }
 const attempt=saved(w).attempts[0];assert.equal(attempt.child,'a');assert.equal(attempt.score,3);assert.equal(attempt.total,3);assert.equal(attempt.duration_seconds,30);assert.equal(attempt.details.length,3);assert.equal(attempt.assisted,false);
 click(w,'[data-x=close]');click(w,'[data-x=practice][data-id=tb][data-minutes="5"]');assert.match(w.document.getElementById('modalHost').textContent,/Le support manque/);
});
test('documents offer camera capture and private upload; pedagogy remains child-specific',async(t)=>{
 const {dom,w}=boot();t.after(()=>dom.window.close());click(w,'[data-tab=documents]');assert.equal(w.document.querySelector('[name=photo]').getAttribute('capture'),'environment');
 click(w,'[data-tab=settings]');const form=w.document.querySelector('[data-xform=pedagogy][data-child=a]');form.elements.instructions.value='Une étape à la fois';form.elements.hide_timer.checked=true;submit(w,'[data-xform=pedagogy][data-child=a]');await tick();assert.equal(saved(w).profiles[0].child,'a');assert.equal(saved(w).profiles[0].settings.instructions,'Une étape à la fois');assert.equal(saved(w).profiles[0].settings.confirmed,false);
});
