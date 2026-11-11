import {app, BrowserWindow, ipcMain, protocol, net, safeStorage, shell, session} from 'electron';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createChatGPT} from './vendor/siwc/src/index.ts';
import {credentialEncryption} from './encryption.mjs';
import {createCoach} from './coach.mjs';
import publicConfig from '../src/public-config.js';

protocol.registerSchemesAsPrivileged([{scheme:'mcs', privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
const base = 'mcs://app/index.html';
const assets = new Set(['index.html','app.js','style.css','pdf.worker.min.mjs']);
let window, chatgpt;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {window?.show();window?.focus();});
  app.whenReady().then(async () => {
    protocol.handle('mcs', request => {
      const url = new URL(request.url), file = url.pathname.slice(1);
      if (url.host !== 'app' || !assets.has(file) || request.method !== 'GET') return new Response('Not found',{status:404});
      return net.fetch(pathToFileURL(join(app.getAppPath(),'web',file)).href);
    });
    chatgpt = createChatGPT({appName:'Mon Coach Scolaire', appId:'mon-coach-scolaire', redirectPort:0, sendHostId:true,
      storageDir:join(app.getPath('userData'),'chatgpt'), credentialEncryption:credentialEncryption(safeStorage),
      openBrowser:async value => {const url=new URL(value);if(url.origin!=='https://auth.openai.com')throw Error('Destination refusée.');await shell.openExternal(url.href);},
    });
    const coach = createCoach(chatgpt);
    const allowed = event => event.sender === window?.webContents && event.senderFrame === event.sender.mainFrame && event.senderFrame.url === base;
    const errors = error => {
      // Do not forward upstream error bodies, request objects or submitted data.
      const code = typeof error?.code === 'string' ? error.code : '';
      if (/limit|quota|rate/.test(code)) return 'La limite de ton abonnement est atteinte. Consulte Gérer mon utilisation ; aucun appel payant ne prend le relais.';
      if (/sharing/.test(code)) return 'Autorise l’utilisation de ton abonnement lors de la connexion ChatGPT.';
      if (/sign_in|reauth|token|account|identity/.test(code)) return 'Reconnecte ton compte ChatGPT et vérifie l’autorisation d’utiliser ton abonnement.';
      if (code) return 'ChatGPT est indisponible ('+code.replace(/[^a-z0-9_]/gi,'').slice(0,80)+'). Réessaie ou consulte ton utilisation.';
      return error instanceof Error && !error.stack?.includes('vendor/siwc') ? error.message.slice(0,300) : 'Connexion indisponible. Réessaie.';
    };
    function handle(name, fn) {ipcMain.handle('mcs:'+name,async(event,...args)=>{
      if(!allowed(event))throw Error('Fenêtre non autorisée.');
      try {return {ok:true,data:await fn(...args)};}catch(error){return {ok:false,error:errors(error)};}
    });}
    handle('status',()=>coach.status());
    handle('connect',async()=>{await chatgpt.signIn({reconsent:true});return coach.status();});
    handle('cancel',()=>chatgpt.cancelSignIn());
    handle('disconnect',async()=>{await chatgpt.disconnect();return coach.status();});
    handle('models',()=>chatgpt.listModels());
    handle('test',model=>coach.test(typeof model==='string'?model:''));
    handle('ask',body=>{if(JSON.stringify(body).length>150000)throw Error('Réduis la taille du support.');return coach.request(body);});
    handle('usage',()=>shell.openExternal('https://chatgpt.com/settings/usage'));
    // The local origin is not added to the remote connector's CORS allowlist.
    // Relay only its fixed HTTPS endpoint, with the parent's current user token.
    handle('ed',async(body,token)=>{
      if(typeof token!=='string'||token.length>10000||!body||JSON.stringify(body).length>20000)throw Error('Session parent invalide.');
      const response=await fetch('https://prpjvpbfdclaihjyllmm.supabase.co/functions/v1/ecoledirecte',{method:'POST',headers:{'Content-Type':'application/json',apikey:publicConfig.key,Authorization:'Bearer '+token,Origin:'https://kheirmayouf-byte.github.io'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(90000)});
      const result=await response.json();
      if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Import ÉcoleDirecte indisponible.');
      return result;
    });
    window = new BrowserWindow({width:1280,height:900,minWidth:760,minHeight:600,title:'Mon Coach Scolaire',webPreferences:{preload:join(app.getAppPath(),'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:false,webSecurity:true}});
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.webContents.on('will-navigate',event=>event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
    window.webContents.session.setPermissionCheckHandler(()=>false);
    session.defaultSession.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'Enregistrer le document'});});
    await window.loadURL(base);
  }).catch(()=>{console.error('Démarrage impossible. Réinstalle la version ordinateur.');app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>chatgpt?.cancelSignIn());
}
