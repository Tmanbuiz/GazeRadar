import {normalizeEmail,toBase64Url} from './login.ts';
export type MailProvider='google'|'microsoft';
export type UserMailEnv={APP_URL?:string;MAIL_TOKEN_KEY?:string;GOOGLE_MAIL_CLIENT_ID?:string;GOOGLE_MAIL_CLIENT_SECRET?:string;MICROSOFT_MAIL_CLIENT_ID?:string;MICROSOFT_MAIL_CLIENT_SECRET?:string};
export const providers=['google','microsoft'] as const;
export function providerConfig(env:UserMailEnv,p:MailProvider){
 const google=p==='google';return {id:google?env.GOOGLE_MAIL_CLIENT_ID:env.MICROSOFT_MAIL_CLIENT_ID,secret:google?env.GOOGLE_MAIL_CLIENT_SECRET:env.MICROSOFT_MAIL_CLIENT_SECRET,
 authorize:google?'https://accounts.google.com/o/oauth2/v2/auth':'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',token:google?'https://oauth2.googleapis.com/token':'https://login.microsoftonline.com/common/oauth2/v2.0/token',
 scope:google?'openid email https://www.googleapis.com/auth/gmail.send':'openid email profile offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send'};
}
export function mailReady(env:UserMailEnv,p:MailProvider){const c=providerConfig(env,p);return !!(c.id&&c.secret&&env.MAIL_TOKEN_KEY&&env.MAIL_TOKEN_KEY.length>=32&&env.APP_URL);}
export function callbackUrl(env:UserMailEnv){const u=new URL(env.APP_URL||'');if(u.protocol!=='https:'||u.username||u.password)throw new Error('Email connection is not configured.');return u.origin+'/api/mail/callback';}
const enc=new TextEncoder();
export function from64(s:string){const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function key(secret:string){if(secret.length<32)throw new Error('Email connection is not configured.');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode(secret)),'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(secret:string,owner:string,value:string){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(owner)},await key(secret),enc.encode(value));return toBase64Url(iv)+'.'+toBase64Url(new Uint8Array(encrypted));}
export async function unseal(secret:string,owner:string,value:string){const [iv,body]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(iv),additionalData:enc.encode(owner)},await key(secret),from64(body)));}
export async function exchange(env:UserMailEnv,p:MailProvider,params:Record<string,string>,f:typeof fetch=fetch){
 const c=providerConfig(env,p);const r=await f(c.token,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...params,client_id:c.id||'',client_secret:c.secret||''})});
 const d=await r.json().catch(()=>null) as {access_token?:string;refresh_token?:string;scope?:string}|null;
 if(!r.ok||!d||typeof d.access_token!=='string')throw new Error('Reconnect your email account before sending.');return d;
}
export async function accountEmail(p:MailProvider,token:string,f:typeof fetch=fetch){
 const r=await f(p==='google'?'https://openidconnect.googleapis.com/v1/userinfo':'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>null) as {email?:string;email_verified?:boolean;mail?:string;userPrincipalName?:string}|null;
 const email=normalizeEmail(p==='google'?d?.email:(d?.mail||d?.userPrincipalName));if(!r.ok||!email||p==='google'&&d?.email_verified!==true)throw new Error('Unable to verify this email account.');return email;
}
export type MailAccount={owner:string;provider:MailProvider;email:string;refresh:string;updated:number};
export async function accountToken(env:UserMailEnv,db:D1Database,a:MailAccount){
 const old=await unseal(env.MAIL_TOKEN_KEY!,a.owner,a.refresh);
 const t=await exchange(env,a.provider,{grant_type:'refresh_token',refresh_token:old,...(a.provider==='microsoft'?{scope:providerConfig(env,a.provider).scope}:{})});
 if(t.refresh_token&&t.refresh_token!==old)await db.prepare('UPDATE mail_accounts SET refresh=?,updated=? WHERE owner=? AND refresh=?').bind(await seal(env.MAIL_TOKEN_KEY!,a.owner,t.refresh_token),Date.now(),a.owner,a.refresh).run();
 return t.access_token!;
}
export type ApplicationMail={recipient:string;subject:string;body:string;fileName:string;fileType:string;fileBase64:string};
const b64=(s:string)=>toBase64Url(enc.encode(s)).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-toBase64Url(enc.encode(s)).length%4)%4);
const fold=(s:string)=>s.match(/.{1,76}/g)?.join('\r\n')||'';
export function gmailRaw(sender:string,m:ApplicationMail){
 const boundary='gazeradar_'+crypto.randomUUID().replace(/-/g,'');
 return toBase64Url(enc.encode([`From: ${sender}`,`To: ${m.recipient}`,`Subject: =?UTF-8?B?${b64(m.subject)}?=`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',fold(b64(m.body)),`--${boundary}`,`Content-Type: ${m.fileType}; name="${m.fileName}"`,`Content-Disposition: attachment; filename="${m.fileName}"`,'Content-Transfer-Encoding: base64','',fold(m.fileBase64),`--${boundary}--`,''].join('\r\n')));
}
export async function deliverApplication(p:MailProvider,sender:string,token:string,m:ApplicationMail,f:typeof fetch=fetch){
 const url=p==='google'?'https://gmail.googleapis.com/gmail/v1/users/me/messages/send':'https://graph.microsoft.com/v1.0/me/sendMail';
 const body=p==='google'?{raw:gmailRaw(sender,m)}:{message:{subject:m.subject,body:{contentType:'Text',content:m.body},toRecipients:[{emailAddress:{address:m.recipient}}],attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:m.fileName,contentType:m.fileType,contentBytes:m.fileBase64}]},saveToSentItems:true};
 // Sending is intentionally attempted once. A timeout may mean it was sent.
 const r=await f(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(25000)});
 if(p==='microsoft'&&r.status===202)return;
 if(p==='google'&&r.ok){const d=await r.json().catch(()=>null) as {id?:string}|null;if(d?.id)return;}
 throw new Error('The email provider did not confirm acceptance. Check Sent mail before trying again.');
}
