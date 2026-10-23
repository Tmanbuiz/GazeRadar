'use client';
import {useEffect, useRef, useState} from 'react';
import {Mail, X} from 'lucide-react';

type Turnstile={render:(el:HTMLElement,o:{sitekey:string;callback:(t:string)=>void;'expired-callback':()=>void;'error-callback':()=>void})=>string;reset:(id?:string)=>void;remove:(id?:string)=>void};
declare global{interface Window{turnstile?:Turnstile}}
const SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadTurnstile():Promise<Turnstile>{
 return new Promise((resolve,reject)=>{
  if(window.turnstile)return resolve(window.turnstile);
  let s=document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  if(!s){s=document.createElement('script');s.src=SCRIPT;s.async=true;document.head.appendChild(s);}
  s.addEventListener('load',()=>window.turnstile?resolve(window.turnstile):reject(new Error('check')));
  s.addEventListener('error',()=>reject(new Error('check')));
 });
}

export default function SignIn({open,onClose,siteKey,available}:{open:boolean;onClose:()=>void;siteKey:string|null;available:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),box=useRef<HTMLDivElement>(null),widget=useRef<string|undefined>(undefined);
 const [step,setStep]=useState<'email'|'code'>('email'),[email,setEmail]=useState(''),[code,setCode]=useState(''),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{
  if(!open||!available||!siteKey||step!=='email')return;
  let gone=false;
  loadTurnstile().then(t=>{if(gone||!box.current)return;widget.current=t.render(box.current,{sitekey:siteKey,callback:setToken,'expired-callback':()=>setToken(''),'error-callback':()=>setToken('')});}).catch(()=>setError('The security check could not load. Reload the page and try again.'));
  return()=>{gone=true;if(widget.current&&window.turnstile)window.turnstile.remove(widget.current);widget.current=undefined;setToken('');};
 },[open,available,siteKey,step]);
 async function post(path:string,body:object){
  const res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({})) as {error?:string};
  if(!res.ok)throw new Error(data.error||'Something went wrong. Please try again.');
 }
 async function request(e:React.FormEvent){
  e.preventDefault();setError('');setBusy(true);
  try{await post('/api/auth/request',{email,turnstile:token});setStep('code');setCode('');}
  catch(err){setError(err instanceof Error?err.message:'Something went wrong.');if(widget.current)window.turnstile?.reset(widget.current);setToken('');}
  finally{setBusy(false);}
 }
 async function verify(e:React.FormEvent){
  e.preventDefault();setError('');setBusy(true);
  try{await post('/api/auth/verify',{email,code});window.location.reload();}
  catch(err){setError(err instanceof Error?err.message:'Something went wrong.');setBusy(false);}
 }
 const close=()=>{setStep('email');setError('');setCode('');onClose();};
 return <dialog ref={dialog} className="modal" onCancel={close} onClose={()=>{if(open)close();}} aria-labelledby="signin-title">
  <button className="icon-button modal-close" onClick={close} aria-label="Close" type="button"><X size={18}/></button>
  <span className="modal-symbol"><Mail size={22}/></span><span className="eyebrow">Account</span>
  <h2 id="signin-title">{step==='email'?'Sign in or create an account':'Check your email'}</h2>
  {!available?<p className="modal-description">Email sign-in is not set up on this site yet. If the site owner uses Cloudflare Access, use that sign-in instead.</p>:
  step==='email'?<form onSubmit={request}>
   <p className="modal-description">Enter your email and we will send a 6-digit code. If you are new, your account is created when you enter the code. No password needed.</p>
   <label htmlFor="signin-email">Email address</label>
   <input id="signin-email" type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoFocus/>
   <div ref={box} style={{marginBlockStart:16,minHeight:65}}/>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <div className="modal-actions"><button className="btn primary" type="submit" disabled={busy||!token||!email}>{busy?'Sending…':'Email me a code'}</button></div>
  </form>:<form onSubmit={verify}>
   <p className="modal-description">If {email} can receive email, a code is on its way. It expires in 10 minutes. Check your spam folder if you do not see it.</p>
   <label htmlFor="signin-code">6-digit code</label>
   <input id="signin-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" required maxLength={7} value={code} onChange={e=>setCode(e.target.value)} placeholder="123456" autoFocus/>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <div className="modal-actions"><button className="btn secondary" type="button" onClick={()=>{setStep('email');setError('');}}>Use another email</button><button className="btn primary" type="submit" disabled={busy||code.replace(/\s/g,'').length!==6}>{busy?'Checking…':'Sign in'}</button></div>
  </form>}
 </dialog>;
}
