import {jobCandidates,LINKED_JOB_LIMIT} from './job-discovery.ts';
import {pageLines,readPage,validUrl,type Link} from './monitor.ts';
import {structuredListings} from './structured.ts';
import type {Job,Home} from './matching.ts';
export type SourcePage={lines:string[];links:Link[];jobs:Job[];homes:Home[];truncated:boolean;structured:boolean};
export function jobFeed(input:string):{kind:'greenhouse'|'lever';url:string}|null {
 const u=new URL(validUrl(input)),parts=u.pathname.split('/').filter(Boolean),token=parts[0];
 if(parts.length!==1||!token||!/^[a-z0-9_-]{1,100}$/i.test(token))return null;
 if(['boards.greenhouse.io','job-boards.greenhouse.io'].includes(u.hostname))return {kind:'greenhouse',url:`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`};
 if(['jobs.lever.co','jobs.eu.lever.co'].includes(u.hostname))return {kind:'lever',url:`https://${u.hostname==='jobs.eu.lever.co'?'api.eu.lever.co':'api.lever.co'}/v0/postings/${encodeURIComponent(token)}?mode=json&limit=100`};
 return null;
}
// Providers are fixed official endpoints, never a proxy to arbitrary JSON destinations.
async function feedJson(url:string,f:typeof fetch):Promise<unknown>{
 const r=await f(url,{redirect:'manual',signal:AbortSignal.timeout(18000),headers:{accept:'application/json'}});
 if(!r.ok){await r.body?.cancel();throw new Error(`Job source returned ${r.status}. Review the source URL or try later.`);}
 const reader=r.body?.getReader();if(!reader)throw new Error('The job source returned an empty response.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4000000){await reader.cancel();throw new Error('This job source is too large. Use a smaller careers page.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
type Row=Record<string,unknown>;
const obj=(x:unknown):Row=>x&&typeof x==='object'?x as Row:{};
const s=(x:unknown)=>typeof x==='string'?x.slice(0,12000):'';
function destination(v:unknown):string|null {try{return validUrl(s(v));}catch{return null;}}
export async function readSource(url:string,category:string,f:typeof fetch=fetch):Promise<SourcePage> {
 const feed=category==='jobs'?jobFeed(url):null;
 if(feed){
  const payload=await feedJson(feed.url,f),rows=feed.kind==='greenhouse'?obj(payload).jobs:payload;
  if(!Array.isArray(rows))throw new Error('The job source returned an unexpected format. Try the employer’s careers page.');
  const jobs:Job[]=[];
  for(const entry of rows.slice(0,100)){
   const r=obj(entry),cat=obj(r.categories),href=destination(r.absolute_url??r.hostedUrl);if(!href)continue;
   const description=pageLines(`<p>${s(r.content??r.descriptionPlain??r.description)}</p>`).join('\n');
   const location=s(obj(r.location).name??cat.location);
   jobs.push({url:href,title:s(r.title??r.text).slice(0,200)||'Job posting',company:s(cat.team??r.company_name).slice(0,200),location,description,employment:s(cat.commitment),remote:r.workplaceType==='remote'||/\bremote\b/i.test(location),salary:null,salaryUnit:'',currency:'',expires:null});
  }
  return {jobs,homes:[],lines:jobs.map(j=>`${j.title} ${j.location}`),links:[],truncated:rows.length>=100,structured:true};
 }
 const page=await readPage(url,f,category!=='website'),data=structuredListings(page.html,page.url);
 if(category==='jobs'&&!data.jobs.length){
  const candidates=jobCandidates(page.links,page.url);
  const discovered=await Promise.allSettled(candidates.slice(0,LINKED_JOB_LIMIT).map(async href=>{
   const detail=await readPage(href,f,true);
   return structuredListings(detail.html,detail.url).jobs;
  }));
  const jobs=discovered.flatMap(r=>r.status==='fulfilled'?r.value:[]);
  if(jobs.length){
   const unique=[...new Map(jobs.map(j=>[j.url,j])).values()];
   // Linked pages are a sample, not a complete employer feed. Never infer that
   // jobs missing from this sample have closed or disappeared.
   return {...page,jobs:unique,homes:[],truncated:true,structured:true};
  }
 }
 const structured=category==='jobs'?data.jobs.length>0:category==='housing'?data.homes.length>0:false;
 if(!structured&&page.lines.join('').length<120)throw new Error('Not enough readable text or listing data. Try a direct source URL or check again later.');
 return {...page,...data,truncated:page.truncated||data.truncated,structured};
}
