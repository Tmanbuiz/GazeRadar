import {jsonBody} from '../../../lib/request-body';
import {context,failure} from '../../../lib/server';
import {emptyJobs,emptyHousing,housingProfile,jobProfile,jsonValue} from '../../../lib/preferences';
export async function GET(req:Request){try{
 const {owner,db}=await context(req),rows=await db.prepare('SELECT kind,content FROM profiles WHERE owner=?').bind(owner).all<{kind:string;content:string}>();
 return Response.json({jobs:jsonValue(rows.results.find(r=>r.kind==='jobs')?.content,emptyJobs),housing:jsonValue(rows.results.find(r=>r.kind==='housing')?.content,emptyHousing)},{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
export async function PUT(req:Request){try{
 const {owner,db}=await context(req);
 const b=await jsonBody<{kind:string;profile:Record<string,unknown>}>(req);if(!b.profile||!['jobs','housing'].includes(b.kind))throw new Error('Choose a profile to update.');
 const content=b.kind==='jobs'?jobProfile(b.profile):housingProfile(b.profile);
 await db.prepare('INSERT INTO profiles (id,owner,kind,content,updated) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content=excluded.content,updated=excluded.updated').bind(`${owner}:${b.kind}`,owner,b.kind,JSON.stringify(content),Date.now()).run();
 return Response.json({ok:true,profile:content});
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{
 const {owner,db}=await context(req),kind=new URL(req.url).searchParams.get('kind');if(!['jobs','housing'].includes(String(kind)))throw new Error('Choose a profile to delete.');
 await db.prepare('DELETE FROM profiles WHERE owner=? AND kind=?').bind(owner,kind).run();return Response.json({ok:true});
}catch(e){return failure(e);}}
