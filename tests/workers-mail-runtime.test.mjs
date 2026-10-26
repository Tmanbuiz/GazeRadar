import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeDb} from './d1.mjs';
import {sendLoginCode} from '../lib/zoho-mail.ts';
import {readSource} from '../lib/sources.ts';
const require=createRequire(import.meta.url);
const {Miniflare}=require(require.resolve('miniflare',{paths:[require.resolve('wrangler/package.json')]}));

test('outbound mail and job-feed request options are accepted by the Workers runtime',async()=>{
 const requests=[];
 const f=async(url,init)=>{
  const {signal,...serializable}=init;
  assert.ok(signal);
  requests.push({url,init:serializable});
  const body=url.includes('/oauth/')?{access_token:'fixture-token'}:url.includes('/messages')?{status:{code:200}}:{jobs:[]};
  return Response.json(body);
 };
 await sendLoginCode({ZOHO_CLIENT_ID:'fixture',ZOHO_CLIENT_SECRET:'fixture',ZOHO_REFRESH_TOKEN:'fixture',ZOHO_ACCOUNT_ID:'123',ZOHO_FROM:'sender@example.com'},makeDb(),f,'recipient@example.com','123456',0);
 await readSource('https://boards.greenhouse.io/example','jobs',f);
 assert.equal(requests.length,3);
 const mf=new Miniflare({modules:true,compatibilityDate:'2026-05-15',script:`export default {async fetch(request){
  const requests=await request.json();
  try { return Response.json(requests.map(({url,init})=>new Request(url,init).redirect)); }
  catch(e){return new Response(e.name+': '+e.message,{status:500});}
 }}`});
 try {
  const result=await mf.dispatchFetch('http://runtime.test/',{method:'POST',body:JSON.stringify(requests)});
  assert.equal(result.status,200,await result.clone().text());
  assert.deepEqual(await result.json(),['manual','manual','manual']);
  const unsupported=await mf.dispatchFetch('http://runtime.test/',{method:'POST',body:JSON.stringify([{...requests[0],init:{...requests[0].init,redirect:'error'}}])});
  assert.equal(unsupported.status,500);
  assert.match(await unsupported.text(),/TypeError/);
 } finally {await mf.dispose();}
});
