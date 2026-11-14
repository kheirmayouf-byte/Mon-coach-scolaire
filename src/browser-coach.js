export const browserCoachURL='http://127.0.0.1:4174';
export async function relayDigest(payload){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createBrowserCoach(issueTicket,fetcher=(...args)=>fetch(...args)){
 async function call(method,payload={}){
  // Only a short-lived, single-request ticket reaches loopback, never the parent's session JWT.
  const ticket=await issueTicket(method,payload);if(!ticket)throw Error('Connecte-toi au compte parent avant de relier ton abonnement ChatGPT.');
  let response;
  try{response=await fetcher(browserCoachURL+'/v1/'+method,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'MCS-Relay '+ticket},body:JSON.stringify(payload),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(['connect','test','ask'].includes(method)?240000:8000)});}
  catch{throw Error('Le relais ChatGPT est injoignable. Ouvre l’application Windows 3.4.3 ou plus récente sur cet ordinateur, puis autorise l’accès local dans ton navigateur si demandé.');}
  let result;try{result=await response.json();}catch{throw Error('Le relais local n’a pas renvoyé une réponse valide.');}
  if(!response.ok||!result?.ok)throw Error(result?.error||'Connexion au relais ChatGPT refusée.');return result.data;
 }
 return {call};
}
