export type PushEnv={FCM_PROJECT_ID?:string;FCM_CLIENT_EMAIL?:string;FCM_PRIVATE_KEY?:string;APNS_KEY_ID?:string;APNS_TEAM_ID?:string;APNS_PRIVATE_KEY?:string;APNS_BUNDLE_ID?:string};
export type PushDevice={platform:'android'|'ios';token:string;environment:'production'|'sandbox'};
export class PushError extends Error{permanent:boolean;constructor(permanent=false){super('Push delivery failed.');this.permanent=permanent;}}
export function pushConfigured(env:PushEnv,platform:string){return platform==='android'?!!(env.FCM_PROJECT_ID&&env.FCM_CLIENT_EMAIL&&env.FCM_PRIVATE_KEY):!!(env.APNS_KEY_ID&&env.APNS_TEAM_ID&&env.APNS_PRIVATE_KEY&&env.APNS_BUNDLE_ID);}
function b64(data:Uint8Array){return btoa(String.fromCharCode(...data)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
const encoded=(v:unknown)=>b64(new TextEncoder().encode(JSON.stringify(v)));
function pem(value:string){const bytes=atob(value.replace(/\\n/g,'\n').replace(/-----[^-]+-----/g,'').replace(/\s/g,''));return Uint8Array.from(bytes,c=>c.charCodeAt(0));}
async function jwt(header:Record<string,string>,claims:Record<string,unknown>,privateKey:string,rsa:boolean){
 const algorithm=rsa?{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}:{name:'ECDSA',namedCurve:'P-256'};
 const key=await crypto.subtle.importKey('pkcs8',pem(privateKey),algorithm,false,['sign']);
 const content=`${encoded(header)}.${encoded(claims)}`;
 const signature=await crypto.subtle.sign(rsa?{name:'RSASSA-PKCS1-v1_5'}:{name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(content));
 return `${content}.${b64(new Uint8Array(signature))}`;
}
// Keys never go to device code or logs. Cache only the short-lived access token.
let googleCache:{key:string;token:string;expires:number}|undefined;
async function googleToken(env:PushEnv,f:typeof fetch,now:number){
 const key=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${env.FCM_CLIENT_EMAIL}:${env.FCM_PRIVATE_KEY}`));
 const cacheKey=b64(new Uint8Array(key));
 if(googleCache?.key===cacheKey&&googleCache.expires>now+60000)return googleCache.token;
 const assertion=await jwt({alg:'RS256',typ:'JWT'},{iss:env.FCM_CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600},env.FCM_PRIVATE_KEY!,true);
 const r=await f('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!r.ok)throw new PushError();
 const value=await r.json() as {access_token?:string;expires_in?:number};if(!value.access_token)throw new PushError();
 googleCache={key:cacheKey,token:value.access_token,expires:now+Math.min(Number(value.expires_in)||3600,3600)*1000};return value.access_token;
}
export async function sendPush(env:PushEnv,device:PushDevice,f:typeof fetch=fetch,now=Date.now()):Promise<void>{
 if(!pushConfigured(env,device.platform))throw new PushError();
 // Generic lock-screen content: job titles, home addresses and email stay private.
 const title='GazeRadar update',body='Your watchlist has new updates. Open GazeRadar to review them.';
 if(device.platform==='android'){
  if(!/^[a-z][a-z0-9-]{4,62}$/.test(env.FCM_PROJECT_ID!))throw new PushError();
  const r=await f(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(18000),headers:{authorization:`Bearer ${await googleToken(env,f,now)}`,'content-type':'application/json'},body:JSON.stringify({message:{token:device.token,notification:{title,body},data:{destination:'alerts'},android:{priority:'high',ttl:'86400s',notification:{channel_id:'gazeradar-alerts',icon:'ic_stat_radar'}}}})});
  if(!r.ok){let unregistered=false;try{const e=await r.json() as {error?:{details?:{errorCode?:string}[]}};unregistered=!!e.error?.details?.some(d=>d.errorCode==='UNREGISTERED');}catch{}throw new PushError(unregistered);}
 }else{
  const token=await jwt({alg:'ES256',kid:env.APNS_KEY_ID!},{iss:env.APNS_TEAM_ID,iat:Math.floor(now/1000)},env.APNS_PRIVATE_KEY!,false);
  const host=device.environment==='sandbox'?'api.sandbox.push.apple.com':'api.push.apple.com';
  const r=await f(`https://${host}/3/device/${device.token}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(18000),headers:{authorization:`bearer ${token}`,'apns-topic':env.APNS_BUNDLE_ID!,'apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(now/1000)+86400),'content-type':'application/json'},body:JSON.stringify({aps:{alert:{title,body},sound:'default'},destination:'alerts'})});
  if(!r.ok){let reason='';try{reason=(await r.json() as {reason?:string}).reason||'';}catch{}throw new PushError(r.status===410||reason==='BadDeviceToken'||reason==='Unregistered');}
 }
}
