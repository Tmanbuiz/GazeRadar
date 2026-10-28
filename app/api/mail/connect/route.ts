import {env} from 'cloudflare:workers';
import {context,failure} from '../../../../lib/server';
import {jsonBody} from '../../../../lib/request-body';
import {sha256Hex,toBase64Url} from '../../../../lib/login';
import {callbackUrl,mailReady,providerConfig,providers,seal,type MailProvider} from '../../../../lib/user-mail';
export async function POST(req:Request){try{
 const {owner,db}=await context(req);const {provider}=await jsonBody<{provider:MailProvider}>(req,1000);if(!providers.includes(provider)||!mailReady(env,provider))throw new Error('This email provider is not configured yet.');
 const redirect=callbackUrl(env);if(new URL(redirect).origin!==new URL(req.url).origin)throw new Error('Email callback origin is not configured correctly.');
 const state=toBase64Url(crypto.getRandomValues(new Uint8Array(32))),verifier=toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
 const now=Date.now();await db.batch([db.prepare('DELETE FROM mail_oauth WHERE owner=? OR expires<?').bind(owner,now),db.prepare('INSERT INTO mail_oauth (id,owner,provider,verifier,expires) VALUES (?,?,?,?,?)').bind(await sha256Hex(state),owner,provider,await seal(env.MAIL_TOKEN_KEY!,owner+state,verifier),now+600000)]);
 const c=providerConfig(env,provider),u=new URL(c.authorize);u.search=new URLSearchParams({client_id:c.id!,response_type:'code',redirect_uri:redirect,scope:c.scope,state,code_challenge:toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))),code_challenge_method:'S256',prompt:provider==='google'?'consent select_account':'select_account',...(provider==='google'?{access_type:'offline'}:{response_mode:'query'})}).toString();
 return Response.json({url:u.href},{headers:{'cache-control':'no-store','set-cookie':`__Host-gz_mail_oauth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`}});
}catch(e){return failure(e);}}
