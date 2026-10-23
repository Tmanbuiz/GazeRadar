import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {requestCode,verifyCode,sessionUser,endSession,normalizeEmail,randomCode,readCookie,sameOriginRequest,hmacHex,CODE_TTL_MS,MAX_ATTEMPTS,LIMITS,RESEND_COOLDOWN_MS} from '../lib/login.ts';

const secret='test-secret';
const setup=()=>{const db=makeDb();const sent=[];return {db,sent,send:async(to,code)=>{sent.push({to,code});}};};
const ask=(s,o={})=>requestCode({db:s.db,secret,email:'a@example.com',ip:'1.1.1.1',now:1000,send:s.send,...o});
const check=(s,code,o={})=>verifyCode({db:s.db,secret,email:'a@example.com',code,ip:'1.1.1.1',now:2000,...o});

test('normalizeEmail accepts normal addresses and rejects junk',()=>{
 assert.equal(normalizeEmail('  Me@Example.COM '),'me@example.com');
 for(const bad of ['','a','a@b','a@@b.com','a b@c.com','@c.com','a@.com',null,5,'a@b.com\r\nBcc: x@y.com','x'.repeat(65)+'@a.com'])assert.equal(normalizeEmail(bad),null,String(bad));
});
test('randomCode is six digits',()=>{for(let i=0;i<200;i++)assert.match(randomCode(),/^\d{6}$/);});
test('request → verify creates a user, a session, and uses the code once',async()=>{
 const s=setup();await ask(s);assert.equal(s.sent.length,1);
 const stored=s.db.raw.prepare('SELECT * FROM login_codes').get();
 assert.notEqual(stored.hash,s.sent[0].code);assert.equal(stored.hash,await hmacHex(secret,`a@example.com:${s.sent[0].code}`));
 const sess=await check(s,s.sent[0].code);
 assert.equal(sess.email,'a@example.com');
 assert.deepEqual(await sessionUser(s.db,sess.token,3000),{userId:sess.userId,email:'a@example.com'});
 assert.equal(s.db.raw.prepare('SELECT count(*) n FROM sessions').get().n,1);
 assert.notEqual(s.db.raw.prepare('SELECT hash FROM sessions').get().hash,sess.token);
 await assert.rejects(check(s,s.sent[0].code),/wrong or has expired/);
});
test('signing in again reuses the same user',async()=>{
 const s=setup();await ask(s);const a=await check(s,s.sent[0].code);
 await ask(s,{now:1000+RESEND_COOLDOWN_MS+1});const b=await check(s,s.sent[1].code,{now:1000+RESEND_COOLDOWN_MS+2});
 assert.equal(a.userId,b.userId);assert.equal(s.db.raw.prepare('SELECT count(*) n FROM users').get().n,1);
});
test('wrong code is rejected and attempts are capped',async()=>{
 const s=setup();await ask(s);const good=s.sent[0].code;const wrong=good==='000000'?'111111':'000000';
 for(let i=0;i<MAX_ATTEMPTS;i++)await assert.rejects(check(s,wrong));
 await assert.rejects(check(s,good),/wrong or has expired/); // locked out even with the right code
});
test('expired code is rejected',async()=>{
 const s=setup();await ask(s);
 await assert.rejects(check(s,s.sent[0].code,{now:1000+CODE_TTL_MS+1}));
});
test('code for one email does not work for another',async()=>{
 const s=setup();await ask(s);await ask(s,{email:'b@example.com'});
 await assert.rejects(check(s,s.sent[0].code,{email:'b@example.com'}));
});
test('non-numeric or short codes are rejected before touching the database',async()=>{
 const s=setup();await ask(s);
 for(const c of ['12345','1234567','abcdef','12345a',''])await assert.rejects(check(s,c));
 assert.equal(s.db.raw.prepare('SELECT attempts FROM login_codes').get().attempts,0);
});
test('resend within the cooldown sends nothing new',async()=>{
 const s=setup();await ask(s);await ask(s,{now:1500});assert.equal(s.sent.length,1);
 await ask(s,{now:1000+RESEND_COOLDOWN_MS+1});assert.equal(s.sent.length,2);
 // old code no longer works
 await assert.rejects(check(s,s.sent[0].code,{now:1000+RESEND_COOLDOWN_MS+2}));
});
test('per-email, per-ip and global limits',async()=>{
 const s=setup();
 for(let i=0;i<LIMITS.emailPerHour;i++)await ask(s,{now:1000+i*(RESEND_COOLDOWN_MS+1)});
 await assert.rejects(ask(s,{now:1000+6*(RESEND_COOLDOWN_MS+1)}),/Too many/);
 const t=setup();
 for(let i=0;i<LIMITS.ipPerHour;i++)await ask(t,{email:`u${i}@example.com`});
 await assert.rejects(ask(t,{email:'x@example.com'}),/Too many/);
 await ask(t,{email:'x@example.com',ip:'2.2.2.2'}); // other ip fine
 // window resets
 await ask(t,{email:'y@example.com',now:1000+3600001});
});
test('verify attempts per ip are limited',async()=>{
 const s=setup();await ask(s);
 for(let i=0;i<LIMITS.verifyPerIpPerHour;i++)await check(s,'000000').catch(()=>{});
 await assert.rejects(check(s,s.sent[0].code),/Too many/);
});
test('a failed email send leaves no usable code and reports a generic error',async()=>{
 const s=setup();
 await assert.rejects(ask(s,{send:async()=>{throw new Error('zoho secret detail');}}),e=>e.status===502&&!/zoho/i.test(e.message));
 assert.equal(s.db.raw.prepare('SELECT count(*) n FROM login_codes').get().n,0);
});
test('missing secret fails closed',async()=>{
 const s=setup();await assert.rejects(requestCode({db:s.db,secret:'',email:'a@example.com',ip:'x',now:1,send:s.send}),e=>e.status===503);
 await assert.rejects(verifyCode({db:s.db,secret:'',email:'a@example.com',code:'123456',ip:'x',now:1}),e=>e.status===503);
});
test('sessions expire and can be ended; malformed tokens are ignored',async()=>{
 const s=setup();await ask(s);const sess=await check(s,s.sent[0].code);
 assert.equal(await sessionUser(s.db,sess.token,2000+sess.maxAge*1000+1),null);
 assert.equal(await sessionUser(s.db,'nope',3000),null);
 await endSession(s.db,sess.token);assert.equal(await sessionUser(s.db,sess.token,3000),null);
});
test('cookie parsing and same-origin check',()=>{
 assert.equal(readCookie('a=1; __Host-gz_session=tok; b=2','__Host-gz_session'),'tok');
 assert.equal(readCookie('x__Host-gz_session=bad','__Host-gz_session'),null);
 assert.equal(readCookie(null,'a'),null);
 const r=(h)=>new Request('https://gazeradar.wiantribe.com/api/x',{method:'POST',headers:h});
 assert.equal(sameOriginRequest(r({origin:'https://gazeradar.wiantribe.com'})),true);
 assert.equal(sameOriginRequest(r({origin:'https://evil.example'})),false);
 assert.equal(sameOriginRequest(r({'sec-fetch-site':'same-origin'})),true);
 assert.equal(sameOriginRequest(r({'sec-fetch-site':'cross-site'})),false);
 assert.equal(sameOriginRequest(r({})),false);
});
