export const desktop = () => window.coachDesktop;
export async function desktopCall(method, ...args) {
  const result = await desktop()[method](...args);
  if (!result?.ok) throw Error(result?.error || 'La version ordinateur est indisponible.');
  return result.data;
}
// Build each request from the selected child's current, RLS-loaded data only.
export function learningContext(data, child, taskId) {
  const profile = (data.profiles || []).find(p => p.child === child)?.settings || {};
  const task = taskId ? data.tasks.find(t => t.id === taskId && t.child === child) : null;
  if (!data.children.some(c => c.id === child) || taskId && !task) throw Error('Ce devoir ne correspond pas à cet enfant.');
  if (!profile.confirmed) throw Error('Vérifie et confirme la fiche pédagogique de cet enfant dans Parents & connexion avant de solliciter l’IA.');
  return {confirmed:true, pedagogy:{needs:profile.needs,strengths:profile.strengths,instructions:profile.instructions,one_step:profile.one_step},
    task:task ? {subject:task.subject,description:task.description} : null,
    supports:(data.documents || []).filter(doc => doc.child === child && doc.verified && doc.content_text && (!task || doc.task_id === task.id || !doc.task_id && doc.subject === task.subject)).slice(0,8).map(doc => ({id:doc.id,name:doc.name,verified:true,text:doc.content_text.slice(0,12000)})),
  };
}
