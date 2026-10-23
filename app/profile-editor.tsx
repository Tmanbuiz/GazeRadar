'use client';
import {useState} from 'react';
import {FileUp,ShieldCheck,Save,Trash2} from 'lucide-react';
import {readCV} from '../lib/cv-reader';
import {suggestProfile} from '../lib/matching';
import type {JobProfile,HousingProfile} from '../lib/preferences';
const split=(s:string)=>s.split(',').map(x=>x.trim()).filter(Boolean);
type Props={kind:'jobs'|'housing';profile:JobProfile|HousingProfile;signedIn:boolean;save:(profile:JobProfile|HousingProfile)=>Promise<boolean>;remove:()=>void};
export default function ProfileEditor({kind,profile,signedIn,save,remove}:Props){
 const [draft,setDraft]=useState(profile),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const jobs=draft as JobProfile,home=draft as HousingProfile;
 const [entries,setEntries]=useState({titles:(profile as JobProfile).titles?.join(', ')||'',skills:(profile as JobProfile).skills?.join(', ')||'',locations:profile.locations.join(', '),employment:(profile as JobProfile).employment?.join(', ')||''});
 async function upload(file:File|undefined){if(!file)return;setBusy(true);setError('');setMessage('Reading your CV on this device…');try{const text=await readCV(file),suggested=suggestProfile(text);setEntries({...entries,skills:suggested.skills.join(', '),titles:suggested.titles.join(', ')});setMessage(`Found ${suggested.skills.length} skills and ${suggested.titles.length} possible job titles. Review and edit them below, then save. Location and work preferences stay under your control.`);}catch(e){setMessage('');setError(e instanceof Error?e.message:'Unable to read this file. Enter your details below.');}finally{setBusy(false);}}
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(await save(kind==='jobs'?{...jobs,titles:split(entries.titles),skills:split(entries.skills),locations:split(entries.locations),employment:split(entries.employment)}:{...home,locations:split(entries.locations)}))setMessage('Search preferences saved. Your results now use these preferences.');else setError('Could not save these preferences. Review the workspace error message, correct the fields and try again.');}finally{setBusy(false);}}
 const hasSaved=kind==='jobs'?!!((profile as JobProfile).skills.length||(profile as JobProfile).titles.length):!!((profile as HousingProfile).maximumPrice!==null||(profile as HousingProfile).locations.length||(profile as HousingProfile).mode!=='any');
 return <details className="profile-editor" open={!hasSaved}><summary>{kind==='jobs'?'Your CV & job preferences':'Your housing preferences'}<span>Review and adjust</span></summary>
  {kind==='jobs'&&<div className="cv-upload"><FileUp size={25} aria-hidden="true"/><div><strong>Start with your CV, or type your details below.</strong><p>Text-based PDF, DOCX or TXT · up to 5 MB. The document is read on your device. Only the fields you review and save are sent to your account.</p><label className="file-control">Choose CV<input type="file" name="cv-file" accept=".pdf,.docx,.txt" disabled={busy||!signedIn} onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/></label></div></div>}
  <div role="status" className="field-hint">{message}</div>{error&&<p className="form-error" role="alert">{error}</p>}
  <form onSubmit={submit} className="profile-form"><div className="profile-fields">
   {kind==='jobs'?<>
    <label>Preferred job titles<input name="job-titles" maxLength={550} value={entries.titles} onChange={e=>setEntries({...entries,titles:e.target.value})} placeholder="Administrative assistant, coordinator"/><span>Separate titles with commas. You can choose a new career direction.</span></label>
    <label>Skills & qualifications<input name="job-skills" maxLength={2200} value={entries.skills} onChange={e=>setEntries({...entries,skills:e.target.value})} placeholder="Customer service, Excel, First Aid"/><span>Suggestions use a limited vocabulary. Add anything the CV reader missed.</span></label>
    <label>Preferred locations<input name="job-locations" maxLength={550} value={entries.locations} onChange={e=>setEntries({...entries,locations:e.target.value})} placeholder="Fredericton, Moncton"/></label>
    <label>Work arrangement<select name="work-arrangement" value={jobs.workMode} onChange={e=>setDraft({...jobs,workMode:e.target.value as JobProfile['workMode']})}><option value="any">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On site</option></select></label>
    <label>Employment types<input name="employment-types" value={entries.employment} onChange={e=>setEntries({...entries,employment:e.target.value})} placeholder="Full time, part time"/></label>
    <label>Minimum annual pay in CAD<input name="minimum-salary" type="number" min="0" max="2000000" value={jobs.minimumSalary??''} onChange={e=>setDraft({...jobs,minimumSalary:e.target.value?Number(e.target.value):null})} placeholder="Optional"/><span>Unknown pay remains visible with a note to check it.</span></label>
   </>:<>
    <label>Looking to<select name="housing-mode" value={home.mode} onChange={e=>setDraft({...home,mode:e.target.value as HousingProfile['mode']})}><option value="any">Rent or buy</option><option value="rent">Rent</option><option value="buy">Buy</option></select></label>
    <label>Preferred locations<input name="home-locations" maxLength={550} value={entries.locations} onChange={e=>setEntries({...entries,locations:e.target.value})} placeholder="Fredericton, Oromocto"/></label>
    <label>{home.mode==='rent'?'Maximum monthly rent in CAD':'Maximum listed price in CAD'}<input name="housing-budget" type="number" min="0" max="100000000" value={home.maximumPrice??''} onChange={e=>setDraft({...home,maximumPrice:e.target.value?Number(e.target.value):null})} placeholder="Optional"/></label>
    <label>Minimum bedrooms<input name="bedrooms" type="number" min="0" max="20" step="1" value={home.bedrooms??''} onChange={e=>setDraft({...home,bedrooms:e.target.value?Number(e.target.value):null})} placeholder="Any"/></label>
    <label>Property type<input name="property-type" maxLength={60} value={home.propertyType} onChange={e=>setDraft({...home,propertyType:e.target.value})} placeholder="Optional, e.g. bungalow"/></label>
   </>}
  </div><div className="profile-actions"><span><ShieldCheck size={15} aria-hidden="true"/> You control what is saved.</span><button type="button" className="btn secondary" disabled={busy||!signedIn} onClick={remove}><Trash2 size={15}/>Delete profile</button><button className="btn primary" disabled={busy||!signedIn}><Save size={15}/>{busy?'Working…':'Save preferences'}</button></div></form>
 </details>;
}
