export function validUrl(input: string) {
 let u: URL; try {u=new URL(input);} catch {throw new Error('Enter a valid, complete website URL.');}
 const h=u.hostname.toLowerCase();
 if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/.test(h) || /(^|\.)(localhost|local|internal|test|invalid|onion)$/.test(h)) throw new Error('Use a public HTTPS website with a domain name.');
 u.hash=''; return u.toString();
}

// Limits (documented in the README; raising one needs a reason and a README note).
export const MAX_LINES = 1500;
export const MIN_LINE = 4;
export const MAX_ALERT_ITEMS = 30;
export const MAJOR_CHANGE_MIN_BASELINE = 20;
export const MAJOR_CHANGE_KEPT_RATIO = 0.4;

export type Link = {text: string; href: string};
export type AlertItem = {t: string; h?: string};
export type AlertContent = {v: 2; items: AlertItem[]; more: number};

function decode(s: string) {
 return s
  .replace(/&nbsp;/g,' ')
  .replace(/&#(\d+);|&#x([0-9a-f]+);/gi,(m,d,x)=>{const cp=d?parseInt(d,10):parseInt(x,16);if(!Number.isFinite(cp)||cp>0x10ffff)return m;if(cp<32)return ' ';try{return String.fromCodePoint(cp);}catch{return m;}})
  .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')
  .replace(/&amp;/g,'&');
}

function extractLinks(html: string, base: string): Link[] {
 // Anchor text -> href. If the same text points at different places ("Read more"), drop it so we never attach a wrong link.
 const found = new Map<string, string|null>();
 const re = /<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]{0,1500}?)<\/a>/gi;
 for (const m of html.matchAll(re)) {
  const raw = decode(m[1] ?? m[2] ?? m[3] ?? '').trim();
  const text = decode(m[4].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  if (!raw || text.length < MIN_LINE || text.length >= 1800) continue;
  let u: URL; try { u = new URL(raw, base); } catch { continue; }
  if (u.protocol !== 'https:' || u.username || u.password) continue;
  const href = u.toString();
  if (href.length > 500) continue;
  const prev = found.get(text);
  if (prev === undefined) found.set(text, href); else if (prev !== href) found.set(text, null);
  if (found.size >= 3000) break;
 }
 const out: Link[] = [];
 for (const [text, href] of found) if (href) out.push({text, href});
 return out;
}

export function pageData(html: string, baseUrl?: string) {
 const cleaned = html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 const links = baseUrl ? extractLinks(cleaned, baseUrl) : [];
 const all = [...new Set(decode(cleaned.replace(/<\/(p|div|li|h[1-6]|tr|article|section)>|<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ')).split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(s=>s.length>=MIN_LINE && s.length<1800))];
 return {lines: all.slice(0, MAX_LINES), truncated: all.length > MAX_LINES, links};
}
export function pageLines(html: string) {
 return pageData(html).lines;
}

// Baselines store a short fingerprint per line instead of the full text, which keeps each row far below D1's row-size limit.
// This is a change detector, not a security boundary, so a fast non-cryptographic hash (cyrb53) is enough.
export function lineHash(line: string) {
 let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
 for (let i = 0; i < line.length; i++) {
  const c = line.charCodeAt(i);
  h1 = Math.imul(h1 ^ c, 2654435761);
  h2 = Math.imul(h2 ^ c, 1597334677);
 }
 h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
 h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
 return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
export function toSnapshot(lines: string[]) {
 return JSON.stringify({v: 2, h: lines.map(lineHash)});
}
// Reads both the new format ({v:2,h:[...]}) and the original one (a JSON array of full lines). Unreadable data counts as "no baseline".
export function readSnapshot(raw: string | null | undefined): Set<string> | null {
 if (!raw) return null;
 try {
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return new Set(data.map(l => lineHash(String(l))));
  if (data && data.v === 2 && Array.isArray(data.h)) return new Set(data.h.map(String));
 } catch {}
 return null;
}
// True when most of the old baseline is gone, which usually means a bot-check page, an error page or a redesign rather than real changes.
export function isMajorChange(previous: Set<string>, lines: string[]) {
 if (previous.size < MAJOR_CHANGE_MIN_BASELINE) return false;
 const now = new Set(lines.map(lineHash));
 let kept = 0;
 for (const h of previous) if (now.has(h)) kept++;
 return kept / previous.size < MAJOR_CHANGE_KEPT_RATIO;
}

// Keywords: "nurse" matches words that start with it (nurse, nurses, nursing is NOT matched); terms of 3 characters or fewer, and "quoted" terms, must match a whole word.
// A leading "-" excludes lines (for example -senior).
export function parseKeywords(list: string[]) {
 const include: string[] = [], exclude: string[] = [];
 for (const raw of list) {
  const k = String(raw).trim();
  if (!k) continue;
  if (k.startsWith('-')) { const t = k.slice(1).trim(); if (t) exclude.push(t); } else include.push(k);
 }
 return {include, exclude};
}
function termRegex(raw: string) {
 const quoted = raw.length > 2 && raw.startsWith('"') && raw.endsWith('"');
 const term = (quoted ? raw.slice(1, -1) : raw).trim();
 if (!term) return /(?!)/;
 const whole = quoted || term.length <= 3;
 return new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}${whole ? '(?![\\p{L}\\p{N}])' : ''}`, 'iu');
}
export function matchingAdditions(previous: Set<string>, next: string[], keywords: string[]) {
 const {include, exclude} = parseKeywords(keywords);
 const inc = include.map(termRegex), exc = exclude.map(termRegex);
 return next.filter(line => !previous.has(lineHash(line)) && (!inc.length || inc.some(r => r.test(line))) && !exc.some(r => r.test(line)));
}

// Finds the link that sat next to an alert line: exact anchor text first, otherwise the longest anchor text that makes up a good part of the line.
export function linkFor(line: string, links: Link[]) {
 let best: Link | undefined;
 for (const l of links) {
  if (l.text === line) return l.href;
  if (l.text.length >= 8 && l.text.length * 3 >= line.length && line.includes(l.text) && (!best || l.text.length > best.text.length)) best = l;
 }
 return best?.href;
}
export function buildAlert(additions: string[], links: Link[]): AlertContent {
 return {v: 2, items: additions.slice(0, MAX_ALERT_ITEMS).map(t => { const h = linkFor(t, links); return h ? {t, h} : {t}; }), more: Math.max(0, additions.length - MAX_ALERT_ITEMS)};
}

export class PageError extends Error {status:number;constructor(message:string,status:number){super(message);this.status=status;}}
export async function readPage(input:string, f:typeof fetch=fetch, allowShort=false) {
 let url=validUrl(input); const signal=AbortSignal.timeout(18000);
 for(let i=0;i<4;i++) {
 const res=await f(url,{redirect:'manual',signal,headers:{'User-Agent':'GazeRadar/0.2 (website monitoring)','Accept':'text/html,text/plain'}});
 if([301,302,303,307,308].includes(res.status)){await res.body?.cancel(); const next=res.headers.get('location'); if(!next)throw new Error('The page redirected without a destination.');url=validUrl(new URL(next,url).toString());continue;}
 if(!res.ok){await res.body?.cancel();throw new PageError(`Website returned ${res.status}. Check the original link or try again later.`,res.status);}
 if(!/text\/(html|plain)/i.test(res.headers.get('content-type')||'')){await res.body?.cancel();throw new Error('This monitor supports HTML or text pages.');}
 const reader=res.body?.getReader(); if(!reader)throw new Error('The website returned an empty page.');
 let size=0;const parts:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000){await reader.cancel();throw new Error('This page is too large. Try a more specific careers URL.');}parts.push(value);}
 const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}
 const html=new TextDecoder().decode(buffer);const data=pageData(html,url);if(!allowShort&&data.lines.join('').length<120)throw new Error('Not enough readable text. This page may require JavaScript or block monitoring.');return {...data,html,url};
 }
 throw new Error('Too many redirects. Use the final careers-page URL.');
}
