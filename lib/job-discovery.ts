import {validUrl,type Link} from './monitor.ts';

export const LINKED_JOB_LIMIT=3;
// Follow only direct posting links. Navigation, application forms and arbitrary
// off-site links never become jobs just because their anchor contains a title.
export function jobCandidates(links:Link[],base:string):string[]{
 const origin=new URL(base),seen=new Set<string>();
 for(const link of links){
  try{
   const u=new URL(validUrl(link.href));
   const trusted=u.origin===origin.origin||/(^|\.)applytojobs\.ca$/.test(u.hostname)||['jobs.lever.co','jobs.eu.lever.co','boards.greenhouse.io','job-boards.greenhouse.io'].includes(u.hostname);
   const direct=/\/(jobs?|positions?|postings?|vacancies|careers)\/[^/]+/i.test(u.pathname)||/JobDescription\.aspx/i.test(u.pathname);
   if(!trusted||!direct||/\/(apply|login|sign-?in)(\/|$)/i.test(u.pathname))continue;
   u.hash='';if(u.href!==origin.href)seen.add(u.href);
  }catch{}
 }
 return [...seen];
}
