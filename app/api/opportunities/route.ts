import {jsonBody} from '../../../lib/request-body';
import {context,failure} from '../../../lib/server';
import {emptyJobs,emptyHousing,jsonValue} from '../../../lib/preferences';
import {matchJob,matchHome,type Job,type Home} from '../../../lib/matching';
export async function GET(req:Request){try{
 const {owner,db}=await context(req),kind=new URL(req.url).searchParams.get('kind');if(!['jobs','housing'].includes(String(kind)))throw new Error('Choose Jobs or Housing.');
 const p=await db.prepare('SELECT content FROM profiles WHERE owner=? AND kind=?').bind(owner,kind).first<{content:string}>();
 const rows=await db.prepare('SELECT o.*,w.name AS source_name FROM opportunities o JOIN watches w ON w.id=o.watch_id AND w.owner=o.owner WHERE o.owner=? AND o.category=? ORDER BY o.updated DESC LIMIT 500').bind(owner,kind).all<{content:string;url:string;state:string;available:number;[key:string]:unknown}>();
 const seen=new Set<string>();
 const data=rows.results.map(r=>{const listing=jsonValue<Job|Home|null>(r.content,null);if(!listing)return null;const match=kind==='jobs'?matchJob(listing as Job,jsonValue(p?.content,emptyJobs)):matchHome(listing as Home,jsonValue(p?.content,emptyHousing));return {...r,listing,match,content:undefined};})
  .filter(r=>{if(!r)return false;const key=String(r.url);if(seen.has(key))return false;seen.add(key);return true;});
 return Response.json(data,{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{
 const {owner,db}=await context(req),b=await jsonBody<{id?:string;state?:string}>(req);
 if(!b.id||!['new','saved','applied','dismissed'].includes(String(b.state)))throw new Error('Choose a valid saved-item status.');
 // Keep a URL’s state consistent if it occurs on several sources belonging to this account.
 await db.prepare('UPDATE opportunities SET state=? WHERE owner=? AND url=(SELECT url FROM opportunities WHERE id=? AND owner=?)').bind(b.state,owner,b.id,owner).run();return Response.json({ok:true});
}catch(e){return failure(e);}}
