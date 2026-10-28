'use client';
import {useState} from 'react';
import type {Job} from '../lib/matching';
import type {JobProfile} from '../lib/preferences';
import ApplicationSend from './application-send';
import {readCV} from '../lib/cv-reader';
import {applicationDraft} from '../lib/application-draft';
export default function ApplicationComposer({job,profile}:{job:Job;profile:JobProfile}){
 const [attachment,setAttachment]=useState<File|null>(null);
 const [cv,setCV]=useState(''),[name,setName]=useState(''),[format,setFormat]=useState<'email'|'short'>('email'),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[subject,setSubject]=useState(''),[body,setBody]=useState('');
 const [description,setDescription]=useState(job.description||'');
 const [title,setTitle]=useState(job.title||''),[company,setCompany]=useState(job.company||'');
 const sourceJob={...job,title,company,description};
 const basis=applicationDraft(sourceJob,profile,cv,name,format);
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setStatus('Copied. Review it before sending to the employer.');}catch{setStatus('Copy was unavailable. Select the text and copy it manually.');}}
 return <details className="application-composer"><summary>Compose employer message</summary><p>Create an editable draft for this job using your reviewed skills and relevant lines from your CV. You choose whether to copy it or review and send it from your connected email.</p>
 <details><summary>Job description used</summary><p className="draft-source">{basis.description||'This source did not provide a readable description. Paste the full description below before composing.'}</p></details>
 <label>Job title<input maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Employer<input maxLength={200} value={company} onChange={e=>setCompany(e.target.value)}/></label>
 <label>Job description<textarea rows={5} maxLength={50000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Paste the employer’s full job description if it is missing or incomplete."/></label>
 <label>Your name<input maxLength={120} value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
 <label>CV for this draft<input type="file" accept=".pdf,.docx,.txt" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setAttachment(file);setBusy(true);try{setCV((await readCV(file)).slice(0,50000));setStatus('CV read on this device. Review the text below.');}catch(err){setStatus(err instanceof Error?err.message:'Unable to read the CV. Paste the text below.');}finally{setBusy(false);}}}/></label>
 <label>CV text or verified experience<textarea rows={6} maxLength={50000} value={cv} onChange={e=>setCV(e.target.value)} placeholder="Paste your CV or upload it above. This text stays in this open page."/></label>
 <label>Message format<select value={format} onChange={e=>setFormat(e.target.value as 'email'|'short')}><option value="email">Application email</option><option value="short">Short employer message</option></select></label>
 <p className="field-hint">Matched reviewed skills: {basis.skills.join(', ')||'None identified in the available job description'}. Drafting is local. Sending uploads only your selected CV file and reviewed message. CV text clears when this Jobs view is closed or refreshed. Preferred job titles are not treated as experience.</p>
 <button type="button" className="btn secondary" disabled={busy} onClick={()=>{const d=applicationDraft(sourceJob,profile,cv,name,format);setSubject(d.subject);setBody(d.body);setStatus('Draft prepared. Check every claim, replace [Your name], and review your CV attachment before sending.');}}>Prepare draft</button>
 {body&&<><label>Subject<input maxLength={500} value={subject} onChange={e=>setSubject(e.target.value)}/></label><button type="button" className="btn small" onClick={()=>void copy(subject)}>Copy subject</button><label>Message<textarea rows={12} value={body} onChange={e=>setBody(e.target.value)}/></label><div className="draft-actions"><button type="button" className="btn primary" onClick={()=>void copy(body)}>Copy message</button><button type="button" className="btn secondary" onClick={()=>{setCV('');setAttachment(null);setBody('');setSubject('');setName('');setStatus('Draft and CV text cleared.');}}>Clear draft & CV</button></div><ApplicationSend subject={subject} body={body} title={title} jobUrl={job.url} attachment={attachment}/></>}
 <p className="field-hint" role="status">{status}</p><p className="field-hint">Template-based drafting uses only matching skills and quoted CV lines. Check the original listing and application instructions before sending. It does not verify licences, work eligibility or experience.</p>
 </details>;
}
