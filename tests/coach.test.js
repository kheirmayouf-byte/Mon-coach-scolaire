import {test} from 'node:test';
import assert from 'node:assert/strict';
import {weekMetrics,estimateTask,competency,sourceQuestions,validatePedagogy} from '../src/coach.js';
import {plan} from '../src/core.js';
const task=(p={})=>({id:'t',child:'a',subject:'Maths',description:'Exercice',given:'2026-11-09',due:'2026-11-10',minutes:20,done:false,...p});
test('weekly weighted progress, new work and overdue tasks are distinct',()=>{
 const children=[{id:'a'}],tasks=[task({id:'1',minutes:10,done:true}),task({id:'2',minutes:30})];
 let k=weekMetrics(tasks,children,[],'2026-11-09',40);assert.equal(k.percent,25);assert.equal(k.remaining,30);assert.equal(k.level,'green');
 k=weekMetrics([...tasks,task({id:'3',minutes:40}),task({id:'old',due:'2026-11-08',minutes:5})],children,[],'2026-11-09',40);assert.equal(k.percent,13);assert.equal(k.count,3);assert.equal(k.remaining,75);
 assert.equal(weekMetrics([],children,[],'2026-11-09').percent,0);
});
test('load cannot hide a blocked child or impossible deadline behind spare family time',()=>{
 const k=weekMetrics([task({due:'2026-11-09',minutes:50})],[{id:'a'},{id:'b'}],[],'2026-11-09',40);assert.equal(k.level,'red');assert.equal(k.overloaded,true);
 const pauses=weekMetrics([task({due:'2026-11-09',minutes:40})],[{id:'a'}],[],'2026-11-09',40);assert.equal(pauses.level,'red');
});
test('assessment preparation has priority without exceeding day budgets',()=>{
 const tasks=[task({id:'normal',minutes:20,due:'2026-11-11'}),task({id:'exam',minutes:20,due:'2026-11-12',is_assessment:true})];
 const p=plan(tasks,25,'2026-11-09',4);assert.equal(p.slots[0].task.id,'exam');assert.equal(p.unscheduled.length,0);
});
test('estimates are bounded and a child’s history does not mix with a sibling',()=>{
 assert.ok(estimateTask(task({description:'Faire 4 exercices'})).minutes>20);
 const sessions=Array.from({length:3},()=>({child:'b',subject:'Maths',status:'completed',seconds:6000}));assert.equal(estimateTask(task(),{},sessions).minutes,20);
 assert.throws(()=>validatePedagogy({session_minutes:60}));assert.equal(validatePedagogy({hide_timer:true}).hide_timer,true);
});
test('mastery needs independent varied and delayed successes, never speed',()=>{
 const attempt=(date,ids,extra={})=>({child:'a',topic:'Fractions',score:5,total:5,assisted:false,question_ids:ids,created_at:date+'T12:00:00Z',...extra});
 const a=attempt('2026-11-09',['1','2','3','4','5']);assert.equal(competency([a])[0].level,'En cours');
 const b=attempt('2026-11-10',['4','5','6','7','8']);assert.equal(competency([a,b])[0].level,'À l’aise');
 const c=attempt('2026-11-13',['7','8','9','10','11']);assert.equal(competency([a,b,c])[0].level,'Confirmé');
 assert.equal(competency([a,b,{...c,assisted:true}])[0].level,'À l’aise');
 assert.equal(competency([a,{...b,child:'b'},{...c,child:'b'}]).find(x=>x.child==='a').level,'En cours');
});
test('local exercises use verified explicit definitions and the correct child',()=>{
 const t=task(),docs=[{id:'1',child:'a',task_id:'t',verified:true,name:'Cours',content_text:'Fraction : quotient de deux nombres\nUne phrase sans définition'},{id:'2',child:'b',task_id:'t',verified:true,name:'Autre',content_text:'Privé : autre enfant'},{id:'3',child:'a',task_id:'t',verified:false,name:'Non vérifié',content_text:'Non : non'}];
 const q=sourceQuestions(t,[],docs);assert.equal(q.length,1);assert.equal(q[0].source,'Cours');assert.equal(q[0].answer,'quotient de deux nombres');
});

test('individual session lengths change planning chunks and preserve breaks',()=>{
 const t=task({minutes:20}),profiles=[{child:'a',settings:{session_minutes:10}}],p=plan([t],30,'2026-11-09',1,[],profiles);
 assert.deepEqual(p.slots.map(s=>s.minutes),[10,10]);assert.equal(p.slots[1].pause_before,5);assert.equal(p.unscheduled.length,0);
});
