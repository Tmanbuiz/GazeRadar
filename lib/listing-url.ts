import {validUrl} from './monitor.ts';

// A publisher may omit the scheme. Only recognize the current host; ordinary
// relative paths and external absolute links retain their normal meaning.
export function listingUrl(input:string,base:string):string {
 const origin=new URL(base),raw=input.trim()||base;
 const candidate=raw.startsWith(`${origin.host}/`)?`https://${raw}`:raw;
 const result=new URL(candidate,base);
 // Repair the exact duplicated-host pattern emitted by older parser versions.
 const marker=`/${result.host}/`,index=result.pathname.indexOf(marker);
 if(index>=0){
  const before=result.pathname.slice(0,index).replace(/\/$/,'');
  const after=result.pathname.slice(index+marker.length-1).replace(/\/$/,'');
  if(before===after)result.pathname=after;
 }
 result.hash='';
 if(result.pathname!=='/')result.pathname=result.pathname.replace(/\/$/,'');
 return validUrl(result.toString());
}
