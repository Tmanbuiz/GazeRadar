'use client';
import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
let listening=false;
const storageKey='gazeradar-push-device';
export const nativePlatform=()=>Capacitor.isNativePlatform()?Capacitor.getPlatform():null;
async function deviceRequest(method:string,body:unknown){
 const r=await fetch('/api/devices',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const data=await r.json() as {id?:string;error?:string};if(!r.ok)throw new Error(data.error||'Unable to update device alerts.');return data;
}
export async function setupNativePush(onStatus:(text:string)=>void){
 if(!nativePlatform()||listening)return;
 listening=true;
 await PushNotifications.addListener('registration',async token=>{
  try{
   const result=await deviceRequest('POST',{platform:nativePlatform(),token:token.value,environment:new URLSearchParams(window.location.search).get('pushEnvironment')==='sandbox'?'sandbox':'production'});
   if(result.id)localStorage.setItem(storageKey,result.id);
   onStatus('Device alerts enabled. Monitoring continues on the server when the app is closed.');
  }catch(e){onStatus(e instanceof Error?e.message:'Device registration failed.');}
 });
 await PushNotifications.addListener('registrationError',()=>onStatus('Notification registration failed. Check this app’s push configuration and try again.'));
 await PushNotifications.addListener('pushNotificationReceived',()=>window.dispatchEvent(new Event('gazeradar-refresh')));
 await PushNotifications.addListener('pushNotificationActionPerformed',()=>{window.location.hash='alerts';window.dispatchEvent(new Event('gazeradar-open-alerts'));});
 const id=localStorage.getItem(storageKey);
 if((await PushNotifications.checkPermissions()).receive==='granted'&&id){
  const r=await fetch('/api/devices');
  if(r.ok){const data=await r.json() as {devices:{id:string;enabled:number}[]};if(data.devices.some(d=>d.id===id&&d.enabled))await PushNotifications.register();else localStorage.removeItem(storageKey);}
 }
}
export async function enableNativePush(){
 if(!nativePlatform())throw new Error('Install the Android or iPhone app to enable device alerts.');
 let permission=await PushNotifications.checkPermissions();
 if(permission.receive!=='granted')permission=await PushNotifications.requestPermissions();
 if(permission.receive!=='granted')throw new Error('Allow notifications in your phone settings to receive alerts.');
 if(nativePlatform()==='android')await PushNotifications.createChannel({id:'gazeradar-alerts',name:'Watch updates',description:'New watchlist changes',importance:4,visibility:0,sound:'default'});
 await PushNotifications.register();
}
export async function disableNativePush(){
 if(!nativePlatform())return;
 const id=localStorage.getItem(storageKey);
 if(id)await deviceRequest('DELETE',{id});
 await PushNotifications.unregister();localStorage.removeItem(storageKey);
}
