import {jsonBody} from '../../../lib/request-body';
import {env} from 'cloudflare:workers';
import {context,failure} from '../../../lib/server';
import {frequencies,type Frequency} from '../../../lib/preferences';
import {digestPeriod} from '../../../lib/notifications';
import {zohoConfigured} from '../../../lib/zoho-mail';
import {watchLimit} from '../../../lib/watch-capacity';
export async function GET(req:Request){try{
 const {owner,db}=await context(req),p=await db.prepare('SELECT frequency,no_change,next_digest,last_sent,error FROM notifications WHERE owner=?').bind(owner).first();
 const u=await db.prepare("SELECT email FROM users WHERE 'email-otp:'||id=?").bind(owner).first<{email:string}>();
 const scheduler=await db.prepare("SELECT window_start FROM throttle WHERE key='scheduler:last_run'").first<{window_start:number}>();
 return Response.json({preferences:p??{frequency:'off',no_change:0,last_sent:null,error:null},email:u?.email??null,mailConfigured:zohoConfigured(env)&&!!env.AUTH_SECRET,lastScheduledRun:scheduler?.window_start??null,watchLimit:await watchLimit(db,owner,env.WATCH_UNLIMITED_EMAIL_HASHES)},{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
export async function PUT(req:Request){try{
 const {owner,db}=await context(req),b=await jsonBody<{frequency?:unknown;noChange?:unknown}>(req);
 if(!frequencies.includes(b.frequency as Frequency))throw new Error('Choose an email frequency.');
 const u=await db.prepare("SELECT email FROM users WHERE 'email-otp:'||id=?").bind(owner).first();if(!u&&b.frequency!=='off')throw new Error('Sign in with an email code to verify your delivery address.');
 const now=Date.now();
 await db.batch([db.prepare("UPDATE events SET emailed=1 WHERE owner=? AND (?='off' OR NOT EXISTS (SELECT 1 FROM notifications WHERE owner=? AND frequency!='off'))").bind(owner,b.frequency,owner),db.prepare('INSERT INTO notifications (owner,frequency,no_change,next_digest,updated) VALUES (?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET frequency=excluded.frequency,no_change=excluded.no_change,next_digest=excluded.next_digest,attempts=0,retry_at=0,error=NULL,updated=excluded.updated')
  .bind(owner,b.frequency,b.noChange===true?1:0,now+digestPeriod(b.frequency as Frequency),now)]);
 return Response.json({ok:true});
}catch(e){return failure(e);}}
