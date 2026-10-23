// Verify Cloudflare Access identity; never trust a user-ID header supplied by a client.
function decode(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function verifyAccessToken(token:string,teamDomain:string,audience:string,fetcher:typeof fetch=fetch):Promise<string|null>{
 try{
  if(!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(teamDomain)||!audience||token.length>16000)return null;
  const parts=token.split('.');if(parts.length!==3)return null;
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
  const now=Date.now()/1000;
  if(payload.iss!==`https://${teamDomain}`||typeof payload.exp!=='number'||payload.exp<=now||typeof payload.sub!=='string'||!payload.sub)return null;
  if(payload.nbf!==undefined&&(typeof payload.nbf!=='number'||payload.nbf>now+30))return null;
  const audiences=Array.isArray(payload.aud)?payload.aud:[payload.aud];if(!audiences.includes(audience))return null;
  const res=await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(10000)});if(!res.ok)return null;
  const jwks=await res.json() as {keys:(JsonWebKey&{kid?:string})[]};const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  return ok?`cloudflare-access:${payload.sub}`:null;
 }catch{return null;}
}
