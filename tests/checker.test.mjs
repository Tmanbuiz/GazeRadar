import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {checkWatch} from '../lib/checker.ts';
import {PageError} from '../lib/monitor.ts';
const now=1800000000000,owner='email-otp:u';
const home={url:'https://example.com/house',title:'Example home',location:'Fredericton',price:499000,currency:'CAD',bedrooms:3,propertyType:'House',mode:'buy',status:'ForSale',description:'A home',photos:[],openHouse:[]};
const page=(homes=[])=>({homes,jobs:[],lines:['A readable property source'],links:[],truncated:false,structured:true});
async function watch(db,category='housing'){
 await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,category) VALUES (?,?,?,?,?,?,?)').bind('w',owner,'My watch',home.url,'[]',now,category).run();
 return db.prepare('SELECT * FROM watches WHERE id=?').bind('w').first();
}
const get=db=>db.prepare('SELECT * FROM watches WHERE id=?').bind('w').first();
test('first property match, unchanged checks, price reductions, and cross-account isolation',async()=>{
 const db=makeDb(),w=await watch(db);
 let result=await checkWatch({db,watch:w,now,read:async()=>page([home])});assert.equal(result.changes,1);
 const e=await db.prepare('SELECT * FROM events').first();assert.equal(e.owner,owner);assert.equal(e.emailed,1);assert.match(e.content,/New property match/);
 result=await checkWatch({db,watch:await get(db),now:now+60001,read:async()=>page([home])});assert.equal(result.changes,0);
 result=await checkWatch({db,watch:await get(db),now:now+120002,read:async()=>page([{...home,price:479000}])});assert.equal(result.changes,1);
 assert.match((await db.prepare('SELECT content FROM events ORDER BY created DESC LIMIT 1').first()).content,/Price reduced/);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM opportunities WHERE owner=?').bind('someone-else').first()).n,0);
 assert.ok((await get(db)).next_check>now);
});
test('existing tracked property still alerts when its price moves outside the search budget',async()=>{
 const db=makeDb(),w=await watch(db);
 await db.prepare('INSERT INTO profiles (id,owner,kind,content,updated) VALUES (?,?,?,?,?)').bind('p',owner,'housing',JSON.stringify({mode:'buy',locations:[],maximumPrice:500000,bedrooms:null,propertyType:''}),now).run();
 await checkWatch({db,watch:w,now,read:async()=>page([home])});
 const r=await checkWatch({db,watch:await get(db),now:now+60001,read:async()=>page([{...home,price:550000}])});assert.equal(r.changes,1);
});
test('a missing listing alerts once, preserves the baseline and never claims it sold',async()=>{
 const db=makeDb();await checkWatch({db,watch:await watch(db),now,read:async()=>page([home])});const saved=(await get(db)).snapshot;
 const missing=async()=>{throw new PageError('Website returned 404. Check the link.',404);};
 await assert.rejects(checkWatch({db,watch:await get(db),now:now+60001,read:missing}));
 await assert.rejects(checkWatch({db,watch:await get(db),now:now+120002,read:missing}));
 const r=await db.prepare("SELECT content FROM events WHERE content LIKE '%Listing unavailable:%'").all();assert.equal(r.results.length,1);assert.match(r.results[0].content,/does not confirm/);assert.equal((await get(db)).snapshot,saved);assert.equal((await get(db)).checking,0);
});
test('blocked pages cannot replace a previously structured listing baseline',async()=>{
 const db=makeDb();await checkWatch({db,watch:await watch(db),now,read:async()=>page([home])});const snapshot=(await get(db)).snapshot;
 await assert.rejects(checkWatch({db,watch:await get(db),now:now+60001,read:async()=>({...page(),structured:false,lines:['Please complete a robot check']})}),/no longer readable/);
 assert.equal((await get(db)).snapshot,snapshot);
});
test('pause, minimum interval and check leases prevent unwanted repeated checks',async()=>{
 const db=makeDb(),w=await watch(db);await db.prepare('UPDATE watches SET active=0 WHERE id=?').bind('w').run();await assert.rejects(checkWatch({db,watch:await get(db),now,read:async()=>page()}),/Resume/);
 await db.prepare('UPDATE watches SET active=1,checking=? WHERE id=?').bind(now,'w').run();await assert.rejects(checkWatch({db,watch:w,now:now+1,read:async()=>page()}),/already/);
 await db.prepare('UPDATE watches SET checking=0,checked=? WHERE id=?').bind(now,'w').run();await assert.rejects(checkWatch({db,watch:await get(db),now:now+1,read:async()=>page()}),/minute/);
});
test('ordinary website checks save a baseline before creating text-change alerts',async()=>{
 const db=makeDb(),w=await watch(db,'website');const plain={homes:[],jobs:[],links:[],truncated:false,structured:false,lines:['Existing content on the source page']};
 const first=await checkWatch({db,watch:w,now,read:async()=>plain});assert.equal(first.baseline,true);assert.equal(first.changes,0);
 const second=await checkWatch({db,watch:await get(db),now:now+60001,read:async()=>({...plain,lines:[...plain.lines,'New stock is now available']})});assert.equal(second.changes,1);
});
