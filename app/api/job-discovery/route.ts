import {env} from 'cloudflare:workers';
import {context,failure} from '../../../lib/server';
import {jsonBody} from '../../../lib/request-body';
import {emptyJobs,jobProfile,jsonValue} from '../../../lib/preferences';
import {hit} from '../../../lib/login';
import {matchJob} from '../../../lib/matching';
import {readSource} from '../../../lib/sources';
import {suggestJobWatches} from '../../../lib/watch-suggestions';
import {expandJobTitles} from '../../../lib/groq-job-discovery';

export async function POST(req:Request){try{
 const {owner,db}=await context(req);
 const input=await jsonBody<{useGroq?:boolean}>(req,256);
 const row=await db.prepare("SELECT content FROM profiles WHERE owner=? AND kind='jobs'").bind(owner).first<{content:string}>();
 const profile=jobProfile(jsonValue(row?.content,emptyJobs) as Record<string,unknown>);
 if(!profile.titles.length&&!profile.skills.length)throw new Error('Save job titles or skills before searching.');
 const now=Date.now();
 if(!await hit(db,'job-discovery:'+owner,4,3600000,now)||!await hit(db,'job-discovery:global',100,3600000,now))throw new Error('Search limit reached. Try again in an hour.');
 let titles:string[]=[],ai='off';
 if(input.useGroq===true){
  ai='unavailable';
  if(env.GROQ_API_KEY)try{titles=await expandJobTitles(profile,env.GROQ_API_KEY);ai='used';}catch{/* Continue with saved preferences. */}
 }
 const expanded={...profile,titles:[...new Set([...profile.titles,...titles])]};
 const suggestions=suggestJobWatches({...expanded,titles:[...new Set([...(profile.titles.slice(0,1)),...titles,...profile.titles])]});
 const employer=suggestions.filter(s=>!s.url.includes('jobbank.gc.ca')&&!s.url.includes('workopolis.com'));
 const boards=suggestions.filter(s=>s.url.includes('workopolis.com'));
 const bank=suggestions.filter(s=>s.url.includes('jobbank.gc.ca'));
 const watched=await db.prepare("SELECT name,url FROM watches WHERE owner=? AND category='jobs' AND active=1 AND last_ok IS NOT NULL ORDER BY CASE WHEN json_valid(property_snapshot) THEN json_extract(property_snapshot,'$.structured') ELSE 0 END DESC,last_ok DESC LIMIT 8").bind(owner).all<{name:string;url:string}>();
 const sources=[...new Map([...employer.slice(0,2),...watched.results.filter(s=>!s.url.includes('jobbank.gc.ca')).slice(0,2),...boards.slice(0,2),...bank.slice(0,2)].map(s=>[s.url,{name:s.name,url:s.url}])).values()].slice(0,8);
 const scans=await Promise.all(sources.map(async source=>{
  try{const page=await readSource(source.url,'jobs');return {source,status:page.structured?'readable':'text only',jobs:page.jobs};}
  catch{return {source,status:'unavailable',jobs:[]};}
 }));
 const found=new Map<string,{title:string;company:string;location:string;url:string;pay:string;reasons:string[];review:string[];source:{name:string;url:string};rank:number}>();
 for(const scan of scans)for(const job of scan.jobs){
  if(profile.locations.length&&!job.location&&!(job.remote&&profile.workMode==='remote'))continue;
  const match=matchJob(job,{...expanded,excludeUnknownSalary:profile.minimumSalary!==null},now);
  if(!match.relevant||found.has(job.url))continue;
  const pay=job.salary===null?'Pay not published':[job.currency,job.salary.toLocaleString(),job.salaryUnit?'/ '+job.salaryUnit.toLowerCase():''].filter(Boolean).join(' ');
  found.set(job.url,{title:job.title,company:job.company,location:job.location,url:job.url,pay,reasons:match.reasons,review:match.review,source:scan.source,rank:match.band==='Strong match'?2:1});
 }
 return Response.json({ai,titles,results:[...found.values()].sort((a,b)=>b.rank-a.rank).slice(0,20),sources:scans.map(({source,status})=>({...source,status}))},{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
