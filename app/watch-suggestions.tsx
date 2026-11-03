'use client';
import {useState} from 'react';
import {intervals,type JobProfile} from '../lib/preferences';
import {suggestJobWatches,type WatchSuggestion} from '../lib/watch-suggestions';

type Discovery={ai:string;titles:string[];results:{title:string;company:string;location:string;url:string;pay:string;reasons:string[];review:string[];source:{name:string;url:string}}[];sources:{name:string;url:string;status:string}[]};
export type SuggestedWatch=Pick<WatchSuggestion,'name'|'url'|'keywords'>&{category:'jobs';intervalHours:number;emailEnabled:boolean};
export default function WatchSuggestions({profile,existing,add,refresh,emailOff}:{profile:JobProfile;existing:string[];add:(watch:SuggestedWatch)=>Promise<unknown>;refresh:()=>Promise<void>;emailOff:boolean}){
 const [selected,setSelected]=useState<Record<string,boolean>>({}),[edits,setEdits]=useState<Record<string,string>>({}),[added,setAdded]=useState<string[]>([]);
 const [hours,setHours]=useState(6),[email,setEmail]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [useGroq,setUseGroq]=useState(false),[searching,setSearching]=useState(false),[discovery,setDiscovery]=useState<Discovery|null>(null);
 async function discover(){
  setSearching(true);setMessage('');setDiscovery(null);
  try{
   const r=await fetch('/api/job-discovery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({useGroq})});
   const data=await r.json() as Discovery & {error?:string};
   if(!r.ok)throw new Error(data.error||'Search could not complete.');
   setDiscovery(data);
  }catch(e){setMessage(e instanceof Error?e.message:'Search could not complete.');}
  finally{setSearching(false);}
 }
 async function follow(source:{name:string;url:string}){
  setBusy(true);setMessage('');
  try{
   await add({...source,name:source.name.slice(0,100),category:'jobs',keywords:suggestJobWatches(profile)[0]?.keywords||'',intervalHours:hours,emailEnabled:email});
   setAdded(previous=>[...previous,source.url]);await refresh();setMessage('Watch saved.');
  }catch(e){setMessage(e instanceof Error?e.message:'Watch could not be saved.');}
  finally{setBusy(false);}
 }
 const sources=suggestJobWatches(profile,[...existing,...added]);
 const chosen=sources.filter(s=>selected[s.url]);
 async function save(){
  setBusy(true);setMessage('');
  const successes:string[]=[],errors:string[]=[];
  try{
   for(const source of chosen){
    try{await add({name:source.name,url:source.url,keywords:edits[source.url]??source.keywords,category:'jobs',intervalHours:hours,emailEnabled:email});successes.push(source.url);}
    catch(e){errors.push(source.name+': '+(e instanceof Error?e.message:'Could not save.'));}
   }
   setAdded(previous=>[...previous,...successes]);
   await refresh();
   setMessage([successes.length?successes.length+' watch(es) saved. The first check establishes a baseline.':'',...errors].filter(Boolean).join(' '));
  }finally{setBusy(false);}
 }
 return <section className="settings-card" aria-labelledby="suggested-sources-title">
  <h2 id="suggested-sources-title">Suggested job watches</h2>
  <p>Based on your saved CV preferences. Choose the pages you want to follow. You can edit the suggested keywords before saving.</p>
  <p className="field-hint">Location: {profile.locations.join(', ')||'Any'} · Work arrangement: {profile.workMode} · Employment: {profile.employment.join(', ')||'Any'} · Pay: {profile.minimumSalary==null?'Any':`${profile.salaryStrict?'Above':'At least'} CAD ${profile.minimumSalary.toLocaleString()} per ${(profile.salaryPeriod||'YEAR').toLowerCase()}`}</p>
  <p className="field-hint">Structured job matches use your saved location, pay, work arrangement and employment preferences. Page-text alerts use keywords only. A suggestion does not guarantee the source is readable or has open jobs.</p>
  <label className="check-label"><input type="checkbox" checked={useGroq} disabled={searching} onChange={e=>setUseGroq(e.target.checked)}/>Use AI Agent to find related job titles</label>
  <p className="field-hint">When enabled, your saved titles and skills are sent to an external AI service for related search terms. Your CV file is not sent.</p>
  <button type="button" className="btn primary" disabled={searching||busy||(!profile.titles.length&&!profile.skills.length)} onClick={()=>void discover()}>{searching?'Checking job sources…':'Find jobs from my CV'}</button>
  {discovery&&<div>
   <p>{discovery.ai==='used'?'AI Agent search terms: '+(discovery.titles.join(', ')||'no additional terms'):discovery.ai==='off'?'Searched with your saved preferences.':'AI Agent: '+discovery.ai+'. Searched with your saved preferences.'}</p>
   <p>{discovery.results.length?discovery.results.length+' matching openings found.':'No confirmed matches in the sources checked. If you set a pay minimum, listings without comparable published pay are excluded.'}</p>
   <div className="watch-grid">{discovery.results.map(job=><article className="watch-card" key={job.url}>
    <h3><a href={job.url} target="_blank" rel="noreferrer noopener">{job.title}</a></h3>
    <p>{[job.company,job.location,job.pay].filter(Boolean).join(' · ')}</p>
    <p>{job.reasons.join(' ')}</p><details><summary>What to review</summary><p>{job.review.join(' ')}</p></details>
    <button type="button" className="btn secondary" disabled={busy||existing.includes(job.source.url)||added.includes(job.source.url)} onClick={()=>void follow(job.source)}>{existing.includes(job.source.url)||added.includes(job.source.url)?'Source already followed':'Follow '+job.source.name}</button>
   </article>)}</div>
   <details><summary>Sources checked</summary><ul>{discovery.sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer noopener">{source.name}</a> — {source.status}</li>)}</ul></details>
  </div>}
  {sources.length?<><div className="watch-grid">{sources.map(source=><article className="watch-card" key={source.url}>
   <label className="check-label"><input type="checkbox" checked={!!selected[source.url]} disabled={busy} onChange={e=>setSelected({...selected,[source.url]:e.target.checked})}/>Follow {source.name}</label>
   <p>{source.reason}</p><a className="source-url" href={source.url} target="_blank" rel="noreferrer noopener">Preview source</a>
   <label>Alert keywords<input value={edits[source.url]??source.keywords} maxLength={1000} disabled={busy} onChange={e=>setEdits({...edits,[source.url]:e.target.value})}/></label>
  </article>)}</div>
  <label>Check interval<select value={hours} disabled={busy} onChange={e=>setHours(Number(e.target.value))}>{intervals.map(n=><option key={n} value={n}>{n===168?'Weekly':n===24?'Daily':n===1?'Hourly':'Every '+n+' hours'}</option>)}</select></label>
  <label className="check-label"><input type="checkbox" checked={email} disabled={busy} onChange={e=>setEmail(e.target.checked)}/>Include selected watches in email updates</label>
  {email&&emailOff&&<p className="field-hint">Account email delivery is off. Enable it in Settings to receive emails; changes can still appear in Alert inbox.</p>}
  <button type="button" className="btn primary" disabled={busy||!chosen.length} onClick={()=>void save()}>{busy?'Saving…':'Add selected watches ('+chosen.length+')'}</button></>:<p>{profile.titles.length||profile.skills.length?'No additional suggestions. Edit your job preferences or add another page manually.':'Save job titles or skills above to see suggested pages.'}</p>}
  <p role="status">{message}</p>
 </section>;
}

