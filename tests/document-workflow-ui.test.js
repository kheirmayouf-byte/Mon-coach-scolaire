import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const html=readFileSync('index.html','utf8').replace(/<script defer src="app\.js[^"]*"><\/script>/,''),bundle=readFileSync('app.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,25));
function boot(t){
 const dom=new JSDOM(html,{url:'https://example.test/',runScripts:'dangerously'});t.after(()=>dom.window.close());const w=dom.window;
 const task={id:'old',child:'a',subject:'HISTOIRE-GEOGRAPHIE',description:'Cours sur les civilisations (vidéo : https://tube-langues-vivantes.apps.education.fr/w/3eHWwMHKsYZTX7pRYYJQ7r). Audio : https://cdn.example.fr/cours.mp3',given:'2026-11-02',due:'2026-11-10',minutes:20,done:false};
 w.localStorage.setItem('mcs-local-v2',JSON.stringify({children:[{id:'a',name:'A'},{id:'b',name:'B'}],cards:[],tasks:[task,{...task,id:'next',due:'2026-11-17'},{...task,id:'sibling',child:'b',due:'2026-11-17'}],documents:[{id:'doc',child:'a',task_id:'old',subject:'Histoire',name:'Cours.pdf',mime:'application/pdf',bytes:100,verified:true,content_text:'Q1 : Les élèves étudient les grandes civilisations antiques.\nDéfinition : explication détaillée du cours'}]}));
 w.confirm=()=>true;w.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-12T10:00:00']));}static now(){return new Date('2026-11-12T10:00:00').getTime();}};w.eval(bundle);return w;
}
const click=(w,s)=>w.document.querySelector(s).click();
const submit=(w,s)=>w.document.querySelector(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
test('planning hides past empty days and distinguishes action from state',async t=>{
 const w=boot(t);await tick();click(w,'[data-tab=planning]');
 const dates=[...w.document.querySelectorAll('[data-work-date]')].map(el=>el.dataset.workDate);
 assert.deepEqual(dates,['2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
 assert.match(w.document.querySelector('.session-card').textContent,/À faire/);assert.equal(w.document.querySelector('[data-x=agenda-done]').textContent,'Marquer fait');
 const saved=JSON.parse(w.localStorage.getItem('mcs-local-v2'));assert.equal(saved.tasks.find(t=>t.id==='old').done,true);assert.equal(saved.tasks.find(t=>t.id==='next').done,false);
});
test('photo links persist across tasks, revisions and training without sibling access',async t=>{
 const w=boot(t);await tick();click(w,'[data-tab=documents]');click(w,'[data-x=link-doc][data-id=doc]');
 assert.equal(w.document.querySelector('[name=task][value=sibling]'),null);
 w.document.querySelector('[name=task][value=next]').checked=true;submit(w,'[data-xform=document-links]');await tick();
 click(w,'[data-tab=tasks]');assert.match(w.document.querySelector('[data-task-detail=next]').textContent,/Cours.pdf/);
 click(w,'[data-tab=revision]');assert.match(w.document.querySelector('.revision-document').textContent,/Cours.pdf/);
 assert.match(w.document.querySelector('.course-resources a').href,/tube-langues-vivantes/);assert.match(w.document.querySelector('.course-resources a').rel,/noopener/);
 assert.equal(w.document.querySelector('#documentTraining select[name=document]').options.length,2);
 const form=w.document.querySelector('[data-xform=document-training]');form.elements.document.value='doc';submit(w,'[data-xform=document-training]');
 assert.match(w.document.querySelector('.modal').textContent,/Source : Cours.pdf/);assert.doesNotMatch(w.document.querySelector('.modal').textContent,/\{Li/);
 click(w,'[data-x=close]');click(w,'[data-x=filter][data-id=b]');assert.equal(w.document.querySelectorAll('.revision-document').length,0);assert.equal(w.document.querySelector('#documentTraining select[name=document]').options.length,1);
});

test('audio and video play inside the exercise window alongside saved answers',async t=>{
 const w=boot(t);await tick();click(w,'[data-tab=revision]');click(w,'[data-x=media-exercise][data-id=next]');
 const frame=w.document.querySelector('.modal iframe'),audio=w.document.querySelector('.modal audio');assert.ok(frame);assert.ok(audio);assert.match(frame.src,/\/videos\/embed\//);assert.match(frame.src,/autoplay=0/);assert.equal(audio.controls,true);assert.equal(audio.autoplay,false);assert.doesNotMatch(w.document.querySelector('.modal').textContent,/Il manque la page/);
 w.document.querySelector('.modal [name=answers]').value='Réponse après écoute';submit(w,'.modal [data-xform=workspace]');await tick();
 assert.equal(w.document.querySelector('.modal iframe'),frame);assert.equal(JSON.parse(w.localStorage.getItem('mcs-local-v2')).workspaces[0].answers,'Réponse après écoute');
 click(w,'[data-x=close]');assert.equal(w.document.querySelector('.modal iframe'),null);
});
