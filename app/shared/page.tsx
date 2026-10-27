'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
type Shared={title:string;expires:number;items:{name:string;url:string;category:string}[]};
export default function SharedGoal(){
 const [data,setData]=useState<Shared|null>(null),[error,setError]=useState('');
 useEffect(()=>{const token=window.location.hash.slice(1);void fetch('/api/goals/share?token='+encodeURIComponent(token)).then(async r=>{if(!r.ok)throw new Error('This link has expired, been revoked or is unavailable.');return await r.json() as Shared;}).then(setData).catch(e=>setError(e.message));},[]);
 return <main className="unsubscribe-page"><p>GazeRadar · Shared shortlist</p><h1>{data?.title||'Shared goal'}</h1>{error?<p role="alert">{error}</p>:!data?<p>Loading shortlist…</p>:<><p>Read-only snapshot. Expires {new Date(data.expires).toLocaleDateString()}. Review current details at the original source.</p><ul>{data.items.map((item,i)=><li key={i}><a href={item.url} target="_blank" rel="noreferrer noopener">{item.name}</a> · {item.category}</li>)}</ul></>}<p><Link href="/">Open GazeRadar</Link></p></main>;
}
