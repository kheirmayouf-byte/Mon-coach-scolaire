import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {prepareEDImport,teacherText} from '../src/ecoledirecte.js';
import {EDClient,extractStudents} from '../supabase/functions/ecoledirecte/protocol.js';
import {makeEnvelope} from '../supabase/functions/ecoledirecte/envelope.js';
const dom=new JSDOM(''),Parser=dom.window.DOMParser;
const b64=s=>Buffer.from(s).toString('base64');
const students={accounts:[{id:10,idLogin:11,typeCompte:'F',main:true,profile:{eleves:[{id:25,prenom:'Élève A'},{id:26,prenom:'Élève B'}]}}]};
const row={studentId:25,remoteId:123,subject:'Maths',given:'2026-11-09',due:'2026-11-10',html:'<p>Exercice 1</p>',documents:[],hasDocuments:false};
function mock(replies){const calls=[];return {calls,fetch:async(url,init)=>{calls.push({url,init});const next=replies.shift();assert.ok(next,'unexpected upstream request');return new Response(next.text??JSON.stringify(next.body),{status:next.status||200,headers:next.headers});}};}
test('teacher HTML is inert text; links and scripts do not reach stored homework',()=>{
 assert.equal(teacherText('<script>bad()</script><p>Lis <b>la leçon</b><br>p. 12 <a href="https://host/?token=secret">document</a><img src=x></p>',Parser),'Lis la leçon\np. 12 document');
 const items=prepareEDImport([row,{...row}], 'child-a',[],Parser);assert.equal(items.length,1);assert.equal(items[0].status,'new');assert.equal(items[0].task.source_key,'ecoledirecte:2026:25:123');
 const again=prepareEDImport([{...row,due:'2026-11-12'}],'child-a',[items[0].task],Parser);assert.equal(again[0].status,'existing');assert.equal(again[0].changed,true);
 assert.equal(prepareEDImport([row],'child-b',[items[0].task],Parser)[0].status,'new');
});
test('bad dates reject the whole preview; missing details and document limits are explicit',()=>{
 assert.throws(()=>prepareEDImport([row,{...row,remoteId:124,given:'bad'}],'a',[],Parser));
 const r=prepareEDImport([{...row,html:'',hasDocuments:true,documents:['Fiche.pdf']}],'a',[],Parser)[0];assert.equal(r.task.detail_missing,true);assert.match(r.task.description,/Fiche.pdf/);
 assert.throws(()=>prepareEDImport([{...row,html:'x'.repeat(4100)}],'a',[],Parser));
});
test('envelopes reject wrong parent, tampering and expired state; credentials are encrypted',async()=>{
 const box=await makeEnvelope('server-only-test-key');const value=await box.seal({pending:{motdepasse:'private-password'}},'parent-a',Date.now()+10000);
 assert.equal(value.includes('private-password'),false);assert.equal((await box.open(value,'parent-a')).state.pending.motdepasse,'private-password');
 await assert.rejects(box.open(value,'parent-b'));await assert.rejects(box.open(value+'a','parent-a'));
 await assert.rejects(box.open(await box.seal({},'parent-a',Date.now()-1),'parent-a'));
});
test('login, cookies, token rotation and read-only homework routes',async()=>{
 const m=mock([{text:'',headers:{'set-cookie':'GTK=gtk; Path=/'}},{body:{code:200,token:'login-token',data:students}},{body:{code:200,token:'next-token',data:{'2026-11-10':[{idDevoir:123,matiere:'Maths',donneLe:'2026-11-09',documentsAFaire:true}]}}},{body:{code:200,data:{matieres:[{id:123,matiere:'Maths',aFaire:{idDevoir:123,contenu:b64('<p>Exercice</p>'),documents:[{libelle:'Fiche.pdf'}]}}]}}}]);
 const client=new EDClient({},m.fetch);const login=await client.login('user','secret');assert.equal(login.stage,'ready');assert.equal(client.state.pending,undefined);assert.equal(login.students.length,2);
 assert.equal(m.calls[1].init.headers.Cookie,'GTK=gtk');
 const result=await client.homework('10:25','2026-11-09','2026-11-22');assert.equal(result.rows[0].html,'<p>Exercice</p>');assert.deepEqual(result.rows[0].documents,['Fiche.pdf']);assert.equal(m.calls[3].init.headers['X-Token'],'next-token');
 assert.ok(m.calls.slice(2).every(c=>c.url.includes('verbe=get')));
 await assert.rejects(client.homework('10:999','2026-11-09','2026-11-10'),/inaccessible/);
 await assert.rejects(client.homework('10:25','2026-11-09','2026-12-10'),/14 jours/);
});
test('identity question needs a user-selected answer then replays the accepted proof',async()=>{
 const m=mock([{text:''},{body:{code:250,token:'challenge',data:{totp:false}}},{body:{code:200,data:{question:b64('Ta réponse ?'),propositions:[b64('Un'),b64('Deux')]}}},{body:{code:200,data:{cn:'proof-name',cv:'proof-value'}}},{text:''},{body:{code:200,token:'ready',data:students}}]);
 const c=new EDClient({},m.fetch);const q=await c.login('user','secret');assert.equal(q.stage,'question');assert.deepEqual(q.choices,['Un','Deux']);const ready=await c.answer(1);assert.equal(ready.stage,'ready');assert.equal(c.state.pending,undefined);
 assert.equal(JSON.parse(new URLSearchParams(m.calls[3].init.body).get('data')).choix,b64('Deux'));
 const replay=JSON.parse(new URLSearchParams(m.calls[5].init.body).get('data'));assert.equal(replay.cn,'proof-name');assert.equal(replay.fa[0].cv,'proof-value');
});
test('TOTP and blocked accounts stop without automatic retries',async()=>{
 const m=mock([{text:''},{body:{code:250,token:'challenge',data:{totp:true}}},{text:''},{body:{code:200,token:'ready',data:students}}]);const c=new EDClient({},m.fetch);
 assert.equal((await c.login('user','secret')).stage,'totp');await assert.rejects(c.answer('wrong'),/six chiffres/);assert.equal((await c.answer('123456')).stage,'ready');
 const bad=mock([{text:''},{body:{code:516,message:'sensitive raw upstream message'}}]);await assert.rejects(new EDClient({},bad.fetch).login('user','secret'),/Compte bloqué/);assert.equal(bad.calls.length,2);
});
test('only parent-linked or own student profiles are selectable',()=>{
 assert.equal(extractStudents({accounts:[{id:1,typeCompte:'P',profile:{eleves:[{id:2}]}}]}).length,0);
 assert.equal(extractStudents({accounts:[{id:1,typeCompte:'E',prenom:'Élève'}]})[0].id,1);
});

test('numeric parent type codes and numeric-string ids expose only their own linked pupils',async()=>{
 for(const typeCompte of ['F','1','2',1,2]){
  const data={accounts:[{id:'10',idLogin:'11',typeCompte,main:true,profile:{eleves:[{id:'25',prenom:'Élève A'},{id:26,prenom:'Élève B'}]}}]};
  const m=mock([{text:''},{body:{code:200,token:'session-token',data}}]);
  const c=new EDClient({},m.fetch),result=await c.login('user','secret');
  assert.equal(result.stage,'ready');assert.deepEqual(result.students.map(s=>s.key),['10:25','10:26']);assert.equal(c.state.account,10);assert.equal(c.state.students[0].idLogin,11);
 }
 const unsupported={accounts:[{id:'10',typeCompte:'P',profile:{eleves:[{id:'25'}]}},{id:11,typeCompte:'A',profile:{eleves:[{id:26}]}},{id:12,typeCompte:'T',profile:{eleves:[{id:27}]}}]};
 assert.deepEqual(extractStudents(unsupported),[]);
 const malformed={accounts:[{id:10,typeCompte:'F',profile:{eleves:[{id:0},{id:-1},{id:'25bad'},{id:'0x19'},{id:true},{id:'1e3'},{id:'9007199254740992'},{id:'25'}]}}]};
 assert.deepEqual(extractStudents(malformed).map(s=>s.id),[25]);
});
test('missing token and missing pupils are distinct; diagnostics contain no account data',async()=>{
 const absentToken=mock([{text:''},{body:{code:200,data:students}}]);
 await assert.rejects(new EDClient({},absentToken.fetch).login('user','secret'),e=>e.code==='ED_NO_TOKEN');
 const absentProfiles=mock([{text:''},{body:{code:200,token:'sensitive-session',data:{accounts:[{id:10,typeCompte:'P',prenom:'private-name',nom:'private-surname',identifiant:'private-user',profile:{eleves:[{id:25,prenom:'private-child'}]}}]}}}]);
 await assert.rejects(new EDClient({},absentProfiles.fetch).login('private-user','private-password'),e=>{
  assert.equal(e.code,'ED_NO_PROFILES');assert.deepEqual(e.diagnostic,{accountsArray:true,accountCount:1,accounts:[{type:'P',validAccountId:true,pupilsArray:true,pupilCount:1}]});
  assert.doesNotMatch(JSON.stringify(e.diagnostic),/private|password|token|25|10/);return true;
 });
});

test('homework attachment references are sealed, downloads are bounded and cannot target arbitrary files',async()=>{
 const m=mock([{text:''},{body:{code:200,token:'login-token',data:students}},{body:{code:200,data:{'2026-11-10':[{idDevoir:123,matiere:'Maths',donneLe:'2026-11-09',documentsAFaire:true}]}}},{body:{code:200,data:{matieres:[{id:123,matiere:'Maths',aFaire:{idDevoir:123,contenu:b64('<p>Exercice</p>'),documents:[{id:77,libelle:'Cours.pdf'}]}}]}}},{text:'%PDF-1.7\nfixture',headers:{'content-type':'application/pdf'}}]);
 const c=new EDClient({},m.fetch);await c.login('user','secret');const result=await c.homework('10:25','2026-11-09','2026-11-22');assert.equal(result.rows[0].attachment_refs[0].key,'25:123:77');
 await assert.rejects(c.download('25:123:99'),/Relis les devoirs/);assert.equal(m.calls.length,4);
 const file=await c.download('25:123:77');assert.equal(file.file.mime,'application/pdf');assert.ok(m.calls[4].url.includes('fichierId=77'));assert.equal(m.calls[4].init.headers['X-Token'],'login-token');
});
