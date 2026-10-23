export function validUrl(input: string) {
 let u: URL; try {u=new URL(input);} catch {throw new Error('Enter a valid, complete careers-page URL.');}
 const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/.test(h) || /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(h)) throw new Error('Use a public HTTPS website with a domain name.');
 u.hash=''; return u.toString();
}
export function pageLines(html: string) {
 return [...new Set(html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(p|div|li|h[1-6]|tr|article|section)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>12 && s.length<1800))].slice(0,1500);
}
export function matchingAdditions(previous: string[], next: string[], keywords: string[]) {
 const old=new Set(previous); return next.filter(line=>!old.has(line) && (!keywords.length || keywords.some(k=>line.toLowerCase().includes(k.toLowerCase()))));
}
export async function readPage(input:string) {
 let url=validUrl(input); const signal=AbortSignal.timeout(18000);
 for(let i=0;i<4;i++) {
 const res=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'GazeRadar/0.1 (careers page monitor)','Accept':'text/html,text/plain'}});
 if([301,302,303,307,308].includes(res.status)){await res.body?.cancel(); const next=res.headers.get('location'); if(!next)throw new Error('The page redirected without a destination.');url=validUrl(new URL(next,url).toString());continue;}
 if(!res.ok){await res.body?.cancel();throw new Error(`Website returned ${res.status}. Try a direct careers-page link.`);}
 if(!/text\/(html|plain)/i.test(res.headers.get('content-type')||'')){await res.body?.cancel();throw new Error('This monitor supports HTML or text pages.');}
 const reader=res.body?.getReader(); if(!reader)throw new Error('The website returned an empty page.');
 let size=0;const parts:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw new Error('This page is too large. Try a more specific careers URL.');}parts.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}
 const lines=pageLines(new TextDecoder().decode(buffer));if(lines.join('').length<120)throw new Error('Not enough readable text. This page may require JavaScript or block monitoring.');return lines;
 }
 throw new Error('Too many redirects. Use the final careers-page URL.');
}
