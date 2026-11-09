import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync('index.html','utf8').replace('<script defer src="app.js"></script>','');
const bundle=()=>readFileSync('app.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function boot(seed){const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'});const w=dom.window;if(seed)w.localStorage.setItem('mcs-local-v2',JSON.stringify(seed));w.confirm=()=>true;w.eval(bundle());return dom;}
const click=(w,selector)=>w.document.querySelector(selector).click();
const fill=(w,name,value)=>{w.document.querySelector(`[name="${name}"]`).value=value;};
const submit=(w,id)=>w.document.getElementById(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
test('local task, child isolation, completion, revision and reload',async(t)=>{
 const dom=boot(),w=dom.window;t.after(()=>w.close());
 click(w,'[data-tab=tasks]');fill(w,'subject','Maths');fill(w,'description','Exercice');submit(w,'taskForm');await tick();
 assert.equal(JSON.parse(w.localStorage.getItem('mcs-local-v2')).tasks.length,1);
 w.document.getElementById('profile').value='child-2';w.document.getElementById('profile').dispatchEvent(new w.Event('change'));
 assert.equal(w.document.querySelectorAll('[data-check]').length,0);
 w.document.getElementById('profile').value='child-1';w.document.getElementById('profile').dispatchEvent(new w.Event('change'));
 const check=w.document.querySelector('[data-check]');check.checked=true;check.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
 assert.equal(JSON.parse(w.localStorage.getItem('mcs-local-v2')).tasks[0].done,true);
 click(w,'[data-tab=revision]');fill(w,'subject','Anglais');fill(w,'question','Hello ?');fill(w,'answer','Bonjour');submit(w,'cardForm');await tick();
 assert.equal(w.document.querySelectorAll('[data-review]').length,2);click(w,'[data-known=yes]');await tick();
 assert.equal(w.document.querySelectorAll('[data-review]').length,0);
 const saved=JSON.parse(w.localStorage.getItem('mcs-local-v2'));const second=boot(saved);assert.equal(JSON.parse(second.window.localStorage.getItem('mcs-local-v2')).tasks[0].done,true);second.window.close();w.close();
});
test('untrusted stored content is escaped and import is atomic',async()=>{
 const dom=boot({children:[{id:'a',name:'Enfant A'}],cards:[],tasks:[{id:'t',child:'a',subject:'<img src=x onerror=alert(1)>',description:'<script>alert(1)</script>',given:'2026-11-09',due:'2026-11-10',minutes:20,done:false}]});const w=dom.window;
 assert.equal(w.document.querySelectorAll('#content img,#content script').length,0);
 click(w,'[data-tab=import]');fill(w,'text','Enfant A | Maths | 2026-11-09 | 2026-11-10 | Exo\nEnfant A | Maths | 2026-02-30 | 2026-11-10 | Erreur');submit(w,'importForm');await tick();
 assert.equal(JSON.parse(w.localStorage.getItem('mcs-local-v2')).tasks.length,1);assert.match(w.document.getElementById('notice').textContent,/Ligne 2/);w.close();
});
test('initial prototype local tasks preserved without hardcoded names',()=>{
 const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'});const w=dom.window;
 w.localStorage.setItem('mon-coach-scolaire-v1',JSON.stringify({tasks:[{id:'legacy',child:'legacy-child',subject:'Maths',description:'Exo',given:'2026-11-09',due:'2026-11-10',done:false}],scores:[{score:1}]}));w.eval(bundle());
 assert.equal(JSON.parse(w.localStorage.getItem('mcs-local-v2')).tasks[0].subject,'Maths');assert.ok(w.localStorage.getItem('mon-coach-scolaire-v1'));w.close();
});
