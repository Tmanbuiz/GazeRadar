import {env} from 'cloudflare:workers';
import {context,failure} from '../../../lib/server';
import {jsonBody} from '../../../lib/request-body';
import {reviewedApplication,reserveApplication} from '../../../lib/application-send';
import {accountToken,deliverApplication,mailReady,type MailAccount} from '../../../lib/user-mail';
export async function GET(req:Request){try{const {owner,db}=await context(req);const r=await db.prepare('SELECT id,recipient,sender,title,job_url,status,created FROM applications WHERE owner=? ORDER BY created DESC LIMIT 50').bind(owner).all();return Response.json(r.results,{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){
 let attempt:{id:string;owner:string;db:D1Database}|undefined;
 try{
 const {owner,db}=await context(req);const a=reviewedApplication(await jsonBody<Record<string,unknown>>(req,3000000));
 const account=await db.prepare('SELECT * FROM mail_accounts WHERE owner=?').bind(owner).first<MailAccount>();
 if(!account||!mailReady(env,account.provider))throw new Error('Connect your own Gmail or Outlook account first.');
 if(account.email!==a.sender)throw new Error('Your connected sender changed. Review the application again.');
 const token=await accountToken(env,db,account);
 await reserveApplication(db,owner,a,Date.now());attempt={id:a.id,owner,db};
 await deliverApplication(account.provider,account.email,token,a);
 await db.prepare("UPDATE applications SET status='accepted' WHERE id=? AND owner=?").bind(a.id,owner).run();
 return Response.json({ok:true,status:'accepted'},{headers:{'cache-control':'no-store'}});
 }catch(e){if(attempt){await attempt.db.prepare("UPDATE applications SET status='unknown' WHERE id=? AND owner=?").bind(attempt.id,attempt.owner).run().catch(()=>{});return Response.json({error:'Delivery status is uncertain. Check your email Sent folder before sending again. No automatic retry was made.'},{status:502});}return failure(e);}
}
