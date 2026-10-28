import type {Job} from './matching.ts';
import type {JobProfile} from './preferences.ts';
const clean=(s:string)=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set('the and for with that this from have has are was were will your you our their into who can job role work'.split(' '));
const words=(s:string)=>new Set((clean(s).toLowerCase().match(/[a-z][a-z+#-]{2,}/g)||[]).filter(w=>!stop.has(w)));
export function applicationDraft(job:Job,profile:JobProfile,cv:string,name:string,format:'email'|'short'){
 const description=clean(job.description||'');
 const terms=words(job.title+' '+description);
 const skills=profile.skills.filter(s=>clean(s)&&[...words(s)].some(t=>terms.has(t))).slice(0,5);
 const evidence=cv.split(/\n+|(?<=[.!?])\s+/).map(clean).filter(s=>s.length>=25&&s.length<=450)
  .map((text,index)=>({text,index,score:[...words(text)].filter(t=>terms.has(t)).length}))
  .filter(s=>s.score>=2).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,2).map(s=>s.text);
 const title=clean(job.title)||'the advertised role',company=clean(job.company);
 const subject=`Application for ${title}${company?' — '+company:''}`;
 const qualifications=skills.length?`My reviewed skills include ${skills.join(', ')}.`:'';
 const supporting=evidence.length?`Relevant details from my CV:\n${evidence.map(s=>'• '+s).join('\n')}`:'';
 const opening=`I am writing to express my interest in ${title}${company?' at '+company:''}.`;
 const body=format==='short'?[`Hello, ${opening}`,qualifications,supporting,'I would welcome the opportunity to discuss my suitability for this role.',clean(name)||'[Your name]'].filter(Boolean).join('\n\n'):
 ['Dear Hiring Team,',opening,qualifications,supporting,'I would welcome the opportunity to discuss how my experience could contribute to your team. Thank you for considering my application.','Kind regards,\n'+(clean(name)||'[Your name]')].filter(Boolean).join('\n\n');
 return {subject,body,skills,evidence,description};
}
