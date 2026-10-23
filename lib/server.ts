import {env} from 'cloudflare:workers';
import {authenticatedOwner} from './auth';
export async function context(req:Request){
 const owner=await authenticatedOwner(req.headers);if(!owner)throw new Error('SIGN_IN');
 if(req.method!=='GET'){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new Error('Invalid request origin.');}
 if(!env.DB)throw new Error('Database is not available.');return {owner,db:env.DB};
}
export function failure(e:unknown){const message=e instanceof Error?e.message:'Unable to complete the request. Try again.';return Response.json({error:message==='SIGN_IN'?'Cloudflare Access sign-in is required. Configure Access for this hostname, then sign in and try again.':message},{status:message==='SIGN_IN'?401:400});}
