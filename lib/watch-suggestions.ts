import type {JobProfile} from './preferences';
export type WatchSuggestion={name:string;url:string;reason:string;keywords:string};
export function suggestJobWatches(profile:JobProfile,existing:readonly string[]=[]):WatchSuggestion[]{
 const clean=(values:string[])=>[...new Map(values.map(v=>v.replace(/[,\r\n]/g,' ').trim().slice(0,60)).filter(v=>v&&!v.startsWith('-')).map(v=>[v.toLowerCase(),v])).values()];
 const titles=clean(profile.titles),skills=clean(profile.skills),locations=clean(profile.locations);
 const roles=(titles.length?titles:skills).slice(0,3);
 if(!roles.length)return [];
 const keywords=clean([...titles,...skills]).slice(0,15).join(', ');
 const nb=locations.some(l=>/\b(new brunswick|nb|fredericton|oromocto|new maryland|moncton|saint john)\b/i.test(l));
 const seen=new Set(existing),results:WatchSuggestion[]=[];
 const add=(name:string,url:string,reason:string,terms=keywords)=>{
  if(seen.has(url))return;
  seen.add(url);results.push({name:name.slice(0,100),url,reason,keywords:terms});
 };
 for(const role of roles){
  const terms=clean([role,...titles,...skills]).slice(0,15).join(', ');
  const bank=new URL('https://www.jobbank.gc.ca/jobsearch/jobsearch');
  bank.searchParams.set('dkw',role);if(nb)bank.searchParams.set('fprov','NB');bank.searchParams.set('sort','M');
  add('Job Bank — '+role,bank.href,nb?'Keyword search across New Brunswick.':'Keyword search across Canada.',terms);
  for(const location of locations.slice(0,2)){
   const url=new URL('https://www.workopolis.com/search');
   url.searchParams.set('l',location);url.searchParams.set('q',role);
   add('Workopolis — '+role+' in '+location,url.href,'Searches this role in '+location+'.',terms);
  }
 }
 const interest=[...titles,...skills].join(' ');
 if(nb&&/\b(youth|behaviou?ral|support worker)\b/i.test(interest)){
  add('BBI — Youth support careers','https://beyondbehaviouralintervention.ca/careers/','Employer careers page for youth support and behavioural services.');
  add('FRYS — Child and youth careers','https://www.frysinc.com/careers','Fredericton employer careers page for child and youth work.');
 }
 if(nb&&/\b(teacher|teaching|education|educational|counsellor)\b/i.test(interest)){
  add('APSEA — Education careers','https://apseacareers.applytojobs.ca/','Employer job board for education and student support.');
  add('GNB — Open competitions','https://ere.gnb.ca/competition.aspx?strIntraSort=t&strSort=d&strType=o','Provincial public-service opportunities, including education.');
 }
 return results;
}

