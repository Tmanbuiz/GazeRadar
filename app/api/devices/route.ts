import {env} from 'cloudflare:workers';
import {context,failure} from '../../../lib/server';
import {jsonBody} from '../../../lib/request-body';
import {registerPush,removePush} from '../../../lib/push';
import {pushConfigured} from '../../../lib/push-provider';
export async function GET(req:Request){try{const {owner,db}=await context(req);const rows=await db.prepare('SELECT id,platform,enabled,created,error FROM push_devices WHERE owner=? ORDER BY created DESC').bind(owner).all();return Response.json({devices:rows.results,configured:{android:pushConfigured(env,'android'),ios:pushConfigured(env,'ios')}},{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{const {owner,db}=await context(req),value=await jsonBody<Record<string,unknown>>(req);if(!pushConfigured(env,String(value.platform)))throw new Error('Push delivery is not configured for this platform yet.');return Response.json(await registerPush(db,owner,value));}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{const {owner,db}=await context(req),body=await jsonBody<{id?:string}>(req);if(!body.id)throw new Error('Choose a device.');await removePush(db,owner,body.id);return Response.json({ok:true});}catch(e){return failure(e);}}
