'use client';
import {useEffect,useState,useCallback,useSyncExternalStore} from 'react';
import {nativePlatform,setupNativePush,enableNativePush,disableNativePush} from '../lib/native-push';
const subscribe=()=>()=>{};
const serverPlatform=()=>null;
type Device={id:string;platform:string;enabled:number;error:string|null};
export default function DeviceAlerts(){
 const platform=useSyncExternalStore(subscribe,nativePlatform,serverPlatform);
 const [devices,setDevices]=useState<Device[]>([]),[configured,setConfigured]=useState({android:false,ios:false}),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const r=await fetch('/api/devices');const data=await r.json() as {devices?:Device[];configured?:typeof configured;error?:string};if(!r.ok)throw new Error(data.error||'Unable to load devices.');setDevices(data.devices||[]);if(data.configured)setConfigured(data.configured);},[]);
 // Load device preferences from the external account API after hydration.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{void load().catch(()=>setMessage('Device alert setup is not available yet.'));},[load]);
 async function run(task:()=>Promise<void>){setBusy(true);try{await task();await load();}catch(e){setMessage(e instanceof Error?e.message:'Unable to update alerts.');}finally{setBusy(false);}}
 return <section className="settings-card"><h2>Device alerts</h2><p>Watch checks run on the server. Push alerts can arrive while the app is closed, subject to your phone’s notification settings and network connection.</p><p>Lock-screen alerts use a generic message. Open the app to see details. Device alerts are independent of email delivery.</p>{platform?<><p>{configured[platform as 'ios'|'android']?'Push delivery is configured. Enable alerts on this device to register it.':'Push delivery setup for this platform is pending. You can still use the app and email alerts.'}</p><button className="btn primary" disabled={busy||!configured[platform as 'ios'|'android']} onClick={()=>void run(async()=>{await setupNativePush(setMessage);await enableNativePush();})}>Enable device alerts</button><button className="btn secondary" disabled={busy} onClick={()=>void run(async()=>{await disableNativePush();setMessage('Device alerts disabled on this phone.');})}>Disable on this device</button></>:<p>Install the Android or iPhone app to enable push alerts. You can manage registered devices below.</p>}<ul>{devices.map(d=><li key={d.id}>{d.platform==='ios'?'iPhone / iPad':'Android'} · {d.enabled?'Enabled':'Disabled'}{d.error&&<p>{d.error}</p>} <button className="btn small" disabled={busy} onClick={()=>void run(async()=>{const r=await fetch('/api/devices',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:d.id})});if(!r.ok)throw new Error('Unable to remove this device.');setMessage('Device removed.');})}>Remove device</button></li>)}</ul><p role="status">{message}</p></section>;
}
