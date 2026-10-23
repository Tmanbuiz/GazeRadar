import {env} from 'cloudflare:workers';
import {LoginError,SESSION_COOKIE,clearedCookie,endSession,normalizeEmail,readCookie,requestCode,sameOriginRequest,sessionCookie,verifyCode} from './login';
import {sendLoginCode,verifyTurnstile,zohoConfigured} from './zoho-mail';
import {identity} from './auth';

export const clientIp=(req:Request)=>req.headers.get('cf-connecting-ip')||'unknown';
const json=(body:unknown,status=200,headers?:Record<string,string>)=>Response.json(body,{status,headers:{'cache-control':'no-store',...headers}});
const fail=(e:unknown)=>e instanceof LoginError?json({error:e.message},e.status):json({error:'Something went wrong. Please try again.'},500);
async function body(req:Request){if(!sameOriginRequest(req))throw new LoginError('Invalid request origin.',403);try{return await req.json() as Record<string,unknown>;}catch{throw new LoginError('Invalid request.');}}
function database(){if(!env.DB)throw new LoginError('Database is not available.',503);return env.DB;}

export async function handleRequest(req:Request){try{
 const b=await body(req);const email=normalizeEmail(b.email);if(!email)throw new LoginError('Enter a valid email address.');
 const ip=clientIp(req);
 if(!(await verifyTurnstile(env.TURNSTILE_SECRET,b.turnstile,ip,fetch)))throw new LoginError('Please complete the check and try again.',400);
 const db=database();
 await requestCode({db,secret:env.AUTH_SECRET||'',email,ip,now:Date.now(),send:(to,code)=>sendLoginCode(env,db,fetch,to,code)});
 return json({ok:true});
}catch(e){return fail(e);}}

export async function handleVerify(req:Request){try{
 const b=await body(req);const email=normalizeEmail(b.email);if(!email)throw new LoginError('Enter a valid email address.');
 const s=await verifyCode({db:database(),secret:env.AUTH_SECRET||'',email,code:String(b.code||'').replace(/\s/g,''),ip:clientIp(req),now:Date.now()});
 return json({ok:true,email:s.email},200,{'set-cookie':sessionCookie(s.token,s.maxAge)});
}catch(e){return fail(e);}}

export async function handleLogout(req:Request){try{
 await body(req);
 const t=readCookie(req.headers.get('cookie'),SESSION_COOKIE);if(t&&env.DB)await endSession(env.DB,t);
 return json({ok:true},200,{'set-cookie':clearedCookie()});
}catch(e){return fail(e);}}

export async function handleMe(req:Request){
 const who=await identity(req.headers);
 return json({signedIn:!!who,email:who?.email??null,turnstileSiteKey:env.TURNSTILE_SITE_KEY||null,emailSignIn:!!(env.AUTH_SECRET&&env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&zohoConfigured(env))});
}
