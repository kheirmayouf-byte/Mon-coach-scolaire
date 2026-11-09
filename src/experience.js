import {dateKey,plan} from './core.js';
import {daysAfter,weekMetrics,defaultPedagogy,validatePedagogy,estimateTask,competency,sourceQuestions,normalize,localCoachAnswer} from './coach.js';
import {inspectFile,extractFileText,base64File} from './materials.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const niceDate=s=>new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
const timeLabel=seconds=>`${Math.floor(seconds/60)} min ${String(Math.floor(seconds%60)).padStart(2,'0')} s`;
export function createExperience(api){
 let filter='all',selectedTask=null,modal=null,timer=null,practice=null,coachReply='',voice=null,coachBusy=false,aiReady=false,sourceBefore='unsure',timerSaving=false;
 let documentTarget=null;
 const d=()=>api.data(),me=()=>api.profile(),name=id=>d().children.find(c=>c.id===id)?.name||'Enfant';
 const children=()=>d().children.filter(c=>me()==='parents'?(filter==='all'||filter===c.id):c.id===me());
 const rows=key=>(d()[key]||[]).filter(r=>children().some(c=>c.id===r.child));
 const pedagogy=id=>({...defaultPedagogy(),...(d().profiles||[]).find(p=>p.child===id)?.settings});
 const task=id=>d().tasks.find(t=>t.id===id);
 function childOptions(placeholder=false,value=''){return (placeholder?'<option value="">Choisir l’enfant</option>':'')+children().map(c=>`<option value="${esc(c.id)}" ${c.id===value?'selected':''}>${esc(c.name)}</option>`).join('');}
 function filterView(){return me()==='parents'?`<fieldset class="child-filter"><legend>Afficher</legend>${[{id:'all',name:'Tous'},...d().children].map(c=>`<button type="button" data-x="filter" data-id="${esc(c.id)}" class="${filter===c.id?'selected':'secondary'}" aria-pressed="${filter===c.id}">${esc(c.name)}</button>`).join('')}</fieldset>`:'';}
 function title(t){return t.subject+' · '+t.description.split(/[\n.!?]/)[0].slice(0,65);}
 function duration(t){const e=estimateTask(t,pedagogy(t.child),d().sessions||[]);return `<span class="small muted">${t.minutes} min prévues · indication : ${e.min}–${e.max} min</span>`;}
 function taskView(t){
  const p=pedagogy(t.child),docs=(d().documents||[]).filter(x=>x.child===t.child&&x.task_id===t.id);
  return `<article class="homework ${t.done?'done':''}"><div class="homework-line"><label class="done-control"><input type="checkbox" aria-label="Terminer ${esc(t.subject)}" data-check="${esc(t.id)}" ${t.done?'checked':''}><span>${t.done?'Fait':'À faire'}</span></label><details data-task-detail="${esc(t.id)}" ${selectedTask===t.id?'open':''}><summary><strong>${esc(title(t))}</strong><span class="meta">${esc(name(t.child))} · pour le ${niceDate(t.due)}${t.is_assessment?' · Contrôle / évaluation':''}</span></summary><div class="task-detail ${p.large_text?'large-reading':''}"><p class="consigne">${esc(t.description)}</p>${duration(t)}${t.detail_missing?'<p class="danger">Consigne à compléter avec le cours ou le manuel.</p>':''}<div class="actions"><button data-x="start" data-id="${esc(t.id)}">Je commence</button><button data-x="practice" data-id="${esc(t.id)}" data-minutes="5" class="secondary">Quiz · 5 min</button><button data-x="practice" data-id="${esc(t.id)}" data-minutes="10" class="secondary">Exercices · 10 min</button><button data-x="help" data-id="${esc(t.id)}" class="secondary">Je bloque</button><button data-x="read" data-id="${esc(t.id)}" class="secondary">Écouter la consigne</button><button data-x="add-doc" data-id="${esc(t.id)}" class="secondary">Ajouter le support</button></div><p class="small">${docs.length} document(s) enregistré(s). ${(t.attachment_refs||[]).length} pièce(s) jointe(s) ÉcoleDirecte référencée(s).</p>${(t.attachment_refs||[]).map(ref=>`<p><button class="secondary" data-x="ed-document" data-id="${esc(t.id)}" data-key="${esc(ref.key)}">Récupérer ${esc(ref.name)}</button></p>`).join('')}${docs.map(doc=>`<p><button data-x="open-doc" data-id="${esc(doc.id)}" class="secondary">${esc(doc.name)}</button> <span class="pill">${doc.verified?'Texte vérifié':'Texte à vérifier / compléter'}</span></p>`).join('')}<div class="actions"><button class="secondary" data-edit="${esc(t.id)}">Modifier</button><button class="secondary" data-delete="${esc(t.id)}">Supprimer</button></div></div></details></div></article>`;
 }
 function dashboard(){
  const tasks=rows('tasks'),metrics=weekMetrics(tasks,children(),d().preferences||[],dateKey(),d().capacity||40,d().profiles||[]),todo=tasks.filter(t=>!t.done).sort((a,b)=>a.due.localeCompare(b.due));
  const levels=competency(rows('attempts'));
  return `${filterView()}<section class="panel"><p class="eyebrow muted">UN PAS À LA FOIS</p><h2>${me()==='parents'?'La semaine en famille':'Bonjour '+esc(name(me()))+' !'}</h2><p class="muted">Du ${niceDate(metrics.start)} au ${niceDate(metrics.end)} · estimations ajustables</p><div class="kpi-grid"><div class="kpi"><h3>Charge restante</h3><meter class="load-meter ${metrics.level}" min="0" max="120" low="60" high="85" optimum="20" value="${Number.isFinite(metrics.ratio)?Math.min(120,Math.round(metrics.ratio*100)):120}" aria-label="Charge : ${esc(metrics.label)}"></meter><strong>${metrics.label}</strong><p>${metrics.remaining} min de travail · ${metrics.available} min de créneaux restants</p>${metrics.overloaded?'<p class="danger">Au moins une échéance ne tient pas dans les créneaux. À revoir avec un parent.</p>':''}</div><div class="kpi"><h3>Avancement des devoirs</h3><label for="progress">${metrics.count?metrics.percent+' % du travail prévu terminé':'Aucun devoir prévu cette semaine'}</label><progress id="progress" value="${metrics.completed}" max="${metrics.total||1}"></progress><p>${metrics.done} devoir(s) terminé(s) sur ${metrics.count}</p><small>Calcul pondéré par les durées prévues. Un nouvel import peut faire baisser le pourcentage.</small></div><div class="kpi"><h3>Mes connaissances</h3><strong>${levels.length} notion(s) travaillée(s)</strong><p>${levels.filter(x=>x.level==='À l’aise'||x.level==='Confirmé').length} notion(s) consolidée(s)</p><small>Les résultats et les révisions espacées servent d’indicateurs. La vitesse ne donne aucun point.</small></div></div></section><section class="panel"><h2>Le prochain petit pas</h2>${todo.slice(0,3).map(taskView).join('')||'<p>Tout est à jour.</p>'}</section>${remindersView()}${progressView()}`;
 }
 function tasksView(base){return `${filterView()}<section class="panel"><h2>Mes devoirs</h2><p class="small muted">Coche « Fait » quand le travail est terminé. Ouvre une ligne pour lire la consigne et t’entraîner.</p>${rows('tasks').slice().sort((a,b)=>a.due.localeCompare(b.due)).map(taskView).join('')||'<p>Aucun devoir pour cette sélection.</p>'}</section>`+base.slice(base.indexOf('<section class="panel"><h2>Ajouter un devoir'));
 }
 function planning(){
  const tasks=rows('tasks'),prefs=d().preferences||[],p=plan(tasks,d().capacity||40,dateKey(),14,prefs,d().profiles||[]);
  const days=Array.from({length:14},(_,i)=>daysAfter(dateKey(),i));
  return `${filterView()}<section class="panel"><h2>Mon agenda</h2><p class="muted">Les évaluations sont préparées en priorité, en respectant les échéances et les créneaux. Ouvre un intitulé pour les détails. Les horaires restent indicatifs ; le travail prévu le jour de l’échéance doit être fait avant le cours.</p>${p.unscheduled.length?`<p class="danger">À organiser avec un parent : ${p.unscheduled.map(s=>`${esc(s.task.subject)} (${s.minutes} min non placées)`).join(', ')}.</p>`:''}<div class="agenda-wrap"><table class="agenda"><caption>Les 14 prochains jours — pauses comprises dans les créneaux</caption><thead><tr><th scope="col">Jour</th>${children().map(c=>`<th scope="col">${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${days.map(day=>`<tr><th scope="row">${niceDate(day)}</th>${children().map(c=>{const slots=p.slots.filter(s=>s.date===day&&s.task.child===c.id);const reminders=rows('reminders').filter(r=>r.child===c.id&&r.due===day&&r.status==='planned');return `<td>${slots.map(s=>`<details><summary>${esc(s.task.subject)}${s.task.is_assessment?' · Évaluation':''} <small>${s.minutes} min</small></summary><p>${esc(s.task.description)}</p><p>${esc(s.label)} · ${esc(s.start)}${s.pause_before?' · pause de 5 min avant':''}</p><button data-x="show-task" data-id="${esc(s.task.id)}">Ouvrir le devoir</button></details>`).join('')}${reminders.map(r=>`<p class="small">Révision facultative : ${esc(r.topic)} · ${r.minutes} min</p>`).join('')}${!slots.length&&!reminders.length?'<span class="muted">—</span>':''}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div></section>${me()==='parents'?children().map(api.preferenceForm).join(''):''}`;
 }
 function remindersView(){const list=rows('reminders').filter(r=>r.status==='planned').sort((a,b)=>a.due.localeCompare(b.due));return `<section class="panel"><h2>Mes petites révisions prévues</h2><p class="small muted">Rappels affichés dans l’application à sa prochaine ouverture ; aucune notification téléphone n’est envoyée.</p>${list.map(r=>`<article class="task"><div><strong>${esc(r.topic)}</strong><p>${esc(name(r.child))} · ${niceDate(r.due)} · ${r.minutes} min</p><div class="actions">${r.task_id&&task(r.task_id)?`<button data-x="practice" data-id="${esc(r.task_id)}" data-reminder="${esc(r.id)}" data-minutes="${r.minutes}">Commencer</button>`:''}<button data-x="skip-reminder" data-id="${esc(r.id)}" class="secondary">Ne pas faire</button></div></div></article>`).join('')||'<p>Aucune révision programmée.</p>'}</section>`;}
 function progressView(){const levels=competency(rows('attempts')),sessions=rows('sessions').filter(s=>s.status==='completed');return `<section class="panel"><h2>Mes progrès</h2>${levels.map(l=>`<p><strong>${esc(name(l.child))} · ${esc(l.topic)}</strong> <span class="pill">${l.level}</span> · ${l.attempts} entraînement(s)</p>`).join('')||'<p>Les premiers entraînements alimenteront cette vue. Une réussite isolée ne confirme pas une notion.</p>'}<details><summary>Comprendre les niveaux</summary><p>« En cours » : premières tentatives. « À l’aise » : plusieurs réussites sans aide sur deux jours avec des questions variées. « Confirmé » : réussites sur au moins trois jours et dix questions distinctes, avec une reprise après trois jours. Ce sont des indicateurs d’entraînement, pas des notes scolaires.</p></details>${me()==='parents'?`<details><summary>Temps de travail déclarés</summary>${sessions.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,30).map(s=>`<p>${esc(name(s.child))} · ${esc(s.subject)} · ${timeLabel(s.seconds)} · ${niceDate(s.created_at.slice(0,10))}${s.rating?' · '+{easy:'facile',adapted:'adapté',hard:'difficile'}[s.rating]:''}</p>`).join('')||'<p>Aucune séance terminée.</p>'}</details>`:''}</section>`;}
 function revision(base){return `${filterView()}<section class="panel"><h2>Réviser mes devoirs</h2>${rows('tasks').filter(t=>!t.done||t.due>=daysAfter(dateKey(),-14)).map(t=>`<p><strong>${esc(t.subject)}</strong> · ${esc(name(t.child))} <button data-x="practice" data-id="${esc(t.id)}" data-minutes="5" class="secondary">Quiz · 5 min</button></p>`).join('')||'<p>Ajoute un devoir pour retrouver ses révisions ici.</p>'}</section>${remindersView()}${progressView()}${base}`;}
 function profileForms(){return children().map(c=>{const p=pedagogy(c.id);return `<details class="panel"><summary>Fiche pédagogique de ${esc(c.name)}</summary><p>Renseigne les besoins concrets et les recommandations utiles. Aucun trouble n’est déduit automatiquement. Les contenus de Mr Prof ne sont pas synchronisés : colle ici les consignes propres à cet enfant après les avoir vérifiées.</p><form data-xform="pedagogy" data-child="${esc(c.id)}">${[['strengths','Points d’appui et acquis'],['needs','Difficultés et besoins constatés'],['instructions','Consignes et aménagements à respecter'],['source_notes','Consignes reprises de Mr Prof / recommandations — source et date']].map(([k,label])=>`<label>${label}<textarea name="${k}" maxlength="8000">${esc(p[k])}</textarea></label>`).join('')}<label>Séance préférée (5 à 25 min)<input name="session_minutes" type="number" min="5" max="25" value="${p.session_minutes}" required></label>${[['one_step','Une consigne à la fois'],['read_aloud','Proposer la lecture orale'],['large_text','Texte plus grand'],['hide_timer','Masquer le temps écoulé pendant le travail'],['encouragement','Proposer un bilan après la séance'],['confirmed','J’ai vérifié ces consignes pour cet enfant']].map(([k,label])=>`<label><input class="inline-check" type="checkbox" name="${k}" ${p[k]?'checked':''}>${label}</label>`).join('')}<button type="submit">Enregistrer la fiche</button></form></details>`;}).join('');}
 function settings(base){return base+(me()==='parents'?`<section class="panel"><h2>Mon prénom</h2><form data-xform="parent-name"><label>Prénom du parent connecté<input name="display_name" maxlength="50" required value="${esc(parentName())}"></label><button type="submit">Enregistrer mon prénom</button></form></section>${profileForms()}<section class="panel"><h2>Assistant pédagogique</h2><p>${aiReady?'Moteur IA disponible. Les appels demandés transmettent les supports choisis et les consignes pédagogiques au fournisseur configuré.':'Le moteur IA libre n’est pas activé. Les entraînements depuis les fiches et définitions vérifiées, le planning, le chronomètre et l’aide locale fonctionnent.'}</p><p class="small muted">La connexion à l’abonnement ChatGPT pour une application web hébergée n’est pas configurée. Aucun abonnement supplémentaire n’a été souscrit. Les projets Mr Prof ne sont pas automatiquement importés.</p></section>`:'');}
 function parentName(){return (d().parent_settings||[]).find(p=>p.user_id===api.user()?.id)?.display_name||api.user()?.user_metadata?.display_name||api.user()?.user_metadata?.given_name||'';}
 function documentForm(){return `<section class="panel" id="documentUpload"><h2>Ajouter un cours ou un exercice</h2><form data-xform="upload"><label>Enfant<select name="child" required>${childOptions(true,documentTarget?.child||'')}</select></label><label>Matière<input name="subject" maxlength="80" value="${esc(documentTarget?.subject||'')}"></label><label>Associer à un devoir (facultatif)<select name="task_id"><option value="">Cours général</option>${rows('tasks').map(t=>`<option value="${esc(t.id)}" ${documentTarget?.id===t.id?'selected':''}>${esc(name(t.child))} · ${esc(t.subject)} · ${esc(t.due)}</option>`).join('')}</select></label><div class="actions"><label class="file-button">Choisir un document<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain"></label><label class="file-button">Prendre une photo<input type="file" name="photo" accept="image/*" capture="environment"></label></div><p class="small muted">PDF, images ou texte · 10 Mo maximum. Les PDF contenant du texte sont lus sur l’appareil. Le texte d’une photo ou d’un scan doit être vérifié ou complété.</p><button type="submit">Enregistrer le document</button></form></section>`;}
 function documentsView(){return `${filterView()}${documentForm()}<section class="panel"><h2>Mes documents</h2>${rows('documents').map(doc=>`<details><summary>${esc(doc.name)} <span class="pill">${esc(name(doc.child))} · ${doc.verified?'Texte vérifié':'À compléter / vérifier'}</span></summary><p>${esc(doc.subject)} · ${Math.ceil(doc.bytes/1024)} Ko</p><div class="actions"><button data-x="open-doc" data-id="${esc(doc.id)}">Ouvrir le fichier</button>${aiReady?`<button data-x="analyze-doc" data-id="${esc(doc.id)}" class="secondary">Extraire le texte avec l’IA</button>`:''}<button data-x="delete-doc" data-id="${esc(doc.id)}" class="secondary">Supprimer</button></div><form data-xform="document-text" data-id="${esc(doc.id)}"><label>Texte du support (à vérifier avant les quiz)<textarea name="content_text" maxlength="60000">${esc(doc.content_text)}</textarea></label><label><input class="inline-check" type="checkbox" name="verified" ${doc.verified?'checked':''}>J’ai vérifié ce texte avec l’original</label><button type="submit">Enregistrer le texte</button></form></details>`).join('')||'<p>Aucun document dans cette sélection.</p>'}</section>`;}
 async function upload(file,target,sourceKey=null){
  if(!api.cloud())throw Error('Connecte-toi au compte parent pour conserver les documents dans l’espace privé.');
  if(!target.child||!d().children.some(c=>c.id===target.child)||me()!=='parents'&&target.child!==me())throw Error('Choisis le bon enfant.');
  if(target.task_id&&!d().tasks.some(t=>t.id===target.task_id&&t.child===target.child))throw Error('Le devoir choisi ne correspond pas à cet enfant.');
  if(sourceKey&&(d().documents||[]).some(x=>x.child===target.child&&x.source_key===sourceKey))return;
  const {mime}=await inspectFile(file),text=await extractFileText(file,mime),id=crypto.randomUUID(),path=`${api.family()}/${target.child}/${id}`;
  const {error}=await api.client().storage.from('mcs-documents').upload(path,file,{contentType:mime,upsert:false});if(error)throw Error('Le document n’a pas été enregistré. Vérifie le format et la connexion.');
  try{await api.insertRows('documents',[{id,child:target.child,task_id:target.task_id||null,name:file.name.slice(0,200),subject:target.subject||'',mime,bytes:file.size,object_path:path,content_text:text,verified:false,status:text?'needs_review':'uploaded',source_key:sourceKey}]);}
  catch(e){await api.client().storage.from('mcs-documents').remove([path]);throw e;}
 }
 async function importEDDocuments(tasks){
  let count=0,failed=0;
  for(const t of tasks)for(const ref of t.attachment_refs||[]){
   if((d().documents||[]).some(x=>x.child===t.child&&x.source_key==='ed:'+ref.key))continue;
   try{const file=(await api.callED({action:'download',key:ref.key})).file;await upload(base64File(file.base64,file.name,file.mime),{child:t.child,task_id:t.id,subject:t.subject},'ed:'+ref.key);count++;}catch{failed++;}
  }
  return {count,failed};
 }
 function setModal(value){modal=value;renderModal();}
 function renderModal(){
  const host=$('modalHost');if(!host)return;host.innerHTML='';if(!modal)return;
  const t=task(modal.taskId),p=t?pedagogy(t.child):defaultPedagogy();
  let content='';
  if(modal.type==='finished')content=`<h2>Devoir terminé</h2><p>Ton travail est enregistré comme fait. Tu peux consolider avec un quiz de 5 min ou un exercice de 10 min.</p><div class="actions"><button data-x="practice" data-id="${esc(t.id)}" data-minutes="5">Quiz · 5 min</button><button data-x="practice" data-id="${esc(t.id)}" data-minutes="10">Exercice · 10 min</button><button data-x="later" data-id="${esc(t.id)}" class="secondary">Pas maintenant</button></div>`;
  if(modal.type==='later')content=`<h2>Une autre fois ?</h2><p>Tu peux prévoir une courte révision, ou ne rien programmer. Le devoir reste fait.</p><form data-xform="reminder" data-id="${esc(t.id)}"><label>Quand ?<input type="date" name="due" required min="${dateKey()}" value="${dateKey()}"></label><label>Durée<select name="minutes"><option value="5">5 min</option><option value="10">10 min</option></select></label><button type="submit">Prévoir dans mon planning</button></form>`;
  if(modal.type==='help')content=`<h2>On avance à ton rythme</h2><p>Choisis ce qui t’aiderait.</p><div class="actions"><button data-x="hint" data-id="${esc(t?.id||'')}">Un indice</button><button data-x="explain" data-id="${esc(t?.id||'')}">Une autre explication</button><button data-x="pause">Une pause</button></div>${modal.answer?`<p class="answer">${esc(modal.answer)}</p>`:''}`;
  if(modal.type==='missing')content=`<h2>Le support manque</h2><p>Pour proposer des exercices fidèles à ce cours, ajoute une fiche de questions-réponses ou un document dont le texte a été vérifié. Les définitions « notion : explication » peuvent servir à créer des questions locales.</p><button data-x="add-doc" data-id="${esc(t.id)}">Ajouter un document ou une photo</button>${aiReady?`<button data-x="ai-practice" data-id="${esc(t.id)}">Proposer des questions avec l’IA</button>`:''}`;
  if(modal.type==='practice')content=practiceView();
  if(modal.type==='session-end')content=`<h2>Ta séance</h2><p>Le temps sert à ajuster le planning, jamais à te noter.</p><form data-xform="session-end" data-id="${esc(modal.sessionId)}"><label>Temps travaillé (minutes, ajustable)<input name="minutes" type="number" min="0" max="240" value="${Math.round(modal.seconds/60)}" required></label><label>Comment était l’exercice ?<select name="rating"><option value="adapted">Adapté</option><option value="easy">Facile</option><option value="hard">Difficile</option></select></label><button type="submit">Enregistrer le bilan</button></form>`;
  host.innerHTML=`<div class="modal-backdrop"><section class="modal ${p.large_text?'large-reading':''}" role="dialog" aria-modal="true" aria-label="Accompagnement"><button class="modal-close secondary" data-x="close" aria-label="Fermer la fenêtre">Fermer</button>${content}</section></div>`;
  host.querySelector('button')?.focus();
 }
 function practiceElapsed(){return practice?Math.min(7200,Math.round((practice.elapsed_seconds||0)+(practice.running?(performance.now()-practice.clock_started)/1000:0))):0;}
 function pausePractice(){if(practice?.running){practice.elapsed_seconds=practiceElapsed();practice.running=false;}}
 function practiceView(){
  if(!practice)return '';
  const current=practice.questions[practice.index],p=pedagogy(practice.child),i=practice.index;
  if(!practice.finished&&!practice.running)return '<h2>Quiz en pause</h2><p>Reprends quand tu le souhaites.</p><button data-x="resume-practice">Reprendre</button>';
  if(practice.finished)return `<h2>Séance terminée</h2><p>${practice.correct} réponse(s) réussie(s) sur ${practice.questions.length}. Les réponses ouvertes ont été autoévaluées.</p><p>${practice.assisted?'Tu as utilisé une aide : elle sert à comprendre.':'Tu peux reprendre cette notion dans quelques jours.'}</p><form data-xform="self-after"><label>Après cette séance<select name="self_after"><option value="unsure">Je pense avoir compris</option><option value="help">J’ai encore besoin d’aide</option><option value="ready">Je peux expliquer</option></select></label><button type="submit">Enregistrer mon ressenti</button></form><button data-x="close">Terminer</button>`;
  return `<h2>${practice.minutes===5?'Quiz':'Exercice'} · ${practice.minutes} min indicatives</h2><p>${i+1} / ${practice.questions.length} · ${esc(name(practice.child))} · <span id="practiceTime">${p.hide_timer?'à ton rythme':timeLabel(practiceElapsed())}</span> <button data-x="pause-practice" class="secondary">Pause</button></p>${i===0&&!practice.checked?`<label>Avant de commencer, comment te sens-tu sur cette notion ?<select id="selfBefore"><option value="unsure">Je pense avoir compris</option><option value="help">J’ai besoin d’aide</option><option value="ready">Je peux expliquer</option></select></label>`:''}<p><strong>${esc(current.question)}</strong></p><p class="small muted">Source : ${esc(current.source)}</p>${!practice.checked?`<form data-xform="practice-answer">${current.choices?current.choices.map((choice,j)=>`<label><input class="inline-check" type="radio" name="choice" value="${j}" required> ${esc(choice)}</label>`).join(''):'<label>Ta réponse<textarea name="answer" required maxlength="4000"></textarea></label>'}<button type="submit">Voir la correction</button></form><div class="actions"><button data-x="practice-hint" class="secondary">Un indice</button><button data-x="speak-question" class="secondary">Écouter</button></div>${practice.hint?`<p class="answer">${esc(practice.hint)}</p>`:''}`:`<p class="answer">${esc(current.answer)}</p>${current.explanation?`<p>${esc(current.explanation)}</p>`:''}${current.choices?`<p>${practice.lastCorrect?'Réponse correcte.':'Tu peux relire l’explication et réessayer un autre jour.'}</p><button data-x="next-question">${i===practice.questions.length-1?'Finir':'Question suivante'}</button>`:`<p>Compare avec ta réponse. Est-ce la même idée ?</p><button data-x="self-correct" data-correct="yes">Oui, j’ai compris</button><button data-x="self-correct" data-correct="no" class="secondary">À revoir</button>`}`}`;
 }
 function makePractice(t,minutes=5,reminder=null){
  if(practice&&practice.taskId===t.id&&!practice.finished){practice.running=true;practice.clock_started=performance.now();setModal({type:'practice',taskId:t.id});return;}
  const questions=sourceQuestions(t,d().cards,d().documents||[]);
  if(!questions.length){setModal({type:'missing',taskId:t.id});return;}
  const chosen=questions.slice().sort(()=>Math.random()-.5).slice(0,minutes===5?5:10).map(q=>{
   const wrong=[...new Set(questions.filter(x=>x.answer!==q.answer).map(x=>x.answer))].slice(0,2);
   return minutes===5&&wrong.length===2?{...q,choices:[q.answer,...wrong].sort(()=>Math.random()-.5)}:q;
  });
  practice={taskId:t.id,child:t.child,topic:t.subject+' · '+(t.description.split('\n')[0].slice(0,100)),minutes,questions:chosen,index:0,correct:0,assisted:false,finished:false,checked:false,reminder};
  practice.clock_started=performance.now();practice.elapsed_seconds=0;practice.running=true;practice.details=[];practice.question_boundary=0;sourceBefore='unsure';setModal({type:'practice',taskId:t.id});
 }
 async function nextQuestion(correct){
  if(!practice||practice.finished)return;
  const seconds=practiceElapsed();practice.details.push({id:practice.questions[practice.index].id,seconds:seconds-(practice.question_boundary||0),correct:!!correct,assisted:!!practice.assisted});practice.question_boundary=seconds;
  if(correct)practice.correct++;practice.index++;practice.checked=false;practice.hint='';
  if(practice.index>=practice.questions.length){
   practice.finished=true;pausePractice();practice.attemptId=crypto.randomUUID();
   await api.insertRows('attempts',[{id:practice.attemptId,child:practice.child,task_id:practice.taskId,topic:practice.topic,score:practice.correct,total:practice.questions.length,duration_seconds:practice.elapsed_seconds,details:practice.details,assisted:practice.assisted||practice.questions.some(q=>!q.choices),question_ids:practice.questions.map(q=>q.id),self_before:sourceBefore,created_at:new Date().toISOString()}]);
   if(practice.reminder){const r=d().reminders.find(r=>r.id===practice.reminder);if(r)await api.updateRow('reminders',r,{status:'done'});}
  }
  renderModal();
 }
 async function saveSession(patch){
  if(!timer||timerSaving)return;timerSaving=true;
  const item=(d().sessions||[]).find(s=>s.id===timer.id);if(!item){timerSaving=false;return;}
  try{await api.updateRow('sessions',item,patch,true);}catch(e){timer.running=false;api.notice(e.message);throw e;}finally{timerSaving=false;}
 }
 function elapsed(){return timer?Math.min(14400,Math.round(timer.seconds+(timer.running?(performance.now()-timer.started)/1000:0))):0;}
 async function startTimer(t){
  if(timer?.running)throw Error('Mets d’abord la séance en cours en pause.');
  if(timer&&timer.taskId!==t.id)throw Error('Termine la séance précédente avant d’en commencer une autre.');
  let saved=(d().sessions||[]).find(s=>s.child===t.child&&s.status!=='completed');
  if(saved&&saved.task_id!==t.id)throw Error('Une autre séance de cet enfant est en pause. Reprends-la ou termine-la depuis le bandeau chronomètre.');
  if(saved){await api.updateRow('sessions',saved,{status:'running'});}
  else{saved={id:crypto.randomUUID(),child:t.child,task_id:t.id,subject:t.subject,seconds:0,status:'running',work_mode:'screen',created_at:new Date().toISOString()};await api.insertRows('sessions',[saved]);}
  timer={id:saved.id,taskId:t.id,child:t.child,seconds:saved.seconds,started:performance.now(),running:true,work_mode:saved.work_mode};selectedTask=t.id;updateTop();
 }
 async function pauseTimer(){if(!timer?.running)return;timer.seconds=elapsed();timer.running=false;await saveSession({seconds:timer.seconds,status:'paused'});updateTop();}
 async function stopTimer(){if(!timer)return;await pauseTimer();setModal({type:'session-end',sessionId:timer.id,seconds:timer.seconds});}
 function hydrateTimer(){
  if(timer)return;
  const saved=(d().sessions||[]).find(s=>s.status!=='completed'&&children().some(c=>c.id===s.child));
  if(saved)timer={id:saved.id,taskId:saved.task_id,child:saved.child,seconds:saved.seconds,started:performance.now(),running:false,work_mode:saved.work_mode};
 }
 function updateTop(){
  const head=$('identity');if(head)head.innerHTML=api.cloud()?`<span>Bonjour${parentName()?' '+esc(parentName()):''}</span><button data-x="settings" class="secondary">Mon compte</button>`:'<button data-x="settings">Parents & connexion</button>';
  hydrateTimer();
  const dock=$('sessionDock');if(dock) dock.innerHTML=timer&&(me()==='parents'||timer.child===me())?`<section class="timer-dock" aria-label="Séance de travail"><strong>${esc(name(timer.child))} · ${esc(task(timer.taskId)?.subject||'Séance')}</strong><span id="timerTime">${pedagogy(timer.child).hide_timer?'Séance en cours':timeLabel(elapsed())}</span><span class="pill">${timer.running?'En cours':'En pause'}</span><div class="actions"><button data-x="${timer.running?'pause':'resume'}">${timer.running?'Pause':'Reprendre'}</button><button data-x="stop-timer" class="secondary">Terminer la séance</button><button data-x="timer-mode" class="secondary">Mode ${timer.work_mode==='paper'?'papier':'écran'}</button></div><p class="small">${timer.work_mode==='paper'?'Temps déclaré : corrige la durée à la fin si nécessaire.':'Le chrono se met en pause lorsque tu quittes l’application.'}</p></section>`:'';
  if($('coachAnswer'))$('coachAnswer').textContent=coachReply;
  if($('coachMode'))$('coachMode').textContent=aiReady?'Assistant pédagogique IA':'Aide de l’application · mode local';
 }
 async function ask(){
  if(coachBusy)return;const input=$('coachQuestion'),question=input?.value?.trim();if(!question)return;
  coachBusy=true;const t=task(selectedTask),child=t?.child||children()[0]?.id;
  try{
   coachReply=localCoachAnswer(question,{tasks:rows('tasks'),reminders:rows('reminders'),childName:children().map(c=>c.name).join(' et '),profile:pedagogy(child),selectedTask:t});
   if(aiReady&&child&&children().length!==1&&!t){coachReply='Choisis un enfant avec le filtre ou ouvre un devoir pour que ma réponse utilise le bon contexte.';}
   else if(aiReady&&child){const result=await callAI({action:'ask',child,task_id:t?.id||null,question});coachReply=result.answer;}
   if($('coachAnswer'))$('coachAnswer').textContent=coachReply;
  }catch(e){coachReply=e.message;if($('coachAnswer'))$('coachAnswer').textContent=coachReply;}finally{coachBusy=false;}
 }
 function speak(text){if(!('speechSynthesis'in window)){api.notice('La lecture orale n’est pas disponible dans ce navigateur.');return;}speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang='fr-FR';utterance.rate=.95;speechSynthesis.speak(utterance);}
 function dictate(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Recognition){api.notice('Utilise le micro du clavier de ton téléphone pour dicter ta question.');$('coachQuestion')?.focus();return;}voice?.abort();voice=new Recognition();voice.lang='fr-FR';voice.interimResults=false;voice.onresult=e=>{if($('coachQuestion'))$('coachQuestion').value=e.results[0][0].transcript;};voice.onerror=()=>api.notice('Micro indisponible ou autorisation refusée. Tu peux écrire ta question.');voice.start();}
 async function callAI(body){
  const {data:result,error}=await api.client().functions.invoke('coach-ai',{body});if(error||result?.error)throw Error(result?.error||'Le moteur pédagogique est indisponible. Tes données restent enregistrées.');return result;
 }
 async function checkAI(){if(!api.cloud())return;try{const result=await callAI({action:'status'});aiReady=result.available===true;updateTop();}catch{aiReady=false;}}
 async function complete(t,done){
  await api.action(async()=>{if(done&&timer?.taskId===t.id)await pauseTimer();await api.updateRow('tasks',t,{done});if(done)setModal({type:'finished',taskId:t.id});});
 }
 function ownsForm(form){return !!form.dataset.xform;}
 async function submit(form){
  const f=new FormData(form),kind=form.dataset.xform;
  if(kind==='practice-answer'){
   const before=$('selfBefore');if(before)sourceBefore=before.value;
   const q=practice.questions[practice.index];practice.checked=true;practice.lastCorrect=q.choices?q.choices[Number(f.get('choice'))]===q.answer:false;renderModal();return;
  }
  await api.action(async()=>{
   if(kind==='self-after'){const old=d().attempts.find(a=>a.id===practice.attemptId);if(old)await api.updateRow('attempts',old,{self_after:String(f.get('self_after'))});api.notice('Ton ressenti est enregistré.');setModal(null);}
   if(kind==='pedagogy'){
    if(me()!=='parents')throw Error('La fiche pédagogique se modifie depuis l’espace parent.');
    const child=form.dataset.child,settings=validatePedagogy(Object.fromEntries(['needs','strengths','instructions','source_notes','session_minutes','one_step','read_aloud','large_text','hide_timer','encouragement','confirmed'].map(k=>[k,k==='session_minutes'?Number(f.get(k)):['needs','strengths','instructions','source_notes'].includes(k)?String(f.get(k)||''):f.has(k)])));
    const old=(d().profiles||[]).find(p=>p.child===child);if(old)await api.updateRow('profiles',old,{settings});else await api.insertRows('profiles',[{id:crypto.randomUUID(),child,settings}]);api.notice('Fiche pédagogique enregistrée pour cet enfant.');
   }
   if(kind==='parent-name'){
    const display_name=String(f.get('display_name')||'').trim();if(!display_name||display_name.length>50)throw Error('Indique un prénom de 1 à 50 caractères.');
    if(api.cloud()){const old=d().parent_settings?.find(p=>p.user_id===api.user()?.id);if(old)await api.updateRow('parent_settings',old,{display_name});else await api.insertRows('parent_settings',[{id:crypto.randomUUID(),user_id:api.user().id,display_name}]);}
    else {d().parent_name=display_name;api.saveLocal();}api.notice('Prénom enregistré.');
   }
   if(kind==='reminder'){
    const t=task(form.dataset.id),due=String(f.get('due'));if(!due||due<dateKey()||due>daysAfter(dateKey(),30))throw Error('Choisis une date dans les 30 prochains jours.');
    await api.insertRows('reminders',[{id:crypto.randomUUID(),child:t.child,task_id:t.id,topic:t.subject,due,minutes:Number(f.get('minutes')),status:'planned'}]);setModal(null);api.notice('Révision prévue. Elle sera visible dans l’application.');
   }
   if(kind==='upload'){
    const file=[f.get('file'),f.get('photo')].find(x=>x?.size);if(!file)throw Error('Choisis un document ou prends une photo.');
    await upload(file,{child:String(f.get('child')),task_id:String(f.get('task_id'))||null,subject:String(f.get('subject')).trim()});documentTarget=null;api.notice('Document enregistré. Vérifie son texte avant de créer des exercices.');
   }
   if(kind==='document-text'){
    const doc=d().documents.find(x=>x.id===form.dataset.id),content_text=String(f.get('content_text')||'').trim(),verified=f.has('verified');if(verified&&!content_text)throw Error('Ajoute le texte avant de le déclarer vérifié.');
    await api.updateRow('documents',doc,{content_text,verified,status:verified?'verified':'needs_review'});api.notice('Texte du document enregistré.');
   }
   if(kind==='session-end'){
    const s=d().sessions.find(x=>x.id===form.dataset.id),seconds=Math.round(Number(f.get('minutes'))*60);if(!Number.isFinite(seconds)||seconds<0||seconds>14400)throw Error('Vérifie la durée.');
    await api.updateRow('sessions',s,{seconds,status:'completed',rating:String(f.get('rating'))});timer=null;setModal(null);api.notice('Séance enregistrée. Tu peux ensuite marquer le devoir comme fait.');
   }
  });
 }
 function click(button){
  const kind=button.dataset.x;if(!kind)return false;
  const id=button.dataset.id,t=task(id);
  if(kind==='estimate-task'){const f=$('taskForm'),t={child:f.elements.child.value,subject:f.elements.subject.value,description:f.elements.description.value};f.elements.minutes.value=estimateTask(t,pedagogy(t.child),d().sessions||[]).minutes;api.notice('Durée indicative proposée. Tu peux l’ajuster.');return true;}
  if(kind==='filter'){selectedTask=null;filter=id;api.render();return true;}
  if(kind==='close'){if(practice&&!practice.finished)pausePractice();setModal(null);return true;}
  if(kind==='pause-practice'){pausePractice();renderModal();return true;}
  if(kind==='resume-practice'){practice.running=true;practice.clock_started=performance.now();renderModal();return true;}
  if(kind==='settings'){api.changeTab('settings');return true;}
  if(kind==='show-task'){selectedTask=id;api.changeTab('tasks');return true;}
  if(kind==='add-doc'){documentTarget=t||null;setModal(null);api.changeTab('documents');return true;}
  if(kind==='practice'){setModal(null);makePractice(t,Number(button.dataset.minutes)||5,button.dataset.reminder||null);return true;}
  if(kind==='later'){setModal({type:'later',taskId:id});return true;}
  if(kind==='help'){selectedTask=id;setModal({type:'help',taskId:id});return true;}
  if(kind==='read'){speak(t.description);return true;}
  if(kind==='speak-question'){speak(practice.questions[practice.index].question);return true;}
  if(kind==='practice-hint'){practice.assisted=true;practice.hint='Reprends la définition dans le support : '+practice.questions[practice.index].source+'. Tu peux ensuite répondre avec tes propres mots.';renderModal();return true;}
  if(kind==='hint'||kind==='explain'){modal.answer=kind==='hint'?'Relis la consigne et repère ce qu’on te demande de trouver. Quelle est la première étape que tu peux faire ?':'Explique avec tes mots ce que tu comprends de la consigne. Pour une réponse liée au cours, ajoute le support vérifié ou utilise les fiches. Tu peux écrire ta question dans le bandeau en haut.';renderModal();return true;}
  if(kind==='ask'){ask();return true;}
  if(kind==='dictate'){dictate();return true;}
  if(kind==='speak-answer'){speak(coachReply||'Pose ta question dans le bandeau.');return true;}
  api.action(async()=>{
   if(kind==='start')await startTimer(t);
   if(kind==='pause'){await pauseTimer();setModal(null);api.notice('Séance en pause. Reprends quand tu le souhaites.');}
   if(kind==='resume'){const t=task(timer?.taskId);if(t)await startTimer(t);}
   if(kind==='stop-timer')await stopTimer();
   if(kind==='timer-mode'){await pauseTimer();timer.work_mode=timer.work_mode==='screen'?'paper':'screen';await saveSession({work_mode:timer.work_mode});api.notice('Mode changé. Reprends le chronomètre quand tu es prêt.');}
   if(kind==='next-question')await nextQuestion(practice.lastCorrect);
   if(kind==='self-correct'){practice.assisted=true;await nextQuestion(button.dataset.correct==='yes');}
   if(kind==='skip-reminder'){const r=d().reminders.find(r=>r.id===id);if(r)await api.updateRow('reminders',r,{status:'skipped'});}
   if(kind==='ed-document'){const result=await api.callED({action:'download',key:button.dataset.key});await upload(base64File(result.file.base64,result.file.name,result.file.mime),{child:t.child,task_id:t.id,subject:t.subject},'ed:'+button.dataset.key);api.notice('Pièce jointe enregistrée dans Documents. Vérifie son texte pour les exercices.');}
   if(kind==='open-doc'){
    const doc=d().documents.find(x=>x.id===id),{data:blob,error}=await api.client().storage.from('mcs-documents').download(doc.object_path);if(error)throw Error('Le fichier ne peut pas être ouvert. Reconnecte-toi.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   }
   if(kind==='delete-doc'){
    const doc=d().documents.find(x=>x.id===id);if(!confirm('Supprimer ce document privé et son texte ?'))return;
    const {error}=await api.client().storage.from('mcs-documents').remove([doc.object_path]);if(error)throw Error('Suppression du fichier non confirmée.');await api.deleteRow('documents',doc);api.notice('Document supprimé.');
   }
   if(kind==='analyze-doc'){const doc=d().documents.find(x=>x.id===id),result=await callAI({action:'analyze',child:doc.child,document_id:doc.id});await api.updateRow('documents',doc,{content_text:result.text,verified:false,status:'needs_review'});api.notice('Texte extrait. Vérifie-le avec l’original avant de le valider.');}
   if(kind==='ai-practice'){const result=await callAI({action:'generate',child:t.child,task_id:t.id,minutes:5});practice={taskId:t.id,child:t.child,topic:t.subject+' · '+t.description.slice(0,100),minutes:5,questions:result.questions,index:0,correct:0,assisted:false,finished:false,checked:false};practice.clock_started=performance.now();practice.elapsed_seconds=0;practice.running=true;practice.details=[];practice.question_boundary=0;sourceBefore='unsure';setModal({type:'practice',taskId:t.id});}
  });return true;
 }
 function onProfileChange(){selectedTask=null;pausePractice();setModal(null);if(timer?.running&&timer.work_mode==='screen')pauseTimer().catch(e=>api.notice(e.message));}
 function reset(){timer=null;practice=null;modal=null;coachReply='';aiReady=false;filter='all';selectedTask=null;voice?.abort();if('speechSynthesis'in window)speechSynthesis.cancel();renderModal();}
 setInterval(()=>{if(timer?.running&&!timer.nudged&&elapsed()>=pedagogy(timer.child).session_minutes*60){timer.nudged=true;api.notice('Tu as atteint la durée de séance prévue. Tu peux faire une pause ou continuer à ton rythme.');}if(practice?.running&&$('practiceTime'))$('practiceTime').textContent=pedagogy(practice.child).hide_timer?'à ton rythme':timeLabel(practiceElapsed());if(timer?.running&&$('timerTime'))$('timerTime').textContent=pedagogy(timer.child).hide_timer?'Séance en cours':timeLabel(elapsed());},1000);
 setInterval(()=>{if(timer?.running&&!timerSaving&&!api.busy()){timer.seconds=elapsed();timer.started=performance.now();saveSession({seconds:timer.seconds,status:'running'}).catch(()=>{});}},15000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&practice?.running){pausePractice();renderModal();}if(document.visibilityState==='hidden'&&timer?.running&&timer.work_mode==='screen')pauseTimer().catch(()=>{});});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setModal(null);if(e.key==='Tab'&&modal){const nodes=[...$('modalHost').querySelectorAll('button,input,select,textarea')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 return {onProfileChange,isSaving:()=>timerSaving,task:taskView,dashboard,tasksView,planning,revision,settings,documents:documentsView,documentForm,updateTop,renderModal,ownsForm,submit,click,complete,reset,checkAI,importEDDocuments,filterRows:key=>rows(key),filterTasks:()=>rows('tasks'),setSelected:id=>{selectedTask=id;},estimate:t=>estimateTask(t,pedagogy(t.child),d().sessions||[])};
}
