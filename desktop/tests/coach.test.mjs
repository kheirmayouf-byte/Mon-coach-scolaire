import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCoach,contextFor,validatedQuiz} from '../coach.mjs';
import {credentialEncryption} from '../encryption.mjs';
const context={confirmed:true,pedagogy:{needs:'Consignes courtes',instructions:'Une étape'},task:{subject:'Sciences',description:'Réviser'},supports:[{id:'doc',name:'Cours',verified:true,text:'Atome : constituant de la matière'},{id:'bad',name:'Non vérifié',verified:false,text:'secret'}]};
test('only confirmed pedagogy and verified source text enter requests',()=>{
 assert.throws(()=>contextFor({context:{...context,confirmed:false}}),/fiche pédagogique/);
 assert.equal(contextFor({context}).supports.length,1);
 assert.equal(contextFor({context}).pedagogy.instructions,'Une étape');
});
test('text request uses a discovered model and test carries no family context',async()=>{
 const calls=[],client={getSession:async()=>({status:'connected',sharing:true,identity:{email:'parent@example.test'},credentials:'secret'}),listModels:async()=>[{slug:'allowed',displayName:'Modèle autorisé'}],streamResponse:async body=>{calls.push(body);return {text:'Réponse'};}};
 const coach=createCoach(client);assert.deepEqual(await coach.status(),{status:'connected',sharing:true,available:true,account:'parent@example.test',transport:'chatgpt-plan',supportsImages:false});
 await coach.test('allowed');assert.doesNotMatch(JSON.stringify(calls[0]),/Sciences|Consignes courtes|Atome/);
 await coach.request({action:'ask',context,model:'allowed',question:'Aide-moi'});assert.equal(calls[1].model,'allowed');assert.match(calls[1].input,/Consignes courtes/);assert.doesNotMatch(calls[1].input,/secret/);
 await assert.rejects(coach.request({action:'ask',context,model:'not-allowed'}),/modèle disponible/);assert.equal(calls.length,2);
});
test('no paid fallback or automatic retry on a plan limit',async()=>{
 let calls=0;const error=Object.assign(Error('limit'),{code:'quota_exceeded'}),coach=createCoach({listModels:async()=>[{slug:'allowed'}],streamResponse:async()=>{calls++;throw error;}});
 await assert.rejects(coach.request({action:'ask',context}),e=>e===error);assert.equal(calls,1);
});
test('quiz rejects invented source IDs, invalid answers and duplicate choices',()=>{
 const q={question:'Question ?',choices:['A','B','C'],answer:1,explanation:'Voir le cours',source_id:'doc'};
 assert.equal(validatedQuiz(JSON.stringify({questions:[q]}),context.supports)[0].answer,'B');
 for(const patch of [{source_id:'invented'},{answer:3},{choices:['A','A','C']}])assert.throws(()=>validatedQuiz(JSON.stringify({questions:[{...q,...patch}]}),context.supports));
});
test('missing sources or unsupported scan stops before any model call',async()=>{
 let calls=0;const coach=createCoach({listModels:async()=>{calls++;return [];}});
 await assert.rejects(coach.request({action:'generate',context:{...context,supports:[]}}),/texte vérifié/);
 await assert.rejects(coach.request({action:'analyze',context}),/photo/);assert.equal(calls,0);
});
test('unavailable OS vault and Linux plaintext backend never encrypt or decrypt',()=>{
 let calls=0;const storage={isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'basic_text',encryptString:()=>{calls++;},decryptString:()=>{calls++;}};
 const adapter=credentialEncryption(storage,'linux');assert.equal(adapter.isAvailable(),false);assert.throws(()=>adapter.encrypt('secret'));assert.throws(()=>adapter.decrypt(Buffer.alloc(1)));assert.equal(calls,0);
 const windows=credentialEncryption({...storage,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()},'win32');assert.equal(windows.decrypt(windows.encrypt('roundtrip')),'roundtrip');
});
