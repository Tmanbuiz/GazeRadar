import {jsonBody} from '../../../../lib/request-body';
import {env} from 'cloudflare:workers';
import {unsubscribe} from '../../../../lib/notifications';
import {sameOriginRequest} from '../../../../lib/login';
export async function POST(req:Request){try{
 if(!sameOriginRequest(req)||!env.DB)throw new Error('Unable to process this request. Try your email settings after signing in.');
 const b=await jsonBody<{owner?:string;token?:string}>(req);await unsubscribe(env.DB,env.AUTH_SECRET||'',String(b.owner||''),String(b.token||''));return Response.json({ok:true});
}catch(e){return Response.json({error:e instanceof Error?e.message:'Unable to unsubscribe. Try again.'},{status:400});}}
