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
 async request(path,payload,gtk=true,bootstrap=false,binary=false){
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
  if(binary){
   if(Number(response.headers.get('content-length')||0)>10485760)throw new EDProblem('Pièce jointe trop volumineuse (10 Mo maximum).');
   const bytes=new Uint8Array(await response.arrayBuffer());
   if(bytes.length<1||bytes.length>10485760)throw new EDProblem('Pièce jointe vide ou trop volumineuse.');
   let mime=response.headers.get('content-type')?.split(';')[0]||'';
   if(bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46)mime='application/pdf';
   else if(bytes[0]===0xff&&bytes[1]===0xd8)mime='image/jpeg';
   else if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e)mime='image/png';
   if(!['application/pdf','image/jpeg','image/png','image/webp','text/plain'].includes(mime))throw new EDProblem('Cette pièce jointe doit être convertie en PDF ou en image.');
   let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.subarray(i,i+8192));
   return {base64:btoa(encoded),mime,bytes:bytes.length};
  }
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
 async homework(studentKey,from,to,{includeLessons=false}={}){
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
  const dates=includeLessons?Array.from({length:Math.round((Date.parse(to)-Date.parse(from))/86400000)+1},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10)):Object.keys(overview.data).filter(d=>validDate(d)&&d>=from&&d<=to).sort();
  const rows=[],course_documents=[],warnings=[];this.state.attachments=[];
  const references=(documents,scope)=>{
   if(!Array.isArray(documents))return [];
   if(documents.length>30)throw new EDProblem('Plus de 30 documents dans un cours : réduis la période ou consulte ÉcoleDirecte.');
   const refs=[];
   for(const d of documents){
    const fileId=d.id??d.fichierId,name=String(d.libelle||d.nom||d.nomFichier||'Document joint').slice(0,150);
    if((typeof fileId!=='number'&&typeof fileId!=='string')||!/^[a-zA-Z0-9_-]{1,100}$/.test(String(fileId))){warnings.push('Document sans identifiant téléchargeable : '+name);continue;}
    const key=`${student.id}:${scope}:${fileId}`;
    if(!this.state.attachments.some(ref=>ref.key===key))this.state.attachments.push({key,name,student:student.key,fileId:String(fileId)});
    refs.push({key,name,student:student.key});
   }return refs;
  };
  for(const due of dates){
   const items=overview.data[due]||[];
   if(!Array.isArray(items))throw new EDProblem('Liste des devoirs non reconnue.');
   if(!includeLessons&&!items.length)continue;
   const detail=await this.request(`Eleves/${student.id}/cahierdetexte/${due}.awp?verbe=get`,{},false);checkReply(detail);
   if(!Array.isArray(detail.data?.matieres))throw new EDProblem('Détail du cahier de texte non reconnu. Aucun import effectué.');
   if(includeLessons)for(const subject of detail.data.matieres){
    const docs=subject.contenuDeSeance?.documents||[];
    const matching=items.find(item=>(subject.aFaire?.idDevoir??subject.id)===item.idDevoir);
    const label=String(subject.matiere||subject.nomMatiere||matching?.matiere||'Cours').slice(0,80);
    const scope='course:'+due+':'+String(subject.id??subject.codeMatiere??encodeURIComponent(label)).slice(0,80);
    for(const ref of references(docs,scope))course_documents.push({...ref,subject:label,date:due});
   }
   for(const item of items){
    if(!Number.isSafeInteger(item.idDevoir)||!item.matiere)throw new EDProblem('Un devoir n’a pas d’identifiant stable. Aucun import effectué.');
    const subject=detail.data.matieres.find(m=>(m.aFaire?.idDevoir??m.id)===item.idDevoir);
    const work=subject?.aFaire;
    const attachment_refs=references(work?.documents,item.idDevoir);
    const documents=(work?.documents||[]).map(d=>String(d.libelle||d.nom||d.nomFichier||'Document joint').slice(0,150));
    rows.push({student:student.key,studentId:student.id,remoteId:item.idDevoir,subject:String(item.matiere),given:work?.donneLe||item.donneLe,due,html:work?.contenu?decode64(work.contenu):'',attachment_refs,is_assessment:flag(item.interrogation)||flag(subject?.interrogation),documents,hasDocuments:flag(item.documentsAFaire)||documents.length>0});
   }
   if(rows.length>200)throw new EDProblem('Trop de devoirs : réduis la période.');
  }
  if(this.state.attachments.length>80)throw new EDProblem('Trop de pièces jointes : réduis la période à importer.');
  return {stage:'ready',students:publicStudents(this.state.students),rows,course_documents,warnings,coverage:{from,to,daysRead:dates.length,includesLessons:includeLessons}};
 }
 async timetable(studentKey,from,to){
  if(this.state.stage!=='ready')throw new EDProblem('Connecte-toi à ÉcoleDirecte.');
  const student=this.state.students.find(s=>s.key===studentKey);if(!student)throw new EDProblem('Profil élève inaccessible.');
  if(!validDate(from)||!validDate(to)||to<from||(Date.parse(to)-Date.parse(from))/86400000>13)throw new EDProblem('Choisis une période de 14 jours maximum.');
  if(student.account!==this.state.account){
   if(!student.idLogin&&this.state.account!==undefined)throw new EDProblem('Ce changement de compte nécessite une connexion séparée.');
   if(student.idLogin){const switched=await this.request('renewtoken.awp?verbe=post',{idUser:student.idLogin,uuid:''},false);checkReply(switched);if(switched.data?.id!==undefined&&switched.data.id!==student.account)throw new EDProblem('Le profil retourné ne correspond pas au compte demandé.');}
   this.state.account=student.account;
  }
  const reply=await this.request('E/'+student.id+'/emploidutemps.awp?verbe=get',{dateDebut:from,dateFin:to,avecTrous:false},false);checkReply(reply);
  if(!Array.isArray(reply.data))throw new EDProblem('Format de l’emploi du temps non reconnu.');
  if(reply.data.length>300)throw new EDProblem('Trop de cours : réduis la période.');
  const courses=reply.data.map((course,i)=>{
   const start=String(course.start_date||'').match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2})/),end=String(course.end_date||'').match(/^([0-9]{4}-[0-9]{2}-[0-9]{2})[ T]([0-9]{2}:[0-9]{2})/);
   if(!start||!end||!validDate(start[1])||start[1]<from||start[1]>to||end[1]!==start[1]||end[2]<=start[2]||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(start[2])||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(end[2]))throw new EDProblem('Un horaire de cours est invalide. Aucun nouvel emploi du temps enregistré.');
   return {id:student.key+':'+String(course.id??i).slice(0,80)+':'+start[1],date:start[1],start:start[2],end:end[2],subject:String(course.matiere||course.text||'Cours').slice(0,100),room:String(course.salle||'').slice(0,100),cancelled:flag(course.isAnnule)||flag(course.annule)};
  });
  return {stage:'ready',students:publicStudents(this.state.students),courses};
 }

 async download(key){
  if(this.state.stage!=='ready')throw new EDProblem('Connecte-toi à ÉcoleDirecte.');
  const ref=this.state.attachments?.find(a=>a.key===key),student=this.state.students?.find(s=>s.key===ref?.student);
  if(!ref||!student)throw new EDProblem('Relis les devoirs de cet élève pour récupérer cette pièce jointe.');
  if(this.state.account!==student.account)throw new EDProblem('Relis les devoirs de cet élève avant de télécharger ses documents.');
  const file=await this.request('telechargement.awp?verbe=get&leTypeDeFichier=FICHIER_CDT&fichierId='+encodeURIComponent(ref.fileId),{forceDownload:0},false,false,true);
  return {stage:'ready',students:publicStudents(this.state.students),file:{...file,name:ref.name,key}};
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
