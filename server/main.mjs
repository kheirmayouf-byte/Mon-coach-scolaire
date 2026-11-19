import {join, resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createChatGPT} from '../desktop/vendor/siwc/src/index.ts';
import {ConnectionStore} from '../desktop/vendor/siwc/src/storage.ts';
import {createCoach} from '../desktop/coach.mjs';
import {verifyParent} from '../desktop/browser-relay.mjs';
import publicConfig from '../src/public-config.js';
import {loadVault} from './vault.mjs';
import {startServer} from './relay.mjs';

process.umask(0o077);
async function main() {
try {
  if (process.platform!=='linux') throw Error('Ce service est destiné au VPS Linux.');
  const command=process.argv[2], directory=resolve(process.env.MCS_STATE_DIR || '/var/lib/mcs-relay');
  if (!['init','serve'].includes(command)) throw Error('Utilisation : node server/build/relay.cjs init|serve');
  const encryption=await loadVault(directory,{initialize:command==='init'});
  const storageDir=join(directory,'chatgpt'), store=new ConnectionStore(storageDir,encryption);
  // Create/preserve this VM identity before any protected credential import.
  await store.withLock(()=>store.getHostId());
  if (command==='init') {
    console.log('Coffre et identité du VPS prêts. Aucune connexion ChatGPT importée.');
  } else {
    const owner=JSON.parse(await readFile(join(directory,'owner.json'),'utf8'));
    const client=createChatGPT({appName:'Mon Coach Scolaire',appId:'mon-coach-scolaire',sendHostId:true,
      storageDir,credentialEncryption:encryption,
      openBrowser:async()=>{throw Error('La connexion OAuth doit être effectuée localement.');}});
    const session=await client.getSession();
    if (session.status!=='connected' || session.sharing!==true || session.profileId!==owner.binding)
      throw Error('Connexion ChatGPT autorisée absente ou profil différent.');
    const server=await startServer({client,coach:createCoach(client),owner,
      verify:(ticket,request)=>verifyParent(ticket,request,publicConfig)});
    console.log('Relais privé démarré sur 127.0.0.1:4174.');
    for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>server.close());
  }
} catch {
  // SDK/upstream errors can contain credential material: never log them.
  console.error('Relais non démarré. Vérifie la commande, le coffre privé et la connexion ChatGPT autorisée.');
  process.exitCode=1;
}
}
void main();
