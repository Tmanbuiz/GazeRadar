import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {checkWatch} from '../lib/checker.ts';
import {listOpportunityRows,updateOpportunityState} from '../lib/opportunities.ts';

const now=1800000000000,owner='email-otp:tracking-test';
const home=n=>({url:`https://example.com/homes/${n}`,title:`Home ${n}`,location:'Canada',
 price:400000,currency:'CAD',bedrooms:3,propertyType:'House',mode:'buy',status:'ForSale',
 description:'Example home',photos:[],openHouse:[]});
const job=n=>({url:`https://example.com/jobs/${n}`,title:`Role ${n}`,company:'Example',
 location:'Canada',description:'Example job',employment:'',remote:false,salary:null,
 salaryUnit:'',currency:'',expires:null});
async function addWatch(db,id,category='housing',account=owner){
 await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,category) VALUES (?,?,?,?,?,?,?)')
  .bind(id,account,id,`https://example.com/source/${id}`,'[]',now,category).run();
}
async function run(db,id,records,step,{truncated=false}={}){
 const watch=await db.prepare('SELECT * FROM watches WHERE id=?').bind(id).first();
 const page={jobs:watch.category==='jobs'?records:[],homes:watch.category==='housing'?records:[],
  lines:['Stable source content'],links:[],structured:true,truncated};
 return checkWatch({db,watch,now:now+step*60001,read:async()=>page});
}
const rowFor=(db,id,url)=>db.prepare('SELECT * FROM opportunities WHERE watch_id=? AND url=?').bind(id,url).first();

test('new jobs keep arriving after 200 discoveries while history stays bounded and user choices survive',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'jobs','jobs');
 await addWatch(db,'other','jobs','email-otp:other');await run(db,'other',[job('other')],0);
 for(let step=0;step<5;step++){
  const jobs=Array.from({length:100},(_,n)=>job(step*100+n));
  const result=await run(db,'jobs',jobs,step);assert.equal(result.changes,100);
  for(const j of jobs)assert.ok(await rowFor(db,'jobs',j.url),'current job must be retained');
  if(step===0)for(const [n,state]of [[0,'saved'],[1,'applied'],[2,'dismissed']]){
   await updateOpportunityState(db,owner,(await rowFor(db,'jobs',job(n).url)).id,state);
  }
 }
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE watch_id='jobs' AND state='new'").first()).n,200);
 for(const [n,state]of [[0,'saved'],[1,'applied'],[2,'dismissed']])assert.equal((await rowFor(db,'jobs',job(n).url)).state,state);
 assert.equal((await rowFor(db,'other',job('other').url)).available,1);
 assert.equal((await run(db,'jobs',Array.from({length:100},(_,n)=>job(400+n)),5)).changes,0);
});

test('a full history still admits new properties from a truncated source',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'homes');
 for(let step=0;step<3;step++){
  const result=await run(db,'homes',Array.from({length:100},(_,n)=>home(step*100+n)),step,{truncated:true});
  assert.equal(result.changes,100);
 }
 assert.ok(await rowFor(db,'homes',home(299).url));
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE watch_id='homes'").first()).n,200);
});

for(const state of ['saved','applied','dismissed'])test(`${state} follows a job when another source discovers it`,async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'first','jobs');await addWatch(db,'second','jobs');
 await run(db,'first',[job('same')],0);
 await updateOpportunityState(db,owner,(await rowFor(db,'first',job('same').url)).id,state);
 await run(db,'second',[{...job('same'),description:'Newer source details'}],1);
 const rows=await listOpportunityRows(db,owner,'jobs');
 assert.equal(rows[0].source_name,'second');assert.equal(rows[0].state,state);
 assert.ok(rows.every(r=>r.state===state));
 await run(db,'first',[job('same')],2);
 assert.equal((await rowFor(db,'first',job('same').url)).state,state);
});

test('existing conflicting duplicates show the saved choice and an explicit reset updates every copy',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'first');await addWatch(db,'second');
 await run(db,'first',[home('same')],0);await run(db,'second',[home('same')],1);
 const first=await rowFor(db,'first',home('same').url);
 // Model the legacy state that existed before cross-source inheritance.
 await db.prepare("UPDATE opportunities SET state='saved' WHERE id=?").bind(first.id).run();
 let rows=await listOpportunityRows(db,owner,'housing');
 assert.equal(rows[0].source_name,'second');assert.equal(rows[0].state,'saved');
 await updateOpportunityState(db,owner,rows[0].id,'new');
 await run(db,'first',[home('same')],2);
 rows=await listOpportunityRows(db,owner,'housing');assert.ok(rows.every(r=>r.state==='new'));
});

test('one account cannot inherit or change another account’s choice for the same URL',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'mine');await addWatch(db,'theirs','housing','email-otp:other');
 await run(db,'mine',[home('same')],0);const mine=await rowFor(db,'mine',home('same').url);
 await updateOpportunityState(db,owner,mine.id,'saved');await run(db,'theirs',[home('same')],1);
 const theirs=await rowFor(db,'theirs',home('same').url);assert.equal(theirs.state,'new');
 await updateOpportunityState(db,owner,theirs.id,'dismissed');
 await updateOpportunityState(db,'email-otp:other',mine.id,'dismissed');
 assert.equal((await rowFor(db,'mine',home('same').url)).state,'saved');
 assert.equal((await listOpportunityRows(db,'email-otp:other','housing'))[0].state,'new');
});

test('an unchanged property returning to complete source data alerts once',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'homes');
 await run(db,'homes',[home('a'),home('b')],0);
 assert.equal((await run(db,'homes',[home('b')],1)).changes,1);
 assert.equal((await run(db,'homes',[home('a'),home('b')],2)).changes,1);
 const event=await db.prepare('SELECT content FROM events ORDER BY created DESC LIMIT 1').first();
 assert.match(event.content,/present in this source again/);assert.match(event.content,/Review the original listing/);
 assert.equal((await rowFor(db,'homes',home('a').url)).available,1);
 assert.equal((await run(db,'homes',[home('a'),home('b')],3)).changes,0);
});

test('returning properties respect status alerts while still reporting a simultaneous price change',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'homes');
 await run(db,'homes',[home('a'),home('b')],0);await run(db,'homes',[home('b')],1);
 assert.equal((await run(db,'homes',[{...home('a'),price:380000},home('b')],2)).changes,2);
 const event=await db.prepare('SELECT content FROM events ORDER BY created DESC LIMIT 1').first();
 assert.match(event.content,/present in this source again/);assert.match(event.content,/Price reduced/);
 await db.prepare('UPDATE watches SET options=? WHERE id=?').bind(JSON.stringify({status:false}),'homes').run();
 await run(db,'homes',[home('b')],3);
 assert.equal((await run(db,'homes',[{...home('a'),price:380000},home('b')],4)).changes,0);
 assert.equal((await rowFor(db,'homes',home('a').url)).available,1);
});

test('absence from partial data does not create a false property-return alert',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'homes');
 await run(db,'homes',[home('a'),home('b')],0);
 assert.equal((await run(db,'homes',[home('b')],1,{truncated:true})).changes,0);
 assert.equal((await run(db,'homes',[home('a'),home('b')],2)).changes,0);
});

test('a matching job returning unchanged also creates one source-return alert',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'jobs','jobs');
 await run(db,'jobs',[job('a'),job('b')],0);await run(db,'jobs',[job('b')],1);
 assert.equal((await run(db,'jobs',[job('a'),job('b')],2)).changes,1);
 assert.equal((await run(db,'jobs',[job('a'),job('b')],3)).changes,0);
});

test('legacy duplicated-host property rows merge without losing price or saved choices',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await addWatch(db,'legacy');
 const canonical='https://example.com/homes/123';
 const malformed=canonical+'/example.com/homes/123';
 await run(db,'legacy',[{...home(123),url:malformed},{...home(123),url:canonical+'/',price:null}],0);
 const old=await rowFor(db,'legacy',malformed);
 await db.prepare("UPDATE opportunities SET state='saved' WHERE id=?").bind(old.id).run();
 let rows=await listOpportunityRows(db,owner,'housing');
 assert.equal(rows.length,1);assert.equal(rows[0].url,canonical);
 assert.equal(JSON.parse(rows[0].content).price,400000);
 assert.equal(JSON.parse(rows[0].content).url,canonical);
 assert.equal(rows[0].state,'saved');
 await updateOpportunityState(db,owner,rows[0].id,'dismissed');
 assert.ok((await db.prepare('SELECT state FROM opportunities WHERE owner=?').bind(owner).all()).results.every(r=>r.state==='dismissed'));
 await run(db,'legacy',[{...home(123),url:canonical,price:390000}],1);
 rows=await listOpportunityRows(db,owner,'housing');
 assert.equal(rows.length,1);assert.equal(JSON.parse(rows[0].content).price,390000);
 assert.equal(rows[0].state,'dismissed');
});
