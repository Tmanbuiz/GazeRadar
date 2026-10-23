import test from 'node:test';
import assert from 'node:assert/strict';
import {validUrl,pageLines,matchingAdditions,readPage} from '../lib/monitor.ts';
test('URL checks reject non-public address forms and credentials',()=>{
 for(const url of ['http://example.com','https://127.0.0.1','https://[::1]','https://foo.local','https://user:pass@example.com','https://2130706433','https://foo.com:8443'])assert.throws(()=>validUrl(url));
 assert.equal(validUrl('https://example.com/jobs#top'),'https://example.com/jobs');
});
test('extract and compare new keyword matches without script or unchanged text',()=>{
 const old=pageLines('<script>Remote developer hidden</script><p>Administrative assistant in Moncton</p><p>Welcome to our company website</p>');
 const next=pageLines('<p>Administrative assistant in Moncton</p><p>Welcome to our company website</p><p>Remote software engineer opportunity</p><p>Retail associate Fredericton</p>');
 assert.deepEqual(matchingAdditions(old,next,['REMOTE']),['Remote software engineer opportunity']);assert.equal(matchingAdditions(old,old,[]).length,0);assert.equal(matchingAdditions(old,next,[]).length,2);
});
test('fetching refuses an unsafe redirect, oversized response, and blocked page',async()=>{
 const original=globalThis.fetch;
 try{
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}});
 await assert.rejects(readPage('https://example.com/jobs'),/public HTTPS/);
 globalThis.fetch=async()=>new Response('x'.repeat(1000001),{headers:{'content-type':'text/html'}});
 await assert.rejects(readPage('https://example.com/jobs'),/too large/);
 globalThis.fetch=async()=>new Response('Forbidden',{status:403});
 await assert.rejects(readPage('https://example.com/jobs'),/403/);
 }finally{globalThis.fetch=original;}
});
