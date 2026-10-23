import {env} from 'cloudflare:workers';
import {authenticatedOwner} from './auth';
import {sameOriginRequest} from './login';
export async function context(req:Request){
 if(req.method!=='GET'&&!sameOriginRequest(req))throw new Error('Invalid request origin.');
 const owner=await authenticatedOwner(req.headers);if(!owner)throw new Error('SIGN_IN');
 if(!env.DB)throw new Error('Database is not available.');return {owner,db:env.DB};
}
export function failure(e:unknown){const message=e instanceof Error?e.message:'Unable to complete the request. Try again.';return Response.json({error:message==='SIGN_IN'?'Please sign in to continue.':message},{status:message==='SIGN_IN'?401:400});}
