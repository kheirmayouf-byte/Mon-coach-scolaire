import {createServer} from 'node:http';
import {createRelayHandler, RELAY_PORT} from '../desktop/browser-relay.mjs';

export function createServerHandler({coach, verify, client, owner}) {
  if (!owner || !['user','family','binding'].every(k=>typeof owner[k]==='string' && owner[k].length>0))
    throw Error('Configure le parent, la famille et le profil ChatGPT du serveur.');
  const pinned = Object.freeze({...owner});
  const handler = createRelayHandler({
    coach:{...coach, status:async()=>({...await coach.status(), binding:(await client.getSession()).profileId || ''})},
    verify:async(ticket, request)=>{
      const parent = await verify(ticket,request);
      if (parent.user!==pinned.user || parent.family!==pinned.family) throw Error('Compte parent non autorisé.');
      return parent;
    },
    pairs:{get:async()=>pinned},
    models:()=>client.listModels(),
    errors:()=> 'Le relais est indisponible. Vérifie sa connexion ChatGPT depuis l’administration du serveur.',
  });
  return (req,res)=>{
    // Pairing, login, logout and vault management are never exposed over HTTP.
    if (!/^\/v1\/(status|models|test|ask)$/.test(req.url || '')) {
      res.writeHead(404,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({ok:false,error:'Action non disponible sur le serveur.'}));
      return;
    }
    return handler(req,res);
  };
}

export async function startServer(options) {
  const server = createServer(createServerHandler(options));
  server.requestTimeout=300000; server.headersTimeout=10000; server.maxHeadersCount=30;
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(RELAY_PORT,'127.0.0.1',resolve);
  });
  return server;
}
