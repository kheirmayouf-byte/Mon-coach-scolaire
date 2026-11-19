import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,readFile,rm,chmod,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadVault} from './vault.mjs';
import {createServerHandler} from './relay.mjs';
import {SITE_ORIGIN} from '../desktop/browser-relay.mjs';

async function request(handler,method='status',extra={}) {
  const req=Readable.from([Buffer.from(extra.raw || '{}')]);
  req.url='/v1/'+method; req.method=extra.method || 'POST';
  req.headers={origin:SITE_ORIGIN,host:'127.0.0.1:4174',authorization:'MCS-Relay test',
    'content-type':'application/json',...extra.headers};
  let status,body;
  await handler(req,{destroyed:false,writeHead(s){status=s;},end(s){body=s?JSON.parse(s):null;}});
  return {status,body};
}
function setup() {
  let user='parent',family='family',profileId='profile',nonce=0,calls=0,repeat=false;
  const owner={user,family,binding:profileId};
  const handler=createServerHandler({owner,client:{getSession:async()=>({profileId}),listModels:async()=>[]},
    coach:{status:async()=>({available:true,status:'connected'}),request:async()=>{calls++;return {answer:'ok'};},test:async()=>({answer:'ok'})},
    verify:async()=>({user,family,nonce:repeat?'repeated':String(nonce++)})});
  return {handler,calls:()=>calls,owner,set(values){({user=user,family=family,profileId=profileId,repeat=repeat}=values);}};
}
test('server accepts only its pinned parent and ChatGPT profile',async()=>{
  const s=setup();
  assert.equal((await request(s.handler,'ask')).status,200);
  s.owner.user='attacker'; // caller cannot mutate the pin after startup
  assert.equal((await request(s.handler)).status,200);
  s.set({user:'other'}); assert.ok((await request(s.handler,'ask')).status>=400);
  s.set({user:'parent',family:'other'}); assert.ok((await request(s.handler,'ask')).status>=400);
  s.set({family:'family',profileId:'private-profile-two'});
  const status=await request(s.handler);
  assert.equal(status.body.data.available,false);
  assert.equal((await request(s.handler,'ask')).status,403);
  assert.equal(s.calls(),1);
  assert.doesNotMatch(JSON.stringify(status),/private-profile-two|binding/);
});
test('HTTP cannot initiate OAuth, replace the parent, unlink or open external pages',async()=>{
  const s=setup();
  for (const method of ['connect','unlink','usage','cancel','admin','tokens'])
    assert.equal((await request(s.handler,method)).status,404);
  assert.equal(s.calls(),0);
});
test('server rejects missing auth, foreign origin/host, oversized input and replay',async()=>{
  const s=setup();
  for (const headers of [{authorization:''},{origin:'https://attacker.test'},{host:'attacker.test'}])
    assert.ok((await request(s.handler,'ask',{headers})).status>=400);
  assert.equal((await request(s.handler,'ask',{raw:'x'.repeat(150001)})).status,413);
  s.set({repeat:true});
  assert.equal((await request(s.handler)).status,200);
  assert.equal((await request(s.handler)).status,401);
  assert.equal(s.calls(),0);
});
test('server refuses incomplete owner configuration',()=>{
  assert.throws(()=>createServerHandler({owner:{user:'parent'}}));
});
test('vault survives restarts, uses random nonces and authenticates ciphertext',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mcs-vault-'));
  try {
    const v=await loadVault(dir,{initialize:true}),a=v.encrypt('refresh-secret'),b=v.encrypt('refresh-secret');
    assert.notDeepEqual(a,b); assert.doesNotMatch(a.toString(),/refresh-secret/);
    const key=await readFile(join(dir,'vault.key'));
    const restarted=await loadVault(dir,{initialize:true});
    assert.deepEqual(await readFile(join(dir,'vault.key')),key);
    assert.equal(restarted.decrypt(a),'refresh-secret');
    a[a.length-1]^=1; assert.throws(()=>restarted.decrypt(a));
    assert.equal((await stat(join(dir,'vault.key'))).mode & 0o777,0o600);
    const other=await mkdtemp(join(tmpdir(),'mcs-other-'));
    try { const w=await loadVault(other,{initialize:true}); assert.throws(()=>w.decrypt(b)); }
    finally { await rm(other,{recursive:true,force:true}); }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('vault fails closed for a missing key, public permissions and symlinks',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'mcs-private-'));
  try {
    await assert.rejects(loadVault(dir));
    await loadVault(dir,{initialize:true});
    await chmod(join(dir,'vault.key'),0o644); await assert.rejects(loadVault(dir));
    await chmod(join(dir,'vault.key'),0o600);
    await chmod(dir,0o755); await assert.rejects(loadVault(dir));
    await chmod(dir,0o700);
    await symlink(dir,dir+'-link'); await assert.rejects(loadVault(dir+'-link'));
  } finally { await rm(dir+'-link',{force:true}); await rm(dir,{recursive:true,force:true}); }
});
