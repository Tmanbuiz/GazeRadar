export const categories = ['jobs', 'housing', 'website'] as const;
export type Category = typeof categories[number];
export const intervals = [1, 6, 12, 24, 168];
export const frequencies = ['off', 'change', 'daily', 'weekly'] as const;
export type Frequency = typeof frequencies[number];
export type JobProfile = { skills:string[]; titles:string[]; locations:string[]; workMode:'any'|'remote'|'hybrid'|'onsite'; employment:string[]; minimumSalary:number|null };
export type HousingProfile = { mode:'any'|'rent'|'buy'; locations:string[]; maximumPrice:number|null; bedrooms:number|null; propertyType:string };
export type WatchOptions = { price:boolean; status:boolean; details:boolean; openHouse:boolean; photos:boolean };
export const defaultOptions:WatchOptions = {price:true,status:true,details:true,openHouse:true,photos:false};
export const emptyJobs:JobProfile = {skills:[],titles:[],locations:[],workMode:'any',employment:[],minimumSalary:null};
export const emptyHousing:HousingProfile = {mode:'any',locations:[],maximumPrice:null,bedrooms:null,propertyType:''};
export function jsonValue<T>(raw:string|null|undefined, fallback:T):T {try{return raw?JSON.parse(raw) as T:fallback;}catch{return fallback;}}
function strings(v:unknown, max:number, length=70):string[] {
 if (!Array.isArray(v) || v.length>max || v.some(x=>typeof x!=='string'||x.length>length)) throw new Error(`Use at most ${max} short entries.`);
 return [...new Set(v.map(x=>x.trim()).filter(Boolean))];
}
function positive(v:unknown,max:number):number|null {
 if(v===null||v===undefined||v==='')return null;
 const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw new Error('Enter a valid amount.');return n;
}
export function jobProfile(v:Record<string,unknown>):JobProfile {
 const workMode=v.workMode??'any';if(!['any','remote','hybrid','onsite'].includes(String(workMode)))throw new Error('Choose a work preference.');
 return {skills:strings(v.skills??[],30),titles:strings(v.titles??[],8),locations:strings(v.locations??[],8),workMode:workMode as JobProfile['workMode'],employment:strings(v.employment??[],5),minimumSalary:positive(v.minimumSalary,2000000)};
}
export function housingProfile(v:Record<string,unknown>):HousingProfile {
 const mode=v.mode??'any';if(!['any','rent','buy'].includes(String(mode)))throw new Error('Choose rent or buy.');
 const bedrooms=positive(v.bedrooms,20);if(bedrooms!==null&&!Number.isInteger(bedrooms))throw new Error('Bedrooms must be a whole number.');
 return {mode:mode as HousingProfile['mode'],locations:strings(v.locations??[],8),maximumPrice:positive(v.maximumPrice,100000000),bedrooms,propertyType:String(v.propertyType??'').trim().slice(0,60)};
}
export function watchOptions(v:unknown):WatchOptions {
 const o=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;
 return Object.fromEntries(Object.entries(defaultOptions).map(([k,d])=>[k,typeof o[k]==='boolean'?o[k]:d])) as WatchOptions;
}
