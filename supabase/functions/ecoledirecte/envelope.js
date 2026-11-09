// Envelopes only live in browser RAM, bound to the verified parent and an expiry.
export async function makeEnvelope(secret){
 const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mcs-ed-envelope-v1\0'+secret));
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
 const aad=new TextEncoder().encode('mon-coach-scolaire/ecoledirecte/v1');
 const encode=bytes=>btoa(String.fromCharCode(...bytes));
 return {
  async seal(state,uid,expires){const iv=crypto.getRandomValues(new Uint8Array(12));const plaintext=new TextEncoder().encode(JSON.stringify({state,uid,expires}));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plaintext);return encode(iv)+'.'+encode(new Uint8Array(encrypted));},
  async open(value,uid){try{if(typeof value!=='string'||value.length>60000)throw Error();const [iv,data]=value.split('.').map(s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)));const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},key,data);const payload=JSON.parse(new TextDecoder().decode(decoded));if(payload.uid!==uid||payload.expires<Date.now())throw Error();return payload;}catch{throw Error('Session ÉcoleDirecte expirée ou invalide. Reconnecte-toi.');}}
 };
}
