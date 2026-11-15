import {test} from 'node:test';
import assert from 'node:assert/strict';
import {documentQuestions} from '../src/document-exercises.js';
import {taskDocuments,subjectKey} from '../src/document-links.js';
import {sourceQuestions} from '../src/coach.js';
test('documents follow explicit multiple-task links and generic subject aliases, never siblings',()=>{
 const t={id:'two',child:'a',subject:'MATHEMATIQUES'},docs=[{id:'d',child:'a',task_id:'one',subject:'Mathématique'},{id:'g',child:'a',subject:'Maths'},{id:'other',child:'b',task_id:'two',subject:'Maths'}];
 assert.deepEqual(taskDocuments(t,docs,[{document_id:'d',task_id:'two',child:'a'}]).map(d=>d.id),['d','g']);
 assert.deepEqual(taskDocuments(t,docs).map(d=>d.id),['g']);assert.equal(subjectKey('Histoire'),subjectKey('HISTOIRE-GEOGRAPHIE'));
});
test('a precise filename cited by the teacher reuses the existing course instead of reporting zero supports',()=>{
 const task={id:'nov17',child:'b',subject:'FRANCAIS',description:'Voir tableau ci-joint : Conjug.Passe´Simple26-27.pdf'};
 const doc={id:'course',child:'b',task_id:'nov24',subject:'Français',name:'Conjug.Passe´Simple26-27.pdf',source_key:'ed:26:123:456'};
 assert.deepEqual(taskDocuments(task,[doc]).map(d=>d.id),['course']);assert.equal(taskDocuments({...task,child:'a'},[doc]).length,0);
});
test('wrapped prose creates grounded gap exercises; corrupted OCR cannot become a definition',()=>{
 const doc={id:'d',child:'a',task_id:'t',name:'Cours',verified:true,content_text:'Q1 : Le Coran est écrit en arabe. Il\nest considéré comme sacré car ce\nsont les paroles de Dieu pour les\nmusulmans.\n{Li : #0 0 40 D |\nÉlectricité : circulation des charges électriques'};
 const questions=documentQuestions(doc);assert.ok(questions.length>=2);assert.ok(questions.some(q=>q.excerpt?.includes('musulmans.')));assert.ok(questions.every(q=>q.source_id==='d'));
 assert.ok(questions.every(q=>!/[{}|#]/.test(q.question+q.answer)));
 for(const q of questions.filter(q=>q.excerpt))assert.equal(q.question.split('\n').slice(1).join('\n').replace('_____',q.answer),q.excerpt);
 assert.equal(documentQuestions({...doc,verified:false}).length,0);
 assert.equal(documentQuestions({...doc,content_text:'{Li : #0 0 40 D |\n= E 55 LL.\n2 ’ ]'}).length,0);
 const t={id:'other',child:'a',subject:'Maths'};
 assert.equal(sourceQuestions(t,[],[doc]).length,0);
 assert.ok(sourceQuestions(t,[],[doc],[{document_id:'d',task_id:'other',child:'a'}]).length>0);
});
