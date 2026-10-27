import test from 'node:test';
import assert from 'node:assert/strict';
import {jobCandidates} from '../lib/job-discovery.ts';
import {readSource} from '../lib/sources.ts';
const base='https://employer.ca/careers';
test('discovery follows direct trusted posting links, deduplicates, and excludes forms',()=>{
 const links=['https://employer.ca/jobs/teacher','https://employer.ca/jobs/teacher#details','https://evil.example/jobs/teacher','https://employer.ca/jobs/apply','https://school.applytojobs.ca/jobs/123','https://employer.ca/about'];
 assert.deepEqual(jobCandidates(links.map(href=>({href,text:'Teacher'})),base),[links[0],links[4]]);
});
test('a careers page discovers structured jobs through at most three linked pages and marks the sample partial',async()=>{
 const calls=[];
 const html='<p>Our careers page lists opportunities for qualified candidates to join our teaching team. Review the position pages for salary, location and requirements.</p>'+Array.from({length:5},(_,i)=>`<a href="/jobs/${i}">Teacher position ${i}</a>`).join('');
 const f=async url=>{calls.push(url);return new Response(url===base?html:`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:'Teacher',url,baseSalary:{currency:'CAD',value:{value:26,unitText:'HOUR'}}})}</script>`,{headers:{'content-type':'text/html'}});};
 const result=await readSource(base,'jobs',f);
 assert.equal(calls.length,4);assert.equal(result.jobs.length,3);assert.equal(result.jobs[0].salary,26);
 assert.equal(result.structured,true);assert.equal(result.truncated,true);
});
test('failed linked pages retain a readable page-text baseline rather than inventing jobs',async()=>{
 const f=async url=>new Response(url===base?'<p>Our teaching careers page provides information about working here and opportunities available for experienced teachers in the local community.</p><a href="/jobs/1">Teacher position</a>':'Unavailable',{status:url===base?200:404,headers:{'content-type':'text/html'}});
 const result=await readSource(base,'jobs',f);assert.equal(result.jobs.length,0);assert.equal(result.structured,false);
});
