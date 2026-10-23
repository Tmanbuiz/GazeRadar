import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {deliverNotifications,unsubscribe,unsubscribeToken} from '../lib/notifications.ts';
const now=1800000000000,env={AUTH_SECRET:'test-secret-not-real',APP_URL:'https://gazeradar.example.com'};
async function setup(frequency='change',noChange=0){
 const db=makeDb();await db.prepare('INSERT INTO users (id,email,created) VALUES (?,?,?)').bind('u','verified@example.com',now).run();
 await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created) VALUES (?,?,?,?,?,?)').bind('w','email-otp:u','My house','https://example.com/house','[]',now).run();
 await db.prepare('INSERT INTO notifications (owner,frequency,no_change,next_digest,updated) VALUES (?,?,?,?,?)').bind('email-otp:u',frequency,noChange,now,now).run();
 return db;
}
async function event(db,id='e',owner='email-otp:u'){await db.prepare('INSERT INTO events (id,owner,watch_id,name,url,content,created) VALUES (?,?,?,?,?,?,?)').bind(id,owner,'w','My house','https://example.com/house',JSON.stringify({v:3,items:[{t:'Price reduced: CAD 499,000 → 479,000'}]}),now).run();}
test('alerts go only to the verified account address, then retire the selected events',async()=>{
 const db=await setup();await event(db);await event(db,'other','email-otp:other');const sent=[];
 const result=await deliverNotifications({db,env,now,send:async(to,msg)=>sent.push({to,msg})});assert.equal(result.sent,1);assert.equal(sent[0].to,'verified@example.com');assert.match(sent[0].msg.content,/499,000/);assert.match(sent[0].msg.content,/\/unsubscribe\?/);
 assert.equal((await db.prepare('SELECT emailed FROM events WHERE id=?').bind('e').first()).emailed,1);assert.equal((await db.prepare('SELECT emailed FROM events WHERE id=?').bind('other').first()).emailed,0);
 assert.equal((await deliverNotifications({db,env,now:now+100,send:async()=>assert.fail('duplicate send')})).sent,0);
});
test('failed sends leave alerts pending and retry only after the backoff',async()=>{
 const db=await setup();await event(db);let calls=0;const fail=async()=>{calls++;throw new Error('provider failed');};
 assert.equal((await deliverNotifications({db,env,now,send:fail})).failed,1);assert.equal((await db.prepare('SELECT emailed FROM events').first()).emailed,0);
 await deliverNotifications({db,env,now:now+1,send:fail});assert.equal(calls,1);
 assert.equal((await deliverNotifications({db,env,now:now+900001,send:async()=>{calls++;}})).sent,1);assert.equal(calls,2);
});
test('daily and weekly digests honor due time and optional no-change confirmation',async()=>{
 const db=await setup('weekly',1);const sent=[];
 await db.prepare('UPDATE notifications SET next_digest=?').bind(now+1000).run();
 assert.equal((await deliverNotifications({db,env,now,send:async()=>assert.fail('too early')})).sent,0);
 await deliverNotifications({db,env,now:now+1001,send:async(to,msg)=>sent.push(msg)});assert.equal(sent.length,1);assert.match(sent[0].content,/No matching changes/);assert.match(sent[0].content,/not had a successful check/);
 const next=(await db.prepare('SELECT next_digest FROM notifications').first()).next_digest;assert.ok(next>=now+7*86400000);
 const off=await setup('daily',0);assert.equal((await deliverNotifications({db:off,env,now,send:async()=>assert.fail('no confirmation requested')})).sent,0);
});
test('opt-out, disabled watch email, missing setup and leases prevent sends',async()=>{
 const db=await setup('off');await event(db);const never=async()=>assert.fail('should not send');
 assert.equal((await deliverNotifications({db,env,now,send:never})).sent,0);
 await db.prepare("UPDATE notifications SET frequency='change',sending_until=?").bind(now+10000).run();assert.equal((await deliverNotifications({db,env,now,send:never})).sent,0);
 await db.prepare('UPDATE notifications SET sending_until=0').run();await db.prepare('UPDATE watches SET email_enabled=0').run();assert.equal((await deliverNotifications({db,env,now,send:never})).sent,0);
 assert.equal((await deliverNotifications({db,env:{},now})).configured,false);
});
test('signed unsubscribe tokens are account-specific and clear pending emails',async()=>{
 const db=await setup();await event(db);const token=await unsubscribeToken(env.AUTH_SECRET,'email-otp:u');
 await assert.rejects(unsubscribe(db,env.AUTH_SECRET,'email-otp:other',token),/invalid/);
 await unsubscribe(db,env.AUTH_SECRET,'email-otp:u',token);assert.equal((await db.prepare('SELECT frequency FROM notifications').first()).frequency,'off');assert.equal((await db.prepare('SELECT emailed FROM events').first()).emailed,1);
});
test('empty immediate subscribers do not starve accounts with pending events',async()=>{
 const db=await setup();await event(db);
 for(let i=0;i<4;i++){await db.prepare('INSERT INTO users (id,email,created) VALUES (?,?,?)').bind('empty'+i,`empty${i}@example.com`,now).run();await db.prepare('INSERT INTO notifications (owner,frequency,updated) VALUES (?,?,?)').bind('email-otp:empty'+i,'change',now).run();}
 let sent=0;await deliverNotifications({db,env,now,send:async()=>{sent++;}});assert.equal(sent,1);
});
