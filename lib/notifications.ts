import {hmacHex,safeEqual,hit} from './login.ts';
import {sendMail,zohoConfigured,type ZohoEnv,type MailMessage} from './zoho-mail.ts';
import {jsonValue,type Frequency} from './preferences.ts';
import {validUrl} from './monitor.ts';
export type MailEnv=ZohoEnv&{AUTH_SECRET?:string;APP_URL?:string};
export const digestPeriod=(frequency:Frequency)=>frequency==='weekly'?7*86400000:86400000;
type Preference={owner:string;frequency:Frequency;no_change:number;next_digest:number;attempts:number;email:string};
type Event={id:string;name:string;url:string;content:string;created:number};
export async function unsubscribeToken(secret:string,owner:string){return hmacHex(secret,`gazeradar-unsubscribe:${owner}`);}
export async function unsubscribe(db:D1Database,secret:string,owner:string,token:string){
 if(!secret||!owner||owner.length>200||!/^[a-f0-9]{64}$/.test(token)||!safeEqual(await unsubscribeToken(secret,owner),token))throw new Error('This unsubscribe link is invalid. Sign in and change your email settings.');
 await db.batch([db.prepare("UPDATE notifications SET frequency='off',sending_until=0,updated=? WHERE owner=?").bind(Date.now(),owner),db.prepare('UPDATE events SET emailed=1 WHERE owner=?').bind(owner)]);
}
function summary(raw:string):string[]{const a=jsonValue<unknown>(raw,[]);if(Array.isArray(a))return a.map(String).slice(0,5);if(a&&typeof a==='object'&&Array.isArray((a as {items?:unknown}).items))return (a as {items:{t?:unknown}[]}).items.slice(0,5).map(i=>String(i.t??''));return [];}
export function alertMessage(rows:Event[],counts:{active:number;failed:number;never:number},base:string,unsubscribeUrl:string):MailMessage {
 const content=[rows.length?`${rows.length} watched source update${rows.length===1?'':'s'} to review.`:'No matching changes were detected in this summary period.',
  ...rows.slice(0,30).map(e=>`\n${e.name}\nDetected: ${new Date(e.created).toISOString()}\n${summary(e.content).map(t=>`• ${t}`).join('\n')}\nSource: ${validUrl(e.url)}`),
  `\nMonitoring status: ${counts.active} active watches; ${counts.failed} currently have a failed check; ${counts.never} have not had a successful check. No alert does not establish that a page stayed unchanged.`,
  `\nOpen GazeRadar: ${base}\nManage email preferences: ${base}\nStop watch emails: ${unsubscribeUrl}`,
  '\nChanges are reported after a successful check. Always review the original source. A missing listing does not confirm a sale.'];
 return {subject:rows.length?`GazeRadar: ${rows.length} watch update${rows.length===1?'':'s'}`:'Your GazeRadar watchlist summary',content:content.join('\n')};
}
export async function deliverNotifications({db,env,now=Date.now(),send}:{db:D1Database;env:MailEnv;now?:number;send?:(to:string,message:MailMessage)=>Promise<void>}):Promise<{sent:number;failed:number;configured:boolean}> {
 if(!env.AUTH_SECRET||(!send&&!zohoConfigured(env)))return {sent:0,failed:0,configured:false};
 const base=validUrl(env.APP_URL||'https://gazeradar.wiantribe.com').replace(/\/$/,'');
 const prefs=await db.prepare("SELECT n.*,u.email FROM notifications n JOIN users u ON n.owner='email-otp:'||u.id WHERE n.frequency!='off' AND n.sending_until<? AND n.retry_at<=? AND ((n.frequency='change' AND EXISTS (SELECT 1 FROM events e JOIN watches w ON w.id=e.watch_id AND w.owner=e.owner WHERE e.owner=n.owner AND e.emailed=0 AND w.email_enabled=1)) OR (n.frequency IN ('daily','weekly') AND n.next_digest<=?)) ORDER BY n.last_sent ASC LIMIT 3").bind(now,now,now).all<Preference>();
 let sent=0,failed=0;
 for(const p of prefs.results){
  const claim=await db.prepare("UPDATE notifications SET sending_until=? WHERE owner=? AND sending_until<? AND frequency!='off'").bind(now+180000,p.owner,now).run();if(!claim.meta.changes)continue;
  try{
   const rows=await db.prepare('SELECT e.id,e.name,e.url,e.content,e.created FROM events e JOIN watches w ON w.id=e.watch_id AND w.owner=e.owner WHERE e.owner=? AND e.emailed=0 AND w.email_enabled=1 ORDER BY e.created ASC LIMIT 31').bind(p.owner).all<Event>();
   if(!rows.results.length&&(p.frequency==='change'||!p.no_change)){
    await db.prepare('UPDATE notifications SET sending_until=0,next_digest=? WHERE owner=?').bind(now+digestPeriod(p.frequency),p.owner).run();continue;
   }
   if(!(await hit(db,'alerts:day',200,86400000,now))||!(await hit(db,'global:day',300,86400000,now)))throw new Error('Daily email limit reached.');
   const stats=await db.prepare('SELECT COUNT(*) AS active,SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) AS failed,SUM(CASE WHEN last_ok IS NULL THEN 1 ELSE 0 END) AS never FROM watches WHERE owner=? AND active=1').bind(p.owner).first<{active:number;failed:number;never:number}>();
   const link=`${base}/unsubscribe?owner=${encodeURIComponent(p.owner)}&token=${await unsubscribeToken(env.AUTH_SECRET,p.owner)}`;
   const batch=rows.results.slice(0,30),message=alertMessage(batch,stats??{active:0,failed:0,never:0},base,link);
   await (send?send(p.email,message):sendMail(env,db,fetch,p.email,message,now));
   const statements=batch.map(e=>db.prepare('UPDATE events SET emailed=1 WHERE id=? AND owner=?').bind(e.id,p.owner));
   statements.push(db.prepare('UPDATE notifications SET sending_until=0,last_sent=?,next_digest=?,attempts=0,retry_at=0,error=NULL WHERE owner=?').bind(now,rows.results.length>30?now:now+digestPeriod(p.frequency),p.owner));
   await db.batch(statements);sent++;
  }catch{
   failed++;
   await db.prepare('UPDATE notifications SET sending_until=0,attempts=attempts+1,retry_at=?,error=? WHERE owner=?').bind(now+Math.min(21600000,900000*2**Math.min(p.attempts,5)),'Email could not be delivered. We will retry. Review your Zoho setup if this continues.',p.owner).run();
  }
 }
 return {sent,failed,configured:true};
}
