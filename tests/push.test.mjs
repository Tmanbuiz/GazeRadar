import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {registerPush,removePush,deliverPush} from '../lib/push.ts';
import {sendPush,PushError} from '../lib/push-provider.ts';
const now=1800000000000,env={FCM_PROJECT_ID:'gazeradar-test',FCM_CLIENT_EMAIL:'test@example.com',FCM_PRIVATE_KEY:'set'};
const device={platform:'android',token:'a'.repeat(64)};
async function seed(db,owner,id,created){
 await db.prepare('INSERT OR IGNORE INTO watches (id,owner,name,url,keywords,created,active) VALUES (?,?,?,?,?,?,1)').bind('w'+owner,owner,'Private source','https://example.com','[]',now).run();
 await db.prepare('INSERT INTO events(id,owner,watch_id,name,url,content,created,emailed) VALUES (?,?,?,?,?,?,?,1)').bind(id,owner,'w'+owner,'Private job title','https://example.com','PRIVATE_ADDRESS',created).run();
}
test('device registration limits tokens, preserves cursor, isolates accounts, and caps devices',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());const {id}=await registerPush(db,'one',device,now);
 await registerPush(db,'one',device,now+100);
 assert.equal((await db.prepare('SELECT cursor_time FROM push_devices WHERE id=?').bind(id).first()).cursor_time,now);
 await assert.rejects(registerPush(db,'two',device,now),/previous account/);
 await removePush(db,'two',id);assert.ok(await db.prepare('SELECT id FROM push_devices WHERE id=?').bind(id).first());
 for(let i=1;i<5;i++)await registerPush(db,'one',{...device,token:String(i).repeat(64)},now);
 await assert.rejects(registerPush(db,'one',{...device,token:'z'.repeat(64)},now),/five devices/);
 for(const invalid of [{...device,token:'short'},{...device,platform:'web'},{platform:'ios',token:'not-hex'.repeat(10)},{...device,token:'?'.repeat(64)}])await assert.rejects(registerPush(db,'one',invalid,now));
 await removePush(db,'one',id);assert.equal(await db.prepare('SELECT id FROM push_devices WHERE id=?').bind(id).first(),null);
});
test('push is independent of email, delivers once per device, and does not cross accounts',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await registerPush(db,'one',device,now);await registerPush(db,'two',{...device,token:'b'.repeat(64)},now);
 await seed(db,'one','old',now-1);await seed(db,'one','new-a',now+1);await seed(db,'one','new-b',now+1);
 const seen=[];const send=async d=>{seen.push(d.owner);};
 assert.equal((await deliverPush(db,env,now+2,send)).sent,1);assert.deepEqual(seen,['one']);
 assert.equal((await deliverPush(db,env,now+3,send)).sent,0);
 await seed(db,'one','new-c',now+1);assert.equal((await deliverPush(db,env,now+4,send)).sent,1);
});
test('provider failure retains cursor and backs off; unregistered tokens disable delivery',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());const {id}=await registerPush(db,'one',device,now);await seed(db,'one','new',now+1);
 assert.equal((await deliverPush(db,env,now+2,async()=>{throw new PushError();})).failed,1);
 let row=await db.prepare('SELECT * FROM push_devices WHERE id=?').bind(id).first();assert.equal(row.cursor_time,now);assert.equal(row.enabled,1);
 assert.equal((await deliverPush(db,env,now+3,async()=>assert.fail())).sent,0);
 await deliverPush(db,env,now+900003,async()=>{throw new PushError(true);});
 row=await db.prepare('SELECT enabled FROM push_devices WHERE id=?').bind(id).first();assert.equal(row.enabled,0);
});
test('unconfigured push leaves queued events untouched',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());const {id}=await registerPush(db,'one',device,now);await seed(db,'one','new',now+1);
 assert.deepEqual(await deliverPush(db,{},now+2,async()=>assert.fail()),{sent:0,failed:0});
 assert.equal((await db.prepare('SELECT cursor_time FROM push_devices WHERE id=?').bind(id).first()).cursor_time,now);
});
async function privatePem(rsa){const keys=await crypto.subtle.generateKey(rsa?{name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'}:{name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const raw=await crypto.subtle.exportKey('pkcs8',keys.privateKey);return '-----BEGIN PRIVATE KEY-----\n'+Buffer.from(raw).toString('base64')+'\n-----END PRIVATE KEY-----';}
test('Apple visible alerts use fixed hosts, generic private payloads and do not follow redirects',async()=>{
 const e={APNS_KEY_ID:'TESTKEY123',APNS_TEAM_ID:'TEAM123456',APNS_PRIVATE_KEY:await privatePem(false),APNS_BUNDLE_ID:'com.wiantribe.gazeradar'};
 for(const environment of ['production','sandbox'])await sendPush(e,{platform:'ios',token:'a'.repeat(64),environment},async(url,options)=>{
  assert.match(url,environment==='sandbox'?/^https:\/\/api\.sandbox\.push\.apple\.com\//:/^https:\/\/api\.push\.apple\.com\//);
  assert.equal(options.redirect,'manual');assert.equal(options.headers['apns-push-type'],'alert');assert.match(options.headers.authorization,/^bearer /);
  assert.equal(JSON.parse(options.body).destination,'alerts');assert.doesNotMatch(options.body,/PRIVATE|email|address|job title/);
  return new Response('{}');
 },now);
 await assert.rejects(sendPush(e,{platform:'ios',token:'a'.repeat(64),environment:'production'},async()=>new Response('',{status:302}),now),PushError);
});
test('FCM mints a signed service token, sends generic visible messages and detects revoked devices',async()=>{
 const e={...env,FCM_PRIVATE_KEY:await privatePem(true)};let calls=0;
 await assert.rejects(sendPush(e,{...device,environment:'production'},async(url,options)=>{
  assert.equal(options.redirect,'manual');calls++;
  if(url==='https://oauth2.googleapis.com/token'){assert.match(options.body.get('assertion'),/^[^.]+\.[^.]+\.[^.]+$/);return Response.json({access_token:'test-access',expires_in:3600});}
  assert.equal(url,'https://fcm.googleapis.com/v1/projects/gazeradar-test/messages:send');
  assert.equal(options.headers.authorization,'Bearer test-access');const message=JSON.parse(options.body).message;
  assert.equal(message.notification.title,'GazeRadar update');assert.equal(message.android.notification.channel_id,'gazeradar-alerts');
  return Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404});
 },now),e=>e instanceof PushError&&e.permanent);
 assert.equal(calls,2);
});
