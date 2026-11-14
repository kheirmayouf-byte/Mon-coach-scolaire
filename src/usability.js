export function passwordEyes(host=document){
 for(const input of host.querySelectorAll('input[type="password"]')){if(input.closest('.password-field'))continue;const field=document.createElement('span');field.className='password-field';input.before(field);field.append(input);const button=document.createElement('button');button.type='button';button.className='secondary password-eye';button.textContent='👁';button.setAttribute('aria-label','Afficher le mot de passe');button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Masquer le mot de passe':'Afficher le mot de passe');});field.append(button);}
}
export function taskState(tasks,sessions=[],workspaces=[]){
 if(tasks.length&&tasks.every(t=>t.done))return 'green';
 return tasks.some(t=>!t.done&&(sessions.some(s=>s.task_id===t.id&&(s.seconds>0||s.status==='running'))||workspaces.some(w=>w.task_id===t.id&&w.answers?.trim())))?'orange':'red';
}
export function boundedHistory(history){return (Array.isArray(history)?history:[]).filter(m=>['user','assistant'].includes(m?.role)&&typeof m.content==='string').slice(-12).map(m=>({role:m.role,content:m.content.slice(0,2000)}));}
