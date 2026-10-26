import test from 'node:test';
import assert from 'node:assert/strict';
import {matchJob,matchHome,suggestProfile,hasTerm} from '../lib/matching.ts';
import {jobProfile,housingProfile,emptyJobs,emptyHousing} from '../lib/preferences.ts';
import {structuredListings,propertyChanges} from '../lib/structured.ts';
import {jobFeed,readSource} from '../lib/sources.ts';
const job={url:'https://example.com/jobs/1',title:'Administrative assistant',company:'Example',location:'Fredericton, NB',description:'Customer service and Excel required. French is an asset.',employment:'FULL_TIME',remote:false,salary:55000,salaryUnit:'YEAR',currency:'CAD',expires:null};
const home={url:'https://example.com/homes/1',title:'123 Example Street',location:'Fredericton, NB',price:499000,currency:'CAD',bedrooms:3,propertyType:'House',mode:'buy',status:'ForSale',description:'Three-bedroom home',photos:[],openHouse:[]};
test('CV suggestions expose only editable skills and titles, with whole-word matching',()=>{
 const p=suggestProfile('Jane Example jane@example.com 555-555-5555. Administrative assistant with Excel, customer service, Word and ASIST.');
 assert.ok(p.titles.includes('administrative assistant'));assert.ok(p.skills.includes('Excel'));assert.equal(Object.keys(p).join(','),'skills,titles');assert.equal(hasTerm('items','IT'),false);assert.equal(hasTerm('Café français','café'),true);
});
test('job matching explains overlap and respects location, remote, salary and expiry',()=>{
 const p={...emptyJobs,titles:['administrative assistant'],skills:['Excel','customer service'],locations:['Fredericton'],minimumSalary:50000};
 const m=matchJob(job,p);assert.equal(m.relevant,true);assert.equal(m.band,'Strong match');assert.match(m.reasons.join(' '),/Excel/);assert.match(m.review.join(' '),/French/);
 assert.equal(matchJob({...job,location:'Toronto'},p).relevant,false);
 assert.equal(matchJob(job,{...p,workMode:'remote'}).relevant,false);
 assert.equal(matchJob({...job,salary:40000},p).relevant,false);
 assert.equal(matchJob({...job,expires:'2020-01-01'},p).relevant,false);
 const unknown=matchJob({...job,salary:null},p);assert.equal(unknown.relevant,true);assert.match(unknown.review.join(' '),/unavailable/);
});
test('housing matching uses user budget and explicit values; unknown prices stay reviewable',()=>{
 const p={...emptyHousing,mode:'buy',maximumPrice:500000,bedrooms:3,locations:['Fredericton']};
 assert.equal(matchHome(home,p).relevant,true);assert.equal(matchHome({...home,price:550000},p).relevant,false);assert.equal(matchHome({...home,bedrooms:2},p).relevant,false);
 const m=matchHome({...home,price:null},p);assert.equal(m.relevant,true);assert.match(m.review.join(' '),/unavailable/);
});
test('profile validation limits sizes and ignores unrequested personal fields',()=>{
 const p=jobProfile({...emptyJobs,name:'Jane',email:'jane@example.com',skills:['Excel','Excel']});assert.deepEqual(p.skills,['Excel']);assert.equal('email'in p,false);
 assert.throws(()=>jobProfile({...emptyJobs,skills:Array(31).fill('x')}));assert.throws(()=>housingProfile({...emptyHousing,maximumPrice:-1}));assert.throws(()=>housingProfile({...emptyHousing,bedrooms:2.5}));
});
test('JSON-LD extracts job data, safe links and nested property offers without losing the price',()=>{
 const html=`<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'JobPosting',title:job.title,url:'/jobs/1',description:job.description,hiringOrganization:{name:'Example'},jobLocation:{address:{addressLocality:'Fredericton',addressRegion:'NB'}},baseSalary:{currency:'CAD',value:{minValue:55000,unitText:'YEAR'}}},{'@type':'RealEstateListing',url:'/homes/1',name:home.title,offers:{price:499000,priceCurrency:'CAD',businessFunction:'http://purl.org/goodrelations/v1#Sell'},mainEntity:{'@type':'House',numberOfBedrooms:3,address:{addressLocality:'Fredericton'}}}]})}</script>`;
 const d=structuredListings(html,'https://example.com/homes/1');assert.equal(d.jobs.length,1);assert.equal(d.jobs[0].salary,55000);assert.equal(d.homes.length,1);assert.equal(d.homes[0].price,499000);assert.equal(d.homes[0].bedrooms,3);assert.equal(d.homes[0].mode,'buy');assert.ok(d.jobs[0].url.startsWith('https://'));
});
test('property alerts compare selected fields and never interpret a missing price as zero',()=>{
 const opts={price:true,status:true,details:false,photos:false,openHouse:true};
 assert.match(propertyChanges(home,{...home,price:479000},opts).join(' '),/reduced.*499,000.*479,000/);
 assert.deepEqual(propertyChanges(home,{...home,price:null},opts),[]);
 assert.deepEqual(propertyChanges(home,{...home,photos:['https://example.com/new.jpg']},opts),[]);
 assert.equal(propertyChanges(home,{...home,status:'Pending'},opts).length,1);
});
test('job source adapters use fixed providers and preserve direct job URLs',async()=>{
 assert.equal(jobFeed('https://jobs.lever.co/example').kind,'lever');assert.equal(jobFeed('https://job-boards.greenhouse.io/example').kind,'greenhouse');assert.equal(jobFeed('https://jobs.lever.co/example/123'),null);assert.equal(jobFeed('https://evil.example/jobs.lever.co/example'),null);
 const calls=[];const f=async(url,opts)=>{calls.push({url,opts});return Response.json({jobs:[{id:1,title:job.title,absolute_url:job.url,content:job.description,location:{name:job.location}}]});};
 const page=await readSource('https://job-boards.greenhouse.io/example','jobs',f);assert.equal(page.jobs.length,1);assert.equal(page.jobs[0].url,job.url);assert.equal(page.structured,true);assert.match(calls[0].url,/^https:\/\/boards-api.greenhouse.io/);assert.equal(calls[0].opts.redirect,'manual');
});

test('structured source caps are visible so partial data cannot prove removals',()=>{
 const rows=Array.from({length:120},(_,i)=>({'@type':'JobPosting',title:'Job '+i,url:'https://example.com/jobs/'+i}));
 const result=structuredListings(`<script type="application/ld+json">${JSON.stringify(rows)}</script>`,'https://example.com/jobs');assert.equal(result.jobs.length,100);assert.equal(result.truncated,true);
});
test('a page with valid structured jobs can be read even without visible body text',async()=>{
 const f=async()=>new Response(`<script type="application/ld+json">${JSON.stringify({'@type':'JobPosting',title:job.title,url:job.url,description:job.description})}</script>`,{headers:{'content-type':'text/html'}});
 const result=await readSource('https://example.com/jobs/1','jobs',f);assert.equal(result.jobs.length,1);assert.equal(result.structured,true);
});


test('job source redirects are rejected without following another host',async()=>{
 let calls=0;
 await assert.rejects(readSource('https://boards.greenhouse.io/example','jobs',async(_url,init)=>{
  calls++; assert.equal(init.redirect,'manual');
  return new Response(null,{status:302,headers:{location:'https://other.example/'}});
 }),/returned 302/);
 assert.equal(calls,1);
});

test('scheme-less publisher links and nested residences produce one complete house',()=>{
 const base='https://www.royallepage.ca/en/property/example/123/';
 const residence={'@type':'House',address:{streetAddress:'123 Example',addressLocality:'Fredericton'},numberOfBedrooms:3};
 const listing={'@type':'RealEstateListing',url:'www.royallepage.ca/en/property/example/123',name:'123 Example',offers:{price:364900,priceCurrency:'CAD'},mainEntity:residence};
 const result=structuredListings(`<script type="application/ld+json">${JSON.stringify(listing)}</script>`,base);
 assert.equal(result.homes.length,1);
 assert.equal(result.homes[0].url,base.slice(0,-1));
 assert.equal(result.homes[0].price,364900);
 assert.equal(result.homes[0].bedrooms,3);
});

test('nested houses inherit their enclosing listing identity on search pages',()=>{
 const listings=[1,2].map(n=>({'@type':'RealEstateListing',url:`/homes/${n}`,offers:{price:400000+n},about:{'@type':'House',name:`Home ${n}`,numberOfBedrooms:n}}));
 const result=structuredListings(`<script type="application/ld+json">${JSON.stringify(listings)}</script>`,'https://example.com/search');
 assert.deepEqual(result.homes.map(h=>h.url),['https://example.com/homes/1','https://example.com/homes/2']);
 assert.deepEqual(result.homes.map(h=>h.bedrooms),[1,2]);
});
