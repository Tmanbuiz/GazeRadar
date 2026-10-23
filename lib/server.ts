import { env } from 'cloudflare:workers';
export function context(req:Request) {
 const owner=req.headers.get('oai-authenticated-user-id');if(!owner)throw new Error('SIGN_IN');
 if(req.method!=='GET'){const origin=req.headers.get('origin');if(origin && origin!==new URL(req.url).origin)throw new Error('Invalid request origin.');}
 if(!env.DB)throw new Error('Database is not available.');return {owner,db:env.DB};
}
export function failure(e:unknown){const message=e instanceof Error?e.message:'Something went wrong.';return Response.json({error:message==='SIGN_IN'?'Sign in to manage your watches.':message},{status:message==='SIGN_IN'?401:400});}
