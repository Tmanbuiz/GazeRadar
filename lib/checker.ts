import {buildAlert,isMajorChange,lineHash,matchingAdditions,MAX_LINES,PageError,readSnapshot,toSnapshot} from './monitor.ts';
import {readSource,type SourcePage} from './sources.ts';
import {matchHome,matchJob,type Home,type Job} from './matching.ts';
import {emptyHousing,emptyJobs,jsonValue,watchOptions,type HousingProfile,type JobProfile} from './preferences.ts';
import {propertyChanges} from './structured.ts';
import {storeOpportunity,trimOpportunityHistory} from './opportunities.ts';
export type WatchRow={id:string;owner:string;name:string;url:string;keywords:string;active:number;snapshot:string|null;checked:number|null;checking:number;last_ok:number|null;fail_count:number;category:string;interval_hours:number;options:string;property_snapshot:string|null};
type Deps={db:D1Database;watch:WatchRow;now?:number;read?:(url:string,category:string)=>Promise<SourcePage>};
type Result={message:string;baseline:boolean;changes:number;truncated:boolean};
async function profile<T>(db:D1Database,owner:string,kind:string,fallback:T):Promise<T>{const row=await db.prepare('SELECT content FROM profiles WHERE owner=? AND kind=?').bind(owner,kind).first<{content:string}>();return jsonValue(row?.content,fallback);}
const fingerprint=(v:Job|Home)=>lineHash(JSON.stringify(v));
export async function checkWatch({db,watch:w,now=Date.now(),read=readSource}:Deps):Promise<Result> {
 if(!w.active)throw new Error('Resume this watch before checking.');
 if(w.checked&&now-w.checked<60000)throw new Error('Please wait a minute between checks.');
 const lock=await db.prepare('UPDATE watches SET checking=? WHERE id=? AND owner=? AND active=1 AND (checked IS NULL OR checked<=?) AND (checking=0 OR checking<?)').bind(now,w.id,w.owner,now-60000,now-120000).run();
 if(!lock.meta.changes)throw new Error('This watch is already being checked or was checked recently.');
 const previousState=jsonValue(w.property_snapshot,{structured:false,unavailable:false});
 const options=watchOptions(jsonValue(w.options,{}));
 const addEvent=(items:{t:string;h?:string}[],title:string,kind='change')=>db.prepare("INSERT INTO events (id,owner,watch_id,name,url,content,created,category,emailed) VALUES (?,?,?,?,?,?,?,?,CASE WHEN EXISTS (SELECT 1 FROM notifications n JOIN watches w ON w.owner=n.owner WHERE n.owner=? AND n.frequency!='off' AND w.id=? AND w.email_enabled=1) THEN 0 ELSE 1 END)").bind(crypto.randomUUID(),w.owner,w.id,w.name,w.url,JSON.stringify({v:3,title,kind,items:items.slice(0,30),more:Math.max(0,items.length-30)}),now,w.category,w.owner,w.id);
 try {
  const page=await read(w.url,w.category);
  if(previousState.structured&&!page.structured)throw new Error('Structured listing details are no longer readable. The previous details were kept. Review the source or try again later.');
  const previous=readSnapshot(w.snapshot),major=!page.structured&&!!previous&&isMajorChange(previous,page.lines);
  const rebase=major&&(w.fail_count||0)>=2&&now-(w.last_ok||0)>=3600000;
  if(major&&!rebase)throw new Error('This page looks very different from the saved baseline. It may be a bot check or a redesign. Try again later; the previous baseline was kept.');
  const changes:{t:string;h?:string}[]=[];const statements:D1PreparedStatement[]=[];
  if(page.structured){
   const old=await db.prepare('SELECT id,url,content,fingerprint,available FROM opportunities WHERE watch_id=? AND owner=?').bind(w.id,w.owner).all<{id:string;url:string;content:string;fingerprint:string;available:number}>();
   const byUrl=new Map(old.results.map(x=>[x.url,x]));
   const jobs=await profile<JobProfile>(db,w.owner,'jobs',emptyJobs),housing=await profile<HousingProfile>(db,w.owner,'housing',emptyHousing);
   const records=w.category==='jobs'?page.jobs:page.homes;
   for(const r of records){
    const existing=byUrl.get(r.url),hash=fingerprint(r);
    const match=w.category==='jobs'?matchJob(r as Job,jobs,now):matchHome(r as Home,housing);
    statements.push(storeOpportunity(db,w,r,existing?.id??crypto.randomUUID(),hash,now));
    if(!existing&&match.relevant)changes.push({t:`New ${w.category==='jobs'?'job':'property'} match: ${r.title}. ${match.reasons.join(' ')}`,h:r.url});
    if(existing&&!existing.available){
     if(w.category==='housing'&&options.status)changes.push({t:`${r.title}: The property is present in this source again. Review the original listing for its current availability.`,h:r.url});
     else if(w.category==='jobs'&&match.relevant)changes.push({t:`Job posting is present in this source again: ${r.title}. Review the employer's current details.`,h:r.url});
    }
    if(existing&&existing.fingerprint!==hash){
     if(w.category==='housing')for(const t of propertyChanges(jsonValue(existing.content,r) as Home,r as Home,options))changes.push({t:`${r.title}: ${t}`,h:r.url});
     else if(match.relevant)changes.push({t:`Job posting updated: ${r.title}. Review the source for current details.`,h:r.url});
    }
   }
   if(!page.truncated){
    const urls=new Set(records.map(x=>x.url));
    for(const oldRow of old.results)if(!urls.has(oldRow.url)){
     statements.push(db.prepare('UPDATE opportunities SET available=0 WHERE id=? AND owner=?').bind(oldRow.id,w.owner));
     if(w.category==='housing'&&options.status&&oldRow.available)changes.push({t:`A property is no longer present in this source’s latest complete listing data. This does not confirm a sale.`,h:oldRow.url});
    }
   }
   statements.push(trimOpportunityHistory(db,w.owner,w.id));
  }else if(previous&&!major){
   let keywords=jsonValue<string[]>(w.keywords,[]);
   if(w.category==='jobs'&&!keywords.length){const p=await profile<JobProfile>(db,w.owner,'jobs',emptyJobs);keywords=[...p.titles,...p.skills];}
   let additions=matchingAdditions(previous,page.lines,keywords);
   if(w.category==='housing')additions=additions.filter(t=>options.details||options.price&&/\$|\bprice\b/i.test(t)||options.status&&/\bsold\b|\bpending\b|\bfor sale\b|\bfor rent\b/i.test(t)||options.openHouse&&/open.?house/i.test(t));
   changes.push(...buildAlert(additions,page.links).items);
  }
  if(previousState.unavailable&&options.status)changes.push({t:'The listing page is readable again. Review its current details.',h:w.url});
  if(changes.length)statements.push(addEvent(changes,page.structured?`${w.category==='jobs'?'Job':'Housing'} updates`:'Matching page text changed'));
  statements.push(db.prepare('UPDATE watches SET snapshot=?,checked=?,last_ok=?,fail_count=0,error=NULL,checking=0,next_check=?,property_snapshot=? WHERE id=? AND owner=? AND checking=?')
   .bind(toSnapshot(page.lines),now,now,now+w.interval_hours*3600000,JSON.stringify({structured:page.structured,unavailable:false}),w.id,w.owner,now));
  statements.push(db.prepare('DELETE FROM events WHERE owner=? AND emailed=1 AND id NOT IN (SELECT id FROM events WHERE owner=? ORDER BY created DESC LIMIT 500)').bind(w.owner,w.owner));
  await db.batch(statements);
  const note=page.truncated?` This source was limited to ${page.structured?'100 listings':`${MAX_LINES} lines`}.` : '';
  return {message:`${!previous&&!page.structured?'Baseline saved. Future checks will report matching changes.':changes.length?`${changes.length} matching update${changes.length===1?'':'s'} found.`:rebase?'Page layout changed; a new baseline was saved.':'No new matching changes.'}${note}`,baseline:!previous,changes:changes.length,truncated:page.truncated};
 }catch(e){
  const message=e instanceof Error?e.message:'Unable to read this source. Try again later.';
  const unavailable=w.category==='housing'&&e instanceof PageError&&[404,410].includes(e.status);
  const statements=[db.prepare('UPDATE watches SET error=?,checked=?,fail_count=fail_count+1,checking=0,next_check=?,property_snapshot=? WHERE id=? AND owner=? AND checking=?')
   .bind(message,now,now+Math.min(168,Math.max(w.interval_hours,2**Math.min(w.fail_count,7)))*3600000,unavailable?JSON.stringify({...previousState,unavailable:true}):w.property_snapshot,w.id,w.owner,now)];
  if(unavailable&&w.last_ok&&!previousState.unavailable&&options.status)statements.push(addEvent([{t:'Listing unavailable: the source returned a missing-page response. This does not confirm that the property sold.',h:w.url}],'Listing unavailable','unavailable'));
  await db.batch(statements);throw e;
 }
}
