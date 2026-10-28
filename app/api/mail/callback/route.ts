import {env} from 'cloudflare:workers';
import {context} from '../../../../lib/server';
import {readCookie,safeEqual,sha256Hex} from '../../../../lib/login';
import {accountEmail,callbackUrl,exchange,mailReady,seal,unseal,type MailProvider} from '../../../../lib/user-mail';
export async function GET(req:Request){
 let ok=false;
 try{
 const {owner,db}=await context(req),u=new URL(req.url),state=u.searchParams.get('state')||'',cookie=readCookie(req.headers.get('cookie'),'__Host-gz_mail_oauth')||'',code=u.searchParams.get('code');
 if(state.length!==43||!safeEqual(state,cookie)||!code||code.length>4096)throw new Error('Invalid connection state.');
 const flow=await db.prepare('DELETE FROM mail_oauth WHERE id=? AND owner=? AND expires>? RETURNING provider,verifier').bind(await sha256Hex(state),owner,Date.now()).first<{provider:MailProvider;verifier:string}>();
 if(!flow||!mailReady(env,flow.provider))throw new Error('Expired connection.');
 const verifier=await unseal(env.MAIL_TOKEN_KEY!,owner+state,flow.verifier);
 const t=await exchange(env,flow.provider,{grant_type:'authorization_code',code,redirect_uri:callbackUrl(env),code_verifier:verifier});
 const scopes=(t.scope||'').split(' ');if(!t.refresh_token||!(flow.provider==='google'?scopes.includes('https://www.googleapis.com/auth/gmail.send'):scopes.some(s=>s==='Mail.Send'||s.endsWith('/Mail.Send'))))throw new Error('Sending permission was not granted.');
 const email=await accountEmail(flow.provider,t.access_token!);
 await db.prepare('INSERT INTO mail_accounts (owner,provider,email,refresh,updated) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET provider=excluded.provider,email=excluded.email,refresh=excluded.refresh,updated=excluded.updated').bind(owner,flow.provider,email,await seal(env.MAIL_TOKEN_KEY!,owner,t.refresh_token),Date.now()).run();ok=true;
 }catch{/* Never return OAuth codes, tokens, provider error bodies or details. */}
 return new Response(null,{status:303,headers:{location:new URL('/?mail='+(ok?'connected':'connection-failed')+'#jobs',req.url).href,'cache-control':'no-store','referrer-policy':'no-referrer','set-cookie':'__Host-gz_mail_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'}});
}
