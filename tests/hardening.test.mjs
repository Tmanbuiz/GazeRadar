import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {pageData} from '../lib/monitor.ts';
import {structuredListings} from '../lib/structured.ts';
import {checkWatch} from '../lib/checker.ts';
import {deliverNotifications,alertEmailAllowlist,alertEmailAllowed,DEFAULT_ALERT_EMAILS} from '../lib/notifications.ts';
import {reserveWatch} from '../lib/watch-capacity.ts';
import {createGoalShare} from '../lib/goals.ts';
import {verifyAccessToken} from '../lib/access-token.ts';
import {withSecurityHeaders} from '../lib/security-headers.ts';
import {failure} from '../lib/failure.ts';
import {PageError} from '../lib/monitor.ts';

const hostile={
 anchorsWithHref:'<a href="x" ',unclosedAnchors:'<a ',bareLessThan:'<',unclosedScript:'<script>x ',unclosedHead:'<head ',unclosedComment:'<!-- ',
 unclosedLdJson:'<script type="application/ld+json">',anchorsNoClose:'<a href="/jobs/x">t ',
};
test('hostile 1 MB pages are parsed in linear time',()=>{
 for(const [name,unit] of Object.entries(hostile)){
  const html=unit.repeat(Math.ceil(1000000/unit.length)).slice(0,1000000);
  const t=performance.now();pageData(html,'https://example.com/');structuredListings(html,'https://example.com/');
  assert.ok(performance.now()-t<3000,`${name} took ${Math.round(performance.now()-t)}ms`);
 }
});
test('the linear parser keeps normal page behaviour',()=>{
 const html='<html><head><title>x</title><style>p{}</style></head><body><!-- hidden --><script>var a=1</script><h2>Open roles</h2><ul><li><a href="/jobs/1">Youth Support Worker</a></li><li><A HREF=\'/jobs/2\'>Educational Assistant <b>Casual</b></A></li></ul><p>Apply before Friday please.</p><a name="x">anchor</a></body></html>';
 const d=pageData(html,'https://example.com/careers');
 assert.deepEqual(d.links,[{text:'Youth Support Worker',href:'https://example.com/jobs/1'},{text:'Educational Assistant Casual',href:'https://example.com/jobs/2'}]);
 assert.ok(d.lines.includes('Open roles')&&d.lines.includes('Apply before Friday please.'));
 assert.ok(!d.lines.some(l=>/hidden|var a|title/.test(l)));
 const ld='<script type="application/ld+json">{"@type":"JobPosting","title":"Nurse","url":"https://example.com/j/9"}</script>';
 assert.equal(structuredListings('<script>1</script>'+ld,'https://example.com/').jobs[0].title,'Nurse');
});

const now=1800000000000;
test('a check that never finishes cannot stay first in the scheduler queue',async()=>{
 const db=makeDb();
 await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,next_check,interval_hours) VALUES (?,?,?,?,?,?,?,?)').bind('w','o','n','https://example.com/','[]',now,now-1000,6).run();
 const watch=await db.prepare('SELECT * FROM watches WHERE id=?').bind('w').first();
 checkWatch({db,watch,now,read:()=>new Promise(()=>{})}).catch(()=>{}); // simulates a check killed mid-way
 await new Promise(r=>setTimeout(r,20));
 assert.equal((await db.prepare('SELECT next_check FROM watches').first()).next_check,now+6*3600000);
});

test('alert emails go only to the approved addresses',async()=>{
 assert.deepEqual(alertEmailAllowlist({}),['atoyejet@gmail.com','atoyesunny@gmail.com']);
 assert.deepEqual(DEFAULT_ALERT_EMAILS,alertEmailAllowlist({ALERT_EMAIL_ALLOWLIST:' '}));
 assert.ok(alertEmailAllowed({},'AtoyeJet@Gmail.com')&&alertEmailAllowed({},'atoyesunny@gmail.com'));
 assert.ok(!alertEmailAllowed({},'other@gmail.com')&&!alertEmailAllowed({},null));
 const db=makeDb(),env={AUTH_SECRET:'secret-for-tests',APP_URL:'https://gazeradar.example.com'};
 for(const [id,email] of [['a','atoyejet@gmail.com'],['b','atoyesunny@gmail.com'],['c','stranger@example.com']]){
  await db.prepare('INSERT INTO users (id,email,created) VALUES (?,?,?)').bind(id,email,now).run();
  await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created) VALUES (?,?,?,?,?,?)').bind('w'+id,'email-otp:'+id,'W','https://example.com/'+id,'[]',now).run();
  await db.prepare('INSERT INTO notifications (owner,frequency,next_digest,updated) VALUES (?,?,?,?)').bind('email-otp:'+id,'change',now,now).run();
  await db.prepare('INSERT INTO events (id,owner,watch_id,name,url,content,created) VALUES (?,?,?,?,?,?,?)').bind('e'+id,'email-otp:'+id,'w'+id,'W','https://example.com/'+id,JSON.stringify({v:3,title:'t',items:[{t:'Change'}]}),now).run();
 }
 const sent=[];await deliverNotifications({db,env,now,send:async to=>sent.push(to)});
 assert.deepEqual(sent.sort(),['atoyejet@gmail.com','atoyesunny@gmail.com']);
 assert.equal((await db.prepare("SELECT frequency FROM notifications WHERE owner='email-otp:c'").first()).frequency,'off');
 assert.equal((await db.prepare("SELECT emailed FROM events WHERE id='ec'").first()).emailed,1);
});

test('the same URL cannot be added twice, even by simultaneous requests',async()=>{
 const db=makeDb(),w=id=>({id,owner:'o',name:'n',url:'https://example.com/a',keywords:'[]',created:now,category:'website',hours:6,emailEnabled:true,options:'{}'});
 const results=await Promise.allSettled([reserveWatch(db,w('1'),20),reserveWatch(db,w('2'),20)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.match(String(results.find(r=>r.status==='rejected').reason),/already have a watch/);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM watches').first()).n,1);
});

test('creating a share link removes expired share links of other accounts',async()=>{
 const db=makeDb();
 await db.prepare("INSERT INTO profiles (id,owner,kind,content,updated) VALUES ('share:old','x','goal-share',?,?)").bind(JSON.stringify({title:'t',items:[],expires:now-1}),now).run();
 await db.prepare("INSERT INTO profiles (id,owner,kind,content,updated) VALUES ('B:goal','B','goal',?,?)").bind(JSON.stringify({title:'Goal',notes:'',shortlist:['o1']}),now).run();
 await db.prepare("INSERT INTO opportunities (id,owner,watch_id,category,url,name,content,fingerprint,created,updated) VALUES ('o1','B','w','jobs','https://example.com/j','Job','{}','f',?,?)").bind(now,now).run();
 await createGoalShare(db,'B',now);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM profiles WHERE id='share:old'").first()).n,0);
 assert.equal((await db.prepare("SELECT COUNT(*) n FROM profiles WHERE kind='goal-share'").first()).n,1);
});

test('Cloudflare Access signing keys are cached and unknown key ids refresh at most once a minute',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='k1';
 let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({keys:[jwk]}));};
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 async function token(kid){const data=enc({alg:'RS256',kid})+'.'+enc({iss:'https://t.cloudflareaccess.com',aud:['a'],exp:Math.floor(Date.now()/1000)+300,sub:'u'});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data))).toString('base64url');}
 for(let i=0;i<3;i++)assert.equal(await verifyAccessToken(await token('k1'),'t.cloudflareaccess.com','a',fetcher),'cloudflare-access:u');
 assert.equal(calls,1);
 for(let i=0;i<5;i++)assert.equal(await verifyAccessToken(await token('unknown'),'t.cloudflareaccess.com','a',fetcher),null);
 assert.equal(calls,1);
});

test('every response gets baseline security headers',async()=>{
 const r=withSecurityHeaders(new Response('ok',{headers:{'referrer-policy':'no-referrer'}}));
 assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(await r.text(),'ok');
});

test('API errors expose only intended messages',async()=>{
 const read=async(e)=>{const r=failure(e);return {status:r.status,error:(await r.json()).error};};
 assert.deepEqual(await read(new Error('Give your watch a name.')),{status:400,error:'Give your watch a name.'});
 assert.deepEqual(await read(new PageError('Website returned 404.',404)),{status:400,error:'Website returned 404.'});
 assert.deepEqual(await read(new Error('SIGN_IN')),{status:401,error:'Please sign in to continue.'});
 for(const e of [new Error('D1_ERROR: no such table: watches: SQLITE_ERROR'),new TypeError('x is not a function'),new DOMException('The operation failed for an operation-specific reason','OperationError'),'boom'])
  assert.deepEqual(await read(e),{status:500,error:'Something went wrong. Please try again.'});
});
