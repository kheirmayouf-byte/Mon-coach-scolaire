export const browserCoachURL='http://127.0.0.1:4174';
export function createBrowserCoach(getSession,fetcher=(...args)=>fetch(...args)){
 async function call(method,payload={}){
  const session=await getSession();if(!session?.access_token)throw Error('Connecte-toi au compte parent avant de relier ton abonnement ChatGPT.');
  let response;
  try{response=await fetcher(browserCoachURL+'/v1/'+method,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(payload),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(['connect','test','ask'].includes(method)?240000:8000)});}
  catch{throw Error('Le relais ChatGPT est injoignable. Ouvre l’application Windows 3.4.2 ou plus récente sur cet ordinateur, puis autorise l’accès local dans ton navigateur si demandé.');}
  let result;try{result=await response.json();}catch{throw Error('Le relais local n’a pas renvoyé une réponse valide.');}
  if(!response.ok||!result?.ok)throw Error(result?.error||'Connexion au relais ChatGPT refusée.');return result.data;
 }
 return {call};
}
