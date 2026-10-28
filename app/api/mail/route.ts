import {env} from 'cloudflare:workers';
import {context,failure} from '../../../lib/server';
import {mailReady} from '../../../lib/user-mail';
export async function GET(req:Request){try{const {owner,db}=await context(req);const account=await db.prepare('SELECT provider,email FROM mail_accounts WHERE owner=?').bind(owner).first();return Response.json({account,configured:{google:mailReady(env,'google'),microsoft:mailReady(env,'microsoft')}},{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{const {owner,db}=await context(req);await db.batch([db.prepare('DELETE FROM mail_accounts WHERE owner=?').bind(owner),db.prepare('DELETE FROM mail_oauth WHERE owner=?').bind(owner)]);return Response.json({ok:true},{headers:{'cache-control':'no-store'}});}catch{ return Response.json({error:'Unable to disconnect this email account.'},{status:400});}}
