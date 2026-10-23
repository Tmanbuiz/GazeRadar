import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {sendLoginCode,zohoBase,verifyTurnstile,loginMessage} from '../lib/zoho-mail.ts';

const env={ZOHO_CLIENT_ID:'cid',ZOHO_CLIENT_SECRET:'csec',ZOHO_REFRESH_TOKEN:'rtok',ZOHO_ACCOUNT_ID:'12345',ZOHO_FROM:'gazeradar@wiantribe.com'};
const json=(b,status=200)=>new Response(JSON.stringify(b),{status,headers:{'content-type':'application/json'}});
function fakeFetch(handler){const calls=[];const f=async(url,init)=>{calls.push({url:String(url),init});return handler(String(url),init,calls);};f.calls=calls;return f;}

test('zohoBase only allows real Zoho hosts over https',()=>{
 assert.equal(zohoBase(undefined,'https://mail.zohocloud.ca'),'https://mail.zohocloud.ca');
 assert.equal(zohoBase('https://accounts.zoho.eu','x'),'https://accounts.zoho.eu');
 for(const bad of ['http://mail.zohocloud.ca','https://evil.example','https://mail.zohocloud.ca.evil.example','https://mail.zohocloud.ca:8443','https://user@evil.example','https://evilzohocloud.ca'])assert.throws(()=>zohoBase(bad,'x'),/not allowed|Invalid URL/,bad);
});
test('message has the code and no links',()=>{const m=loginMessage('123456');assert.match(m.content,/123456/);assert.doesNotMatch(m.content,/https?:/);});
test('refreshes a token, caches it, and sends the message',async()=>{
 const db=makeDb();
 const f=fakeFetch(url=>url.includes('/oauth/v2/token')?json({access_token:'AT',expires_in:3600}):json({status:{code:200}}));
 await sendLoginCode(env,db,f,'u@example.com','654321',1000);
 await sendLoginCode(env,db,f,'u@example.com','111111',2000);
 assert.equal(f.calls.filter(c=>c.url.includes('/oauth/')).length,1);
 const send=f.calls.find(c=>c.url.includes('/messages'));
 assert.equal(send.url,'https://mail.zohocloud.ca/api/accounts/12345/messages');
 assert.equal(send.init.headers.authorization,'Zoho-oauthtoken AT');
 const body=JSON.parse(send.init.body);
 assert.equal(body.fromAddress,'gazeradar@wiantribe.com');assert.equal(body.toAddress,'u@example.com');assert.match(body.content,/654321/);assert.equal(body.mailFormat,'plaintext');
 const tok=f.calls[0];assert.match(tok.init.body,/grant_type=refresh_token/);
});
test('a 401 triggers one refresh and one retry',async()=>{
 const db=makeDb();let sends=0,tokens=0;
 const f=fakeFetch(url=>{if(url.includes('/oauth/')){tokens++;return json({access_token:'AT'+tokens});}sends++;return sends===1?json({},401):json({});});
 await sendLoginCode(env,db,f,'u@example.com','1',0);
 assert.equal(sends,2);assert.equal(tokens,2);
});
test('failures throw: bad token reply, http error, error in 200 body, missing config',async()=>{
 const db=makeDb();
 await assert.rejects(sendLoginCode(env,db,fakeFetch(()=>json({error:'invalid_code'})),'u@example.com','1',0),/token/);
 const good=url=>url.includes('/oauth/')?json({access_token:'AT'}):null;
 await assert.rejects(sendLoginCode(env,makeDb(),fakeFetch(u=>good(u)||json({},500)),'u@example.com','1',0),/send failed/);
 await assert.rejects(sendLoginCode(env,makeDb(),fakeFetch(u=>good(u)||json({status:{code:500}})),'u@example.com','1',0),/send failed/);
 await assert.rejects(sendLoginCode({},makeDb(),fakeFetch(()=>json({})),'u@example.com','1',0),/not configured/);
 await assert.rejects(sendLoginCode({...env,ZOHO_ACCOUNT_ID:'../x'},makeDb(),fakeFetch(()=>json({})),'u@example.com','1',0),/invalid/);
 await assert.rejects(sendLoginCode({...env,ZOHO_MAIL_URL:'https://evil.example'},makeDb(),fakeFetch(u=>good(u)||json({})),'u@example.com','1',0),/not allowed/);
});
test('secrets never go to a non-Zoho host',async()=>{
 const f=fakeFetch(()=>json({}));
 await assert.rejects(sendLoginCode({...env,ZOHO_ACCOUNTS_URL:'https://evil.example'},makeDb(),f,'u@example.com','1',0));
 assert.equal(f.calls.length,0);
});
test('turnstile fails closed',async()=>{
 const ok=fakeFetch(()=>json({success:true}));
 assert.equal(await verifyTurnstile('s','tok','1.1.1.1',ok),true);
 assert.match(ok.calls[0].init.body,/secret=s/);
 assert.equal(await verifyTurnstile(undefined,'tok','ip',ok),false);
 assert.equal(await verifyTurnstile('s','','ip',ok),false);
 assert.equal(await verifyTurnstile('s',undefined,'ip',ok),false);
 assert.equal(await verifyTurnstile('s','tok','ip',fakeFetch(()=>json({success:false}))),false);
 assert.equal(await verifyTurnstile('s','tok','ip',fakeFetch(()=>json({success:true},500))),false);
});
