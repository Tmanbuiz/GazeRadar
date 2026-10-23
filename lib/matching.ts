import type {JobProfile, HousingProfile} from './preferences.ts';

// Deliberately small, editable vocabulary. A suggestion is never a qualification claim.
export const skillTerms = ['administration','customer service','Microsoft Office','Excel','Word','PowerPoint','data entry','scheduling','bookkeeping','payroll','accounting','QuickBooks','communication','teamwork','leadership','project management','teaching','counselling','youth support','case management','social work','First Aid','CPR','ASIST','MANDT','nursing','patient care','personal care','food safety','driving','forklift','welding','electrical','plumbing','carpentry','sales','retail','cash handling','inventory','warehouse','cleaning','hospitality','French','English','bilingual','Python','JavaScript','TypeScript','React','SQL','Linux','AWS','Azure','Cloudflare','cybersecurity','networking','software development','engineering','AutoCAD','research','marketing','SEO','graphic design'];
const titleTerms = ['administrative assistant','office administrator','receptionist','executive assistant','customer service representative','educational assistant','teacher','youth support worker','youth care worker','support worker','social worker','counsellor','nurse','personal support worker','accountant','bookkeeper','payroll administrator','project manager','coordinator','software developer','software engineer','web developer','data analyst','IT support','network administrator','electrician','plumber','carpenter','welder','truck driver','delivery driver','warehouse associate','sales associate','retail supervisor','cook','food service worker','cleaner','research assistant','marketing specialist'];
const terms=new Map<string,RegExp>();
export function hasTerm(text:string, term:string):boolean {
 const t=term.toLowerCase().trim();if(!t)return false;
 let re=terms.get(t);if(!re){re=new RegExp(`(?<![\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![\\p{L}\\p{N}])`,'iu');if(terms.size>=1000)terms.delete(terms.keys().next().value!);terms.set(t,re);}return re.test(text);
}
export function suggestProfile(text:string) {
 const clean=text.slice(0,100000);
 return {skills:skillTerms.filter(t=>hasTerm(clean,t)).slice(0,30),titles:titleTerms.filter(t=>hasTerm(clean,t)).slice(0,8)};
}
export type Job = {url:string; title:string; company:string; location:string; description:string; employment:string; remote:boolean; salary:number|null; salaryUnit:string; currency:string; expires:string|null};
export type Home = {url:string; title:string; location:string; price:number|null; currency:string; bedrooms:number|null; propertyType:string; mode:'rent'|'buy'|'unknown'; status:string; description:string; photos:string[]; openHouse:string[]};
export type Match = {relevant:boolean; band:'Strong match'|'Possible match'|'Stretch role'; reasons:string[]; review:string[]};
export function matchJob(j:Job,p:JobProfile,now=Date.now()):Match {
 const all=`${j.title} ${j.description} ${j.company}`;
 const titles=p.titles.filter(t=>hasTerm(j.title,t));
 const skills=p.skills.filter(s=>hasTerm(all,s));
 const reasons:string[]=[],review:string[]=[];
 if(titles.length)reasons.push(`Job title matches: ${titles.join(', ')}.`);
 if(skills.length)reasons.push(`Your listed skills appear: ${skills.slice(0,6).join(', ')}.`);
 let relevant=(!p.titles.length&&!p.skills.length)||titles.length>0||skills.length>=2;
 if(j.expires&&Number.isFinite(Date.parse(j.expires))&&Date.parse(j.expires)<now){relevant=false;review.push('The advertised deadline has passed.');}
 if(p.locations.length){
  if(p.locations.some(l=>hasTerm(j.location,l)))reasons.push(`Location matches ${j.location}.`);
  else if(j.remote&&p.workMode==='remote')review.push('Remote role: check country and province eligibility.');
  else if(j.location){relevant=false;review.push('Location is outside your preferences.');}
  else review.push('Location was not provided.');
 }
 if(p.workMode==='remote'&&!j.remote){relevant=false;review.push('Not identified as a remote role.');}
 if(p.workMode==='hybrid'&&!hasTerm(all+' '+j.location,'hybrid')){relevant=false;review.push('Not identified as a hybrid role.');}
 if(p.workMode==='onsite'&&j.remote){relevant=false;review.push('Remote role rather than your on-site preference.');}
 if(p.employment.length&&j.employment&&!p.employment.some(t=>j.employment.toLowerCase().replace(/[_-]/g,' ').includes(t.toLowerCase().replace(/[_-]/g,' '))))relevant=false;
 if(p.minimumSalary!==null){
  if(j.salary!==null&&j.currency==='CAD'&&/^year$/i.test(j.salaryUnit)){if(j.salary<p.minimumSalary)relevant=false;else reasons.push('Published annual CAD salary meets your minimum.');}
  else review.push('Annual CAD salary is unavailable; check pay with the employer.');
 }
 const unlisted=skillTerms.filter(s=>hasTerm(j.description,s)&&!p.skills.some(x=>x.toLowerCase()===s.toLowerCase()));
 if(unlisted.length)review.push(`Also mentioned in the posting: ${unlisted.slice(0,5).join(', ')}. Review whether these are required.`);
 review.push('Rule-based suggestion. Review qualifications, work eligibility and the original posting.');
 if(!reasons.length)reasons.push('Shown from your selected source; add titles and skills for closer matching.');
 return {relevant,band:titles.length&&skills.length>=2?'Strong match':titles.length||skills.length>=2?'Possible match':'Stretch role',reasons,review};
}
export function matchHome(h:Home,p:HousingProfile):{relevant:boolean;reasons:string[];review:string[]} {
 let relevant=true;const reasons:string[]=[],review:string[]=[];
 if(p.mode!=='any'){if(h.mode==='unknown')review.push('Rent or buy was not provided by the source.');else if(h.mode!==p.mode)relevant=false;}
 if(p.maximumPrice!==null){if(h.price===null||h.currency!=='CAD'||(p.mode!=='any'&&h.mode==='unknown'))review.push('Comparable CAD price is unavailable; review the source.');else if(h.price>p.maximumPrice)relevant=false;else reasons.push('Listed price is within your budget.');}
 if(p.bedrooms!==null){if(h.bedrooms===null)review.push('Bedroom count was not provided.');else if(h.bedrooms<p.bedrooms)relevant=false;else reasons.push(`${h.bedrooms} bedrooms meets your minimum.`);}
 if(p.locations.length){if(p.locations.some(l=>hasTerm(h.location,l)))reasons.push(`Location matches ${h.location}.`);else if(h.location)relevant=false;else review.push('Location was not provided.');}
 if(p.propertyType&&!hasTerm(h.propertyType+' '+h.title+' '+h.description,p.propertyType))relevant=false;
 if(!reasons.length)reasons.push('Found on your selected property source.');
 return {relevant,reasons,review};
}
