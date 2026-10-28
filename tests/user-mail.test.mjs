import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {seal,unseal,gmailRaw,deliverApplication,accountEmail,exchange,providerConfig,mailReady} from '../lib/user-mail.ts';
import {reviewedApplication,reserveApplication} from '../lib/application-send.ts';
const valid={id:'12345678-1234-1234-1234-123456789012',sender:'applicant@example.com',recipient:'jobs@example.org',title:'Youth worker',jobUrl:'https://example.org/jobs/1',subject:'Application — Youth worker',body:'Hello, I am Alex.',fileName:'Alex CV.pdf',fileBase64:Buffer.from('%PDF-1.7 test CV').toString('base64'),confirmed:true};
test('review requires exact one recipient, confirmation, a matching CV type, and bounded attachment',()=>{
 assert.equal(reviewedApplication(valid).fileType,'application/pdf');
 for(const patch of [{confirmed:false},{recipient:'one@example.org,two@example.org'},{subject:'Good\r\nBcc: bad@example.org'},{fileBase64:Buffer.from('not pdf').toString('base64')},{fileName:'../../cv.pdf'},{body:'Kind regards, [Your name]'},{fileBase64:Buffer.alloc(2*1024*1024+1,65).toString('base64')}])assert.throws(()=>reviewedApplication({...valid,...patch}));
});
test('encrypted refresh tokens are randomized and bound to the account owner',async()=>{
 const secret='x'.repeat(40),a=await seal(secret,'owner-a','PRIVATE_REFRESH_TOKEN'),b=await seal(secret,'owner-a','PRIVATE_REFRESH_TOKEN');
 assert.notEqual(a,b);assert.equal(await unseal(secret,'owner-a',a),'PRIVATE_REFRESH_TOKEN');
 await assert.rejects(unseal(secret,'owner-b',a));await assert.rejects(unseal('y'.repeat(40),'owner-a',a));assert.equal(a.includes('PRIVATE'),false);
});
test('application reservation prevents repeated requests, rapid duplicate submissions and per-account quota bypass',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());const now=1800000000000;
 await reserveApplication(db,'owner-a',valid,now);
 await assert.rejects(reserveApplication(db,'owner-a',valid,now));
 await assert.rejects(reserveApplication(db,'owner-a',{...valid,id:crypto.randomUUID()},now));
 for(let i=1;i<5;i++)await reserveApplication(db,'owner-a',{...valid,id:crypto.randomUUID(),title:'Job '+i},now);
 await assert.rejects(reserveApplication(db,'owner-a',{...valid,id:crypto.randomUUID(),title:'Job 6'},now));
 await reserveApplication(db,'owner-b',{...valid,id:crypto.randomUUID()},now);
 const rows=db.raw.prepare('SELECT * FROM applications WHERE owner=?').all('owner-a');assert.equal(rows.length,5);assert.equal('body' in rows[0],false);assert.equal('fileBase64' in rows[0],false);
});
test('Gmail MIME has the connected sender, a single recipient, UTF-8 body and the selected CV',()=>{
 const m=reviewedApplication(valid),raw=Buffer.from(gmailRaw(valid.sender,m),'base64url').toString();
 assert.match(raw,/From: applicant@example.com/);assert.match(raw,/To: jobs@example.org/);assert.match(raw,/filename="Alex CV.pdf"/);assert.ok(raw.includes(valid.fileBase64));assert.ok(raw.includes(Buffer.from(valid.body).toString('base64')));assert.doesNotMatch(raw,/Bcc:/);
});
test('provider sending is single-attempt, uses fixed hosts, and only claims provider acceptance',async()=>{
 const m=reviewedApplication(valid);let calls=0;
 await deliverApplication('google',valid.sender,'SECRET',m,async(url,init)=>{calls++;assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(init.redirect,'manual');return Response.json({id:'message-id'});});assert.equal(calls,1);
 await deliverApplication('microsoft',valid.sender,'SECRET',m,async(url,init)=>{assert.equal(url,'https://graph.microsoft.com/v1.0/me/sendMail');const body=JSON.parse(init.body);assert.equal(body.message.toRecipients.length,1);assert.equal(body.message.attachments[0].contentBytes,m.fileBase64);return new Response(null,{status:202});});
 calls=0;await assert.rejects(deliverApplication('google',valid.sender,'SECRET',m,async()=>{calls++;throw new Error('network timeout');}));assert.equal(calls,1);
});
test('OAuth uses configured provider credentials and verifies account email, never a client sender',async()=>{
 const env={APP_URL:'https://gazeradar.example',MAIL_TOKEN_KEY:'x'.repeat(40),GOOGLE_MAIL_CLIENT_ID:'id',GOOGLE_MAIL_CLIENT_SECRET:'secret'};
 assert.equal(mailReady(env,'google'),true);assert.equal(mailReady(env,'microsoft'),false);
 assert.equal(providerConfig(env,'google').scope.includes('gmail.readonly'),false);assert.equal(providerConfig(env,'microsoft').scope.includes('Mail.Read'),false);
 await exchange(env,'google',{grant_type:'refresh_token',refresh_token:'refresh'},async(url,init)=>{assert.equal(url,'https://oauth2.googleapis.com/token');assert.equal(init.redirect,'manual');assert.equal(new URLSearchParams(init.body).get('client_secret'),'secret');return Response.json({access_token:'token'});});
 assert.equal(await accountEmail('google','token',async()=>Response.json({email:'USER@example.com',email_verified:true})),'user@example.com');
 await assert.rejects(accountEmail('google','token',async()=>Response.json({email:'user@example.com',email_verified:false})));
});
