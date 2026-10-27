import {env} from 'cloudflare:workers';
import {context,failure} from '../../../../lib/server';
import {readGoalShare,createGoalShare,revokeGoalShare} from '../../../../lib/goals';
export async function GET(req:Request){try{
 if(!env.DB)return new Response('Share unavailable',{status:503});
 const data=await readGoalShare(env.DB,new URL(req.url).searchParams.get('token')||'');
 if(!data)return new Response('This share link has expired or been revoked.',{status:404});
 return Response.json(data,{headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-robots-tag':'noindex'}});
}catch{return new Response('Share unavailable',{status:503});}}
export async function POST(req:Request){try{const {owner,db}=await context(req);return Response.json(await createGoalShare(db,owner),{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{const {owner,db}=await context(req);await revokeGoalShare(db,owner);return Response.json({ok:true});}catch(e){return failure(e);}}
