import {listingUrl} from './listing-url.ts';
import {pageLines} from './monitor.ts';
import type {Home,Job} from './matching.ts';
type Obj=Record<string,unknown>;
const object=(x:unknown):Obj=>x&&typeof x==='object'&&!Array.isArray(x)?x as Obj:{};
const str=(x:unknown,max=12000)=>typeof x==='string'?x.trim().slice(0,max):'';
const num=(x:unknown):number|null=>{if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)&&n>=0?n:null;};
const list=(x:unknown):unknown[]=>Array.isArray(x)?x:x?[x]:[];
function url(x:unknown,base:string):string {try{return listingUrl(str(x,2000),base);}catch{return base;}}
function address(x:unknown):string {if(typeof x==='string')return str(x,300);const a=object(x);return [...new Set(['streetAddress','addressLocality','addressRegion','postalCode','addressCountry'].map(k=>typeof a[k]==='string'?str(a[k],100):str(object(a[k]).name,100)).filter(Boolean))].join(', ');}
const text=(x:unknown)=>pageLines(`<p>${str(x)}</p>`).join('\n');
function kind(x:Obj):string[]{return list(x['@type']).filter(t=>typeof t==='string') as string[];}
export function structuredListings(html:string,base:string):{jobs:Job[];homes:Home[];truncated:boolean} {
 const nodes:Obj[]=[];let visited=0,capped=false;
 function walk(v:unknown,depth=0){if(depth>12||visited++>4000){capped=true;return;}if(Array.isArray(v)){if(v.length>200)capped=true;for(const x of v.slice(0,200))walk(x,depth+1);return;}if(!v||typeof v!=='object')return;const o=object(v);if(o['@type'])nodes.push(o);for(const [k,x]of Object.entries(o))if(k!=='description')walk(x,depth+1);}
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{walk(JSON.parse(m[1]));}catch{}}
 const nested=new Set(nodes.flatMap(o=>kind(o).includes('RealEstateListing')?[object(o.about),object(o.mainEntity)]:[]));
 const jobs:Job[]=[],homes:Home[]=[];
 for(const o of nodes){
  const types=kind(o);
  if(types.includes('JobPosting')){
   const s=object(o.baseSalary),v=object(s.value);
   const loc=list(o.jobLocation).map(x=>address(object(x).address)).filter(Boolean).join('; ');
   jobs.push({url:url(o.url??o['@id'],base),title:str(o.title,200)||'Job posting',company:str(object(o.hiringOrganization).name,200),location:loc,description:text(o.description),employment:list(o.employmentType).map(x=>str(x,100)).join(', '),remote:list(o.jobLocationType).some(x=>String(x).toUpperCase()==='TELECOMMUTE'),salary:num(v.minValue??v.value??s.value),salaryUnit:str(v.unitText,20).toUpperCase(),currency:str(s.currency,10).toUpperCase(),expires:str(o.validThrough,50)||null});
  }
  if(!nested.has(o)&&types.some(t=>['RealEstateListing','SingleFamilyResidence','Apartment','House','Residence','Accommodation'].includes(t))){
   const about=object(o.about??o.mainEntity);const residence=Object.keys(about).length?about:o;
   const offers=object(list(o.offers??residence.offers)[0]);const spec=object(offers.priceSpecification);
   const rawStatus=str(offers.availability,100).split('/').pop()||str(o.status,100);
   const mode=/Lease|Rent/i.test(str(offers.businessFunction)||str(o['@type']))?'rent':/Sell|Sale/i.test(str(offers.businessFunction))?'buy':'unknown';
   const ph=list(o.image??residence.image).map(x=>typeof x==='string'?x:object(x).url).filter(x=>typeof x==='string'&&x.startsWith('https://')).map(x=>str(x,1000)).slice(0,100).sort();
   const openHouse=list(o.event??o.events).filter(x=>/open.?house/i.test(str(object(x).name))).map(x=>`${str(object(x).name,100)} ${str(object(x).startDate,80)} ${str(object(x).endDate,80)}`).sort();
   homes.push({url:url(o.url??residence.url??o['@id'],base),title:str(o.name??residence.name,200)||address(residence.address)||'Property listing',location:address(residence.address??o.address),price:num(offers.price??spec.price??o.price),currency:str(offers.priceCurrency??spec.priceCurrency,10).toUpperCase(),bedrooms:num(residence.numberOfBedrooms??o.numberOfBedrooms),propertyType:kind(residence).join(', '),mode,status:rawStatus,description:text(o.description??residence.description),photos:ph,openHouse});
  }
 }
 // One result per actual destination. Nested residences often repeat the enclosing listing.
 const unique=<T extends {url:string}>(rows:T[])=>{const result=new Map<string,T>();for(const r of rows)if(!result.has(r.url))result.set(r.url,r);return [...result.values()].slice(0,100);};
 return {jobs:unique(jobs),homes:unique(homes),truncated:capped||jobs.length>100||homes.length>100};
}

export function propertyChanges(previous:Home,next:Home,options:{price:boolean;status:boolean;details:boolean;photos:boolean;openHouse:boolean}):string[] {
 const out:string[]=[];
 if(options.price&&previous.price!==null&&next.price!==null&&previous.currency===next.currency&&previous.price!==next.price)out.push(`Price ${next.price<previous.price?'reduced':'increased'}: ${previous.currency||'currency unspecified'} ${previous.price.toLocaleString('en-CA')} → ${next.price.toLocaleString('en-CA')}.`);
 if(options.status&&previous.status&&next.status&&previous.status!==next.status)out.push(`Published listing status changed: ${previous.status} → ${next.status}.`);
 if(options.details&&previous.description!==next.description)out.push('Listing description changed. Review the original listing.');
 if(options.details&&previous.bedrooms!==null&&next.bedrooms!==null&&previous.bedrooms!==next.bedrooms)out.push(`Bedroom count changed: ${previous.bedrooms} → ${next.bedrooms}.`);
 if(options.photos&&JSON.stringify(previous.photos)!==JSON.stringify(next.photos))out.push('The listing’s photo links changed.');
 if(options.openHouse&&JSON.stringify(previous.openHouse)!==JSON.stringify(next.openHouse))out.push(`Open-house details changed: ${next.openHouse.join('; ')||'no open-house details currently published'}.`);
 return out;
}
