import {jsonBody} from '../../../lib/request-body';
import {context,failure} from '../../../lib/server';
import {emptyJobs,emptyHousing,jsonValue} from '../../../lib/preferences';
import {matchJob,matchHome,type Job,type Home} from '../../../lib/matching';
import {listOpportunityRows,opportunityStates,updateOpportunityState,type OpportunityState} from '../../../lib/opportunities';
export async function GET(req:Request){try{
 const {owner,db}=await context(req),kind=new URL(req.url).searchParams.get('kind');if(!['jobs','housing'].includes(String(kind)))throw new Error('Choose Jobs or Housing.');
 const p=await db.prepare('SELECT content FROM profiles WHERE owner=? AND kind=?').bind(owner,kind).first<{content:string}>();
 const rows=await listOpportunityRows(db,owner,String(kind));
 const seen=new Set<string>();
 const data=rows.map(r=>{const listing=jsonValue<Job|Home|null>(r.content,null);if(!listing)return null;const match=kind==='jobs'?matchJob(listing as Job,jsonValue(p?.content,emptyJobs)):matchHome(listing as Home,jsonValue(p?.content,emptyHousing));return {...r,listing,match,content:undefined};})
  .filter(r=>{if(!r)return false;const key=String(r.url);if(seen.has(key))return false;seen.add(key);return true;});
 return Response.json(data,{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{
 const {owner,db}=await context(req),b=await jsonBody<{id?:string;state?:string}>(req);
 if(!b.id||!opportunityStates.includes(b.state as OpportunityState))throw new Error('Choose a valid saved-item status.');
 // Keep a URL’s state consistent if it occurs on several sources belonging to this account.
 await updateOpportunityState(db,owner,b.id,b.state as OpportunityState);return Response.json({ok:true});
}catch(e){return failure(e);}}
