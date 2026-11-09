import {createClient} from '@supabase/supabase-js';
import {dateKey,validateTask,parseImport,plan,nextReview} from './core.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LOCAL='mcs-local-v2', CONFIG='mcs-config-v2';
let data={children:[{id:'child-1',name:'Enfant 1'},{id:'child-2',name:'Enfant 2'}],tasks:[],cards:[]};
let tab='dashboard',profile='parents',client=null,user=null,family=null,busy=false,cloud=false,sessionReady=false,generation=0,refreshPromise=null;
let config={};
function notice(s){$('notice').textContent=s;}
function readLocal(){
 try{
  const saved=JSON.parse(localStorage.getItem(LOCAL)||'null');
  if(saved && Array.isArray(saved.children)&&Array.isArray(saved.tasks)&&Array.isArray(saved.cards)) data=saved;
  else {
   const old=JSON.parse(localStorage.getItem('mon-coach-scolaire-v1')||'null');
   if(old?.tasks?.length){
    const ids=[...new Set(old.tasks.map(t=>t.child))];
    data.children=ids.map((id,i)=>({id,name:`Enfant ${i+1}`}));
    data.tasks=old.tasks.map(t=>({...t,id:crypto.randomUUID(),minutes:20}));
   }
  }
 }catch{notice('Stockage local inaccessible. Les données restent disponibles pendant cette ouverture.');}
}
function saveLocal(){try{localStorage.setItem(LOCAL,JSON.stringify(data));}catch{notice('Enregistrement local impossible. Exporte une sauvegarde avant de fermer.');}}
function childName(id){return data.children.find(c=>c.id===id)?.name||'Enfant';}
function childrenOptions(){return data.children.filter(c=>profile==='parents'||c.id===profile).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');}
const visible=(collection)=>data[collection].filter(t=>profile==='parents'||t.child===profile);
function render(){
 $('profile').innerHTML='<option value="parents">Parents</option>'+data.children.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
 if(profile!=='parents'&&!data.children.some(c=>c.id===profile))profile='parents';
 $('profile').value=profile;
 $('connection').innerHTML=cloud?'<span class="pill success">Compte parent connecté</span><p class="small muted">Devoirs partagés · actualisation toutes les 30 secondes</p>':'<span class="pill">Mode local</span><p class="small muted">Données sur cet appareil uniquement</p>';
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});
 $('content').innerHTML=({dashboard,tasks:tasksView,planning,revision,import:importView,settings}[tab])();
 document.querySelectorAll('button').forEach(b=>b.disabled=busy);
}
function taskHtml(t){return `<article class="task ${t.done?'done':''}"><input type="checkbox" aria-label="Terminer ${esc(t.subject)}" data-check="${esc(t.id)}" ${t.done?'checked':''} ${busy?'disabled':''}><div><strong>${esc(t.subject)}</strong> <span class="pill">${esc(childName(t.child))}</span><p>${esc(t.description)}</p><small class="${!t.done&&t.due<dateKey()?'danger':'muted'}">Pour le ${esc(t.due)} · ${t.minutes||20} min · donné le ${esc(t.given)}</small></div><button class="secondary" data-delete="${esc(t.id)}" ${busy?'disabled':''}>Supprimer</button></article>`;}
function dashboard(){const tasks=visible('tasks'),todo=tasks.filter(t=>!t.done),done=tasks.length-todo.length;return `<section class="panel"><p class="eyebrow muted">UN PAS À LA FOIS</p><h2>${profile==='parents'?'La semaine en famille':`Bonjour ${esc(childName(profile))} !`}</h2><div class="grid"><div><span class="stat">${todo.length}</span><p>devoirs à faire</p></div><div><span class="stat">${todo.filter(t=>t.due<dateKey()).length}</span><p>échéances dépassées</p></div><div><span class="stat">${done}</span><p>devoirs terminés</p></div></div><label for="progress">Ta progression</label><progress id="progress" max="${tasks.length||1}" value="${done}"></progress></section><section class="panel"><h2>Le prochain petit pas</h2>${todo.length?todo.sort((a,b)=>a.due.localeCompare(b.due)).slice(0,3).map(taskHtml).join(''):'<p class="muted">Tout est à jour. Tu peux ajouter un devoir ou revoir une fiche.</p>'}</section>`;}
function tasksView(){return `<section class="panel"><h2>Mes devoirs</h2>${visible('tasks').slice().sort((a,b)=>a.due.localeCompare(b.due)).map(taskHtml).join('')||'<p>Aucun devoir enregistré.</p>'}</section><section class="panel"><h2>Ajouter un devoir</h2><form id="taskForm"><label for="child">Enfant</label><select id="child" name="child" required>${childrenOptions()}</select><label for="subject">Matière</label><input id="subject" name="subject" required maxlength="80"><label for="description">Consigne</label><textarea id="description" name="description" required maxlength="4000"></textarea><div class="grid"><div><label for="given">Donné le</label><input id="given" name="given" type="date" required value="${dateKey()}"></div><div><label for="due">Pour le</label><input id="due" name="due" type="date" required value="${dateKey()}"></div><div><label for="minutes">Durée estimée (minutes)</label><input id="minutes" name="minutes" type="number" min="5" max="240" value="20" required></div></div><p><button type="submit">Ajouter le devoir</button></p></form></section>`;}
function planning(){const p=plan(visible('tasks'),data.capacity||40);return `<section class="panel"><h2>Un planning à ta mesure</h2><p class="muted">Proposition sur 14 jours : échéances les plus proches d’abord, séances de 25 minutes maximum, capacité de ${data.capacity||40} min par enfant et par jour. Prévois une pause de 5 min entre deux séances. À ajuster avec un parent selon tes disponibilités.</p>${p.unscheduled.length?`<p class="danger">À revoir avec un parent : ${p.unscheduled.map(s=>`${esc(s.task.subject)} (${s.minutes} min non placées)`).join(', ')}. Une échéance dépassée ne peut plus être planifiée.</p>`:''}${p.slots.map(s=>`<article class="task"><div><span class="pill">${s.date}</span><h3>${esc(s.task.subject)} · ${s.minutes} min</h3><p>${esc(childName(s.task.child))} · ${esc(s.task.description)}</p></div></article>`).join('')||'<p>Aucune séance à proposer.</p>'}</section>`;}
function revision(){const cards=visible('cards').filter(c=>c.next_review<=dateKey());return `<section class="panel"><h2>Révisions espacées</h2><p class="muted">Rappelle-toi la réponse avant de la révéler. Les fiches maîtrisées reviennent dans 1, 3, 7, 14 puis 30 jours.</p>${cards.map(c=>`<article class="panel"><span class="pill">${esc(childName(c.child))} · ${esc(c.subject)}</span><h3>${esc(c.question)}</h3><details><summary>Voir la réponse</summary><p class="answer">${esc(c.answer)}</p><div class="actions"><button data-review="${esc(c.id)}" data-known="no">À revoir demain</button><button data-review="${esc(c.id)}" data-known="yes">Je savais</button></div></details></article>`).join('')||'<p>Aucune fiche à revoir aujourd’hui.</p>'}</section><section class="panel"><h2>Créer une fiche</h2><form id="cardForm"><label for="card-child">Enfant</label><select id="card-child" name="child" required>${childrenOptions()}</select><label for="card-subject">Matière</label><input id="card-subject" name="subject" required maxlength="80"><label for="question">Question</label><textarea id="question" name="question" required maxlength="1000"></textarea><label for="answer">Réponse</label><textarea id="answer" name="answer" required maxlength="4000"></textarea><p><button type="submit">Créer la fiche</button></p></form></section>`;}
function importView(){return `<section class="panel"><h2>Importer des devoirs</h2><p>Une ligne par devoir : Enfant | Matière | Date donnée | Date limite | Consigne</p><p class="muted">Utilise le nom affiché dans ton espace. Les dates suivent le format AAAA-MM-JJ. L’import est vérifié entièrement avant enregistrement.</p><form id="importForm"><label for="importText">Devoirs à importer</label><textarea id="importText" name="text" required maxlength="50000"></textarea><p><button type="submit">Vérifier et importer</button></p></form></section>`;}
function settings(){if(profile!=='parents')return '<section class="panel"><h2>Espace parent</h2><p>Sélectionne Parents pour gérer la connexion et les profils. Ce sélecteur n’est pas une protection par mot de passe.</p></section>';
return `<section class="panel"><h2>Parents & confidentialité</h2><p>Les prénoms, devoirs et fiches sont saisis ici, jamais dans le code public. Sur un appareil partagé, déconnecte-toi après utilisation. Le mode local reste accessible aux autres utilisateurs de cet appareil.</p>${cloud?`<p class="success">Connecté au foyer autorisé.</p><div class="actions"><button id="sync">Actualiser maintenant</button><button id="logout" class="secondary">Se déconnecter</button></div>`:`<p>Le mode local fonctionne sans compte. La synchronisation nécessite une base sécurisée et un compte parent autorisé.</p><form id="configForm"><label for="url">URL du projet Supabase</label><input id="url" name="url" type="url" required placeholder="https://projet.supabase.co" value="${esc(config.url||'')}"><label for="key">Clé publique publishable ou anon</label><input id="key" name="key" required autocomplete="off" value="${esc(config.key||'')}"><p class="small muted">Aucune clé secrète ou service_role. La configuration est enregistrée sur cet appareil.</p><button type="submit">Configurer la connexion</button></form>${client?`<form id="loginForm"><label for="email">Email du parent</label><input id="email" name="email" type="email" autocomplete="username" required><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required><p><button type="submit">Se connecter</button></p></form><p class="small muted">Les comptes sont créés et rattachés au foyer par l’administrateur Supabase. Pas d’inscription publique.</p>`:''}`}</section>
<section class="panel"><h2>Profils des enfants</h2><form id="childrenForm">${data.children.map((c,i)=>`<label for="name-${i}">Prénom de l’enfant ${i+1}</label><input id="name-${i}" name="${esc(c.id)}" value="${esc(c.name)}" maxlength="50" required>`).join('')}<p><button type="submit">Enregistrer les prénoms</button></p></form>${!data.children.length?'<p>Les profils doivent être provisionnés dans Supabase avant utilisation.</p>':''}</section>
${!cloud?`<section class="panel"><h2>Capacité de travail</h2><form id="capacityForm"><label for="capacity">Minutes par jour et par enfant (mode local)</label><input id="capacity" name="capacity" type="number" min="10" max="120" required value="${data.capacity||40}"><p><button type="submit">Ajuster le planning</button></p></form></section>`:''}
<section class="panel"><h2>Sauvegarde</h2><p>Le fichier exporté contient des données privées. Conserve-le dans un emplacement personnel.</p><button id="export">Exporter mes données</button>${cloud?'<p>Les devoirs locaux ne sont jamais envoyés automatiquement.</p><button id="migrate" class="secondary">Copier les devoirs locaux vers ce foyer</button>':''}</section>`;}
function checkConfig(c){
 const u=new URL(c.url);if(u.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(u.hostname)||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('Utilise l’URL HTTPS du projet Supabase, sans chemin.');
 if(!c.key.startsWith('sb_publishable_')){
  try{if(JSON.parse(atob(c.key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')throw Error();}catch{throw Error('Seule une clé publique publishable ou anon est acceptée.');}
 }
 return {url:u.origin,key:c.key};
}
function setupClient(c){
 config=checkConfig(c);
 client=createClient(config.url,config.key,{auth:{storage:sessionStorage,storageKey:'mcs-parent-session',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){generation++;cloud=false;family=null;user=null;readLocal();render();}
  if(event==='TOKEN_REFRESHED')user=session?.user||null;
 });
}
async function loadCloud(){
 const current=generation;
 const {data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw Error('Session expirée. Reconnecte-toi.');
 const {data:members,error}=await client.from('mcs_members').select('family_id').eq('user_id',auth.user.id);
 if(error||members?.length!==1)throw Error('Ce compte doit être autorisé dans un seul foyer. Vérifie le rattachement et les règles Supabase.');
 const fid=members[0].family_id;
 const results=await Promise.all(['mcs_children','mcs_tasks','mcs_cards'].map(table=>client.from(table).select('*').eq('family_id',fid)));
 if(results.some(r=>r.error))throw Error('Synchronisation impossible. Vérifie la migration et les permissions Supabase.');
 if(current!==generation)return;
 user=auth.user;family=fid;cloud=true;
 data={children:results[0].data.map(c=>({id:c.id,name:c.name})),tasks:results[1].data.map(t=>({...t,child:t.child_id})),cards:results[2].data.map(c=>({...c,child:c.child_id}))};
 render();
}
async function sync(){if(!cloud||busy||refreshPromise)return;refreshPromise=loadCloud();try{await refreshPromise;}catch(e){notice(e.message);}finally{refreshPromise=null;}}
async function insertRows(table,items){if(!cloud){data[table].push(...items);saveLocal();return;}
 const rows=items.map(({child,...item})=>({...item,child_id:child,family_id:family}));
 const {error}=await client.from('mcs_'+table).insert(rows);if(error)throw Error('Enregistrement refusé ou réseau indisponible. Aucune confirmation reçue : actualise avant de réessayer.');await loadCloud();
}
async function updateRow(table,item,patch){if(!cloud){Object.assign(item,patch);saveLocal();return;}
 const {data:rows,error}=await client.from('mcs_'+table).update({...patch,version:item.version+1}).eq('id',item.id).eq('version',item.version).select('id');
 if(error)throw Error('Modification refusée ou réseau indisponible. Actualise avant de réessayer.');
 if(!rows?.length){await loadCloud();throw Error('Ce contenu a changé sur un autre appareil. La version récente est affichée ; refais ton choix.');}await loadCloud();
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button,input[type=checkbox]').forEach(b=>b.disabled=true);try{if(refreshPromise)await refreshPromise;await fn();}catch(e){notice(e.message||'Action impossible.');}finally{busy=false;render();}}
$('profile').addEventListener('change',e=>{profile=e.target.value;notice('');render();});
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b&&!busy){tab=b.dataset.tab;notice('');render();}});
$('content').addEventListener('change',e=>{if(e.target.dataset.check){const t=data.tasks.find(t=>t.id===e.target.dataset.check);const done=e.target.checked;if(t)action(()=>updateRow('tasks',t,{done}));}});
$('content').addEventListener('submit',e=>{e.preventDefault();const form=e.target,f=new FormData(form);action(async()=>{
 switch(form.id){
 case 'taskForm':{const t=validateTask({id:crypto.randomUUID(),child:f.get('child'),subject:f.get('subject').trim(),description:f.get('description').trim(),given:f.get('given'),due:f.get('due'),minutes:Number(f.get('minutes')),done:false});await insertRows('tasks',[t]);notice('Devoir enregistré.');break;}
 case 'importForm':{const p=parseImport(f.get('text'),data.children,profile==='parents'?null:profile);if(p.errors.length)throw Error(p.errors.join(' '));if(!p.tasks.length)throw Error('Ajoute au moins une ligne.');await insertRows('tasks',p.tasks);tab='tasks';notice(`${p.tasks.length} devoir(s) enregistré(s).`);break;}
 case 'cardForm':await insertRows('cards',[{id:crypto.randomUUID(),child:f.get('child'),subject:f.get('subject').trim(),question:f.get('question').trim(),answer:f.get('answer').trim(),level:0,next_review:dateKey()}]);notice('Fiche créée.');break;
 case 'childrenForm':{const changes=data.children.map(c=>({...c,name:String(f.get(c.id)||'').trim()}));if(changes.some(c=>!c.name||c.name.length>50)||new Set(changes.map(c=>c.name.toLowerCase())).size!==changes.length)throw Error('Choisis des prénoms distincts de 1 à 50 caractères.');if(cloud){const {error}=await client.rpc('mcs_rename_children',{names:changes.map(c=>({id:c.id,name:c.name}))});if(error)throw Error('Modification des profils refusée.');await loadCloud();}else{data.children=changes;saveLocal();}notice('Profils enregistrés.');break;}
 case 'capacityForm':data.capacity=Number(f.get('capacity'));saveLocal();notice('Capacité ajustée.');break;
 case 'configForm':if(client)throw Error('Recharge la page avant de changer de projet.');setupClient({url:f.get('url').trim(),key:f.get('key').trim()});try{localStorage.setItem(CONFIG,JSON.stringify(config));}catch{}notice('Configuration enregistrée. Connecte-toi avec un compte parent autorisé.');break;
 case 'loginForm':{const {error}=await client.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});form.reset();if(error)throw Error('Connexion impossible. Vérifie tes identifiants et la connexion.');try{await loadCloud();notice('Connexion réussie. Les données locales restent conservées séparément.');}catch(e){await client.auth.signOut({scope:'local'});throw e;}break;}
 }
 });});
$('content').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.id==='export'){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='coach-scolaire-sauvegarde.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
 if(b.id==='sync'){sync();return;}
 if(b.id==='logout'){action(async()=>{generation++;const {error}=await client.auth.signOut({scope:'local'});if(error)throw Error('Déconnexion impossible. Ferme cet onglet pour effacer la session.');cloud=false;family=null;user=null;data={children:[{id:'child-1',name:'Enfant 1'},{id:'child-2',name:'Enfant 2'}],tasks:[],cards:[]};readLocal();notice('Déconnecté. Retour aux données locales de cet appareil.');});return;}
 if(b.dataset.delete){if(!confirm('Supprimer ce devoir ? Cette action le retire aussi des appareils synchronisés.'))return;action(async()=>{const t=data.tasks.find(t=>t.id===b.dataset.delete);if(cloud){const {data:rows,error}=await client.from('mcs_tasks').delete().eq('id',t.id).eq('version',t.version).select('id');if(error)throw Error('Suppression non confirmée. Actualise avant de réessayer.');await loadCloud();if(!rows.length)throw Error('Ce devoir a changé sur un autre appareil. Vérifie la version récente.');}else{data.tasks=data.tasks.filter(x=>x.id!==t.id);saveLocal();}notice('Devoir supprimé.');});}
 if(b.dataset.review){const c=data.cards.find(c=>c.id===b.dataset.review),known=b.dataset.known==='yes',level=known?Math.min(4,c.level+1):0;action(async()=>{await updateRow('cards',c,{level,next_review:nextReview(known?c.level:0)});notice('Prochaine révision programmée.');});}
 if(b.id==='migrate'){
  const local=JSON.parse(localStorage.getItem(LOCAL)||'null');if(!local?.tasks?.length){notice('Aucun devoir local à copier.');return;}
  const mapping=local.children.map(c=>({local:c,remote:data.children.find(r=>r.name.toLowerCase()===c.name.toLowerCase())}));
  if(mapping.some(m=>!m.remote)){notice('Donne les mêmes prénoms aux profils locaux et au foyer avant la copie. Aucune donnée n’a été envoyée.');return;}
  if(!confirm(`Copier ${local.tasks.length} devoir(s) locaux dans le foyer connecté ? Les prénoms doivent correspondre. Ne répète pas une copie déjà réussie.`))return;
  action(async()=>{await insertRows('tasks',local.tasks.map(t=>validateTask({id:t.id,child:mapping.find(m=>m.local.id===t.child).remote.id,subject:t.subject,description:t.description,given:t.given,due:t.due,minutes:t.minutes||20,done:!!t.done})));notice('Copie terminée. Les originaux locaux sont conservés.');});
 }
});
readLocal();saveLocal();render();
try{const c=JSON.parse(localStorage.getItem(CONFIG)||'null');if(c){setupClient(c);client.auth.getSession().then(async({data:s})=>{if(s.session)await action(async()=>{try{await loadCloud();}catch(e){await client.auth.signOut({scope:'local'});throw e;}});sessionReady=true;render();});}}catch{notice('Configuration invalide. Renseigne une clé publique dans Parents & connexion.');}
setInterval(()=>{if(document.visibilityState==='visible')sync();},30000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();});
