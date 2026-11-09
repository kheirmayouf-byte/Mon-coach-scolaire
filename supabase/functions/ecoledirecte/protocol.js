// Read-only adapter for an undocumented protocol. No credentials or API responses are logged.
export const API = 'https://api.ecoledirecte.com/v3/';
export const VERSION = '4.101.4';
const flag=value=>value===true||value===1||value==='1'||value==='true';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
export class EDProblem extends Error {
 constructor(message,code='ED_REQUEST',diagnostic){super(message);this.code=code;this.diagnostic=diagnostic;}
}
export function decode64(value) {
 try { return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(String(value||'')),c=>c.charCodeAt(0))); }
 catch { throw new EDProblem('Le format des consignes a changé. Aucun devoir importé.'); }
}
export function checkReply(reply) {
 if(reply?.code===200)return;
 const messages={505:'Identifiant ou mot de passe ÉcoleDirecte refusé.',516:'Compte bloqué : consulte ÉcoleDirecte directement.',535:'Compte bloqué : consulte ÉcoleDirecte directement.',517:'ÉcoleDirecte est en maintenance.',520:'Une charte doit être acceptée sur ÉcoleDirecte.',521:'Session ÉcoleDirecte expirée. Reconnecte-toi.'};
 throw new EDProblem(messages[reply?.code]||'ÉcoleDirecte a refusé la demande. Réessaie plus tard depuis son site.');
}
export function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export class EDClient {
 constructor(state={},fetcher=fetch){this.state={cookies:{},...state};this.fetcher=fetcher;this.deadline=Date.now()+45000;}
 async request(path,payload,gtk=true,bootstrap=false){
  // Callers supply only hard-coded route templates; redirects never receive credentials.
  const headers={'User-Agent':UA,Accept:'application/json','Origin':'https://www.ecoledirecte.com','Referer':'https://www.ecoledirecte.com/'};
  const s=this.state;
  if(Object.keys(s.cookies).length)headers.Cookie=Object.entries(s.cookies).map(([k,v])=>`${k}=${v}`).join('; ');
  if(gtk&&(s.gtk||s.cookies.GTK))headers['X-GTK']=s.gtk||s.cookies.GTK;
  if(s.token)headers['X-Token']=s.token;
  if(s.twofa)headers['2FA-Token']=s.twofa;
  if(payload!==undefined)headers['Content-Type']='application/x-www-form-urlencoded';
  let response;
  try{response=await this.fetcher(API+path+(path.includes('?')?'&':'?')+'v='+VERSION,{method:payload===undefined?'GET':'POST',headers,body:payload===undefined?undefined:new URLSearchParams({data:JSON.stringify(payload)}).toString(),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(12000,this.deadline-Date.now())))});}
  catch{throw new EDProblem('ÉcoleDirecte est injoignable. Aucune nouvelle tentative automatique.');}
  if(!response.ok)throw new EDProblem('ÉcoleDirecte est indisponible ou bloque cette connexion.');
  const cookies=response.headers.getSetCookie?.()||[];
  for(const line of cookies){const pair=line.split(';')[0],i=pair.indexOf('=');if(i>0)s.cookies[pair.slice(0,i)]=pair.slice(i+1);}
  if(response.headers.get('X-GTK'))s.gtk=response.headers.get('X-GTK');
  if(response.headers.get('X-Token'))s.token=response.headers.get('X-Token');
  if(response.headers.get('2FA-Token'))s.twofa=response.headers.get('2FA-Token');
  const text=await response.text();
  if(text.length>2000000)throw new EDProblem('Réponse ÉcoleDirecte trop volumineuse.');
  let reply;try{reply=JSON.parse(text);}catch{if(bootstrap&&!text.trim())return {};throw new EDProblem('Réponse ÉcoleDirecte non reconnue.');}
  if(reply.token&&!response.headers.get('X-Token')&&!bootstrap)s.token=reply.token;
  if(bootstrap&&reply.token)s.gtk=reply.token;
  return reply;
 }
 async bootstrap(){delete this.state.gtk;await this.request('login.awp?gtk=1',undefined,true,true);}
 async login(username,password){
  this.state.pending={identifiant:username,motdepasse:password,isReLogin:false,uuid:'',fa:[]};this.state.rounds=0;
  return this.replay();
 }
 async replay(){
  await this.bootstrap();const reply=await this.request('login.awp',this.state.pending);
  if(reply.code===250){
   if(++this.state.rounds>3)throw new EDProblem('Vérifications successives : reconnecte-toi sur le site ÉcoleDirecte.');
   if(reply.data?.totp===true){this.state.stage='totp';return {stage:'totp'};}
   const question=await this.request('connexion/doubleauth.awp?verbe=get',{},false);checkReply(question);
   if(!Array.isArray(question.data?.propositions)||!question.data.propositions.length)throw new EDProblem('Question de sécurité non reconnue.');
   this.state.stage='question';this.state.choices=question.data.propositions;
   return {stage:'question',question:decode64(question.data.question),choices:this.state.choices.map(decode64)};
  }
  checkReply(reply);
  this.state.students=extractStudents(reply.data);
  this.state.account=this.state.students.find(s=>s.current)?.account;
  if(!this.state.token)throw new EDProblem('ÉcoleDirecte n’a pas fourni de session utilisable. Reconnecte-toi.','ED_NO_TOKEN');
  if(!this.state.students.length)throw new EDProblem('Les profils élèves n’ont pas pu être lus. Référence : ED_NO_PROFILES.','ED_NO_PROFILES',loginShape(reply.data));
  delete this.state.pending;delete this.state.choices;delete this.state.twofa;
  this.state.stage='ready';return {stage:'ready',students:publicStudents(this.state.students)};
 }
 async answer(answer){
  if(!this.state.pending)throw new EDProblem('La vérification a expiré. Reconnecte-toi.');
  if(this.state.stage==='totp'){
   if(typeof answer!=='string'||!/^\d{6}$/.test(answer))throw new EDProblem('Saisis le code à six chiffres de ton application d’authentification.');
   this.state.pending.fa=[{cv:answer,cn:''}];
  }else if(this.state.stage==='question'){
   if(!Number.isInteger(answer)||!this.state.choices?.[answer])throw new EDProblem('Choisis ta réponse à la question de sécurité.');
   const reply=await this.request('connexion/doubleauth.awp?verbe=post',{choix:this.state.choices[answer]},false);checkReply(reply);
   if(!reply.data?.cn||!reply.data?.cv)throw new EDProblem('La réponse a été refusée. Reconnecte-toi sur ÉcoleDirecte.');
   const {cn,cv}=reply.data;this.state.pending={...this.state.pending,cn,cv,fa:[...this.state.pending.fa,{cn,cv,uniq:false}]};
  }else throw new EDProblem('Aucune vérification en attente.');
  return this.replay();
 }
 async homework(studentKey,from,to){
  if(this.state.stage!=='ready')throw new EDProblem('Connecte-toi à ÉcoleDirecte.');
  const student=this.state.students.find(s=>s.key===studentKey);
  if(!student)throw new EDProblem('Profil élève inaccessible.');
  if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>13)throw new EDProblem('Choisis une période de 14 jours maximum.');
  if(student.account!==this.state.account){
   if(!student.idLogin&&this.state.account!==undefined)throw new EDProblem('Ce changement de compte nécessite une connexion séparée.');
   if(student.idLogin){const switched=await this.request('renewtoken.awp?verbe=post',{idUser:student.idLogin,uuid:''},false);checkReply(switched);if(switched.data?.id!==undefined&&switched.data.id!==student.account)throw new EDProblem('Le profil retourné ne correspond pas au compte demandé.');}
   this.state.account=student.account;
  }
  const overview=await this.request(`Eleves/${student.id}/cahierdetexte.awp?verbe=get`,{},false);checkReply(overview);
  if(!overview.data||typeof overview.data!=='object'||Array.isArray(overview.data))throw new EDProblem('Format du cahier de texte non reconnu.');
  const dates=Object.keys(overview.data).filter(d=>validDate(d)&&d>=from&&d<=to).sort();
  const rows=[];
  for(const due of dates){
   if(!Array.isArray(overview.data[due]))throw new EDProblem('Liste des devoirs non reconnue.');
   if(!overview.data[due].length)continue;
   const detail=await this.request(`Eleves/${student.id}/cahierdetexte/${due}.awp?verbe=get`,{},false);checkReply(detail);
   if(!Array.isArray(detail.data?.matieres))throw new EDProblem('Détail du cahier de texte non reconnu. Aucun import effectué.');
   for(const item of overview.data[due]){
    if(!Number.isSafeInteger(item.idDevoir)||!item.matiere)throw new EDProblem('Un devoir n’a pas d’identifiant stable. Aucun import effectué.');
    const subject=detail.data.matieres.find(m=>(m.aFaire?.idDevoir??m.id)===item.idDevoir);
    const work=subject?.aFaire;
    const documents=(work?.documents||[]).map(d=>String(d.libelle||d.nom||d.nomFichier||'Document joint').slice(0,150));
    rows.push({student:student.key,studentId:student.id,remoteId:item.idDevoir,subject:String(item.matiere),given:work?.donneLe||item.donneLe,due,html:work?.contenu?decode64(work.contenu):'',is_assessment:flag(item.interrogation)||flag(subject?.interrogation),documents,hasDocuments:flag(item.documentsAFaire)||documents.length>0});
   }
   if(rows.length>200)throw new EDProblem('Trop de devoirs : réduis la période.');
  }
  return {stage:'ready',students:publicStudents(this.state.students),rows};
 }
}
// Numeric parent account codes are also documented by an independent adapter:
// https://ed.natchen.fr/doc (account types). Only authenticated linked pupils are accepted.
function accountType(value){return typeof value==='string'?value.trim().toUpperCase():String(value??'');}
function numericId(value){
 if(typeof value==='string'&&!/^[1-9]\d{0,15}$/.test(value))return undefined;
 if(typeof value!=='string'&&typeof value!=='number')return undefined;
 const id=Number(value);return Number.isSafeInteger(id)&&id>0?id:undefined;
}
export function loginShape(data){
 const accounts=Array.isArray(data?.accounts)?data.accounts:[];
 // A fixed list of counts/booleans only: never names, ids, credentials, cookies or tokens.
 return {accountsArray:Array.isArray(data?.accounts),accountCount:accounts.length,accounts:accounts.slice(0,20).map(a=>{
  const type=accountType(a?.typeCompte);
  return {type:['E','F','1','2','P','A','T'].includes(type)?type:'other',validAccountId:numericId(a?.id)!==undefined,pupilsArray:Array.isArray(a?.profile?.eleves),pupilCount:Array.isArray(a?.profile?.eleves)?a.profile.eleves.length:0};
 })};
}
export function extractStudents(data){
 const result=[];
 const accounts=Array.isArray(data?.accounts)?data.accounts:[];
 const current=numericId(data?.id??accounts.find(a=>a?.main)?.id??accounts[0]?.id);
 for(const a of accounts){
  const account=numericId(a?.id),type=accountType(a?.typeCompte);
  if(account===undefined)continue;
  const students=type==='E'?[a]:['F','1','2'].includes(type)&&Array.isArray(a.profile?.eleves)?a.profile.eleves:[];
  for(const s of students){const id=numericId(s?.id);if(id===undefined)continue;const key=`${account}:${id}`;if(result.some(r=>r.key===key))continue;result.push({key,id,account,idLogin:numericId(a.idLogin),current:account===current,name:String(s.prenom||s.nom||'Élève').slice(0,100),className:String(s.classe?.libelle||'').slice(0,100)});}
 }
 return result;
}
export function publicStudents(students){return students.map(({key,name,className})=>({key,name,className}));}
