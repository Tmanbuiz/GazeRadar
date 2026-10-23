import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessToken} from '../lib/access-token.ts';
const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
test('Cloudflare identity requires a valid signature, issuer, audience and expiry',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test-key';
 const fetcher=async url=>{assert.equal(url,'https://example.cloudflareaccess.com/cdn-cgi/access/certs');return new Response(JSON.stringify({keys:[jwk]}));};
 const base={iss:'https://example.cloudflareaccess.com',aud:['our-app'],exp:Math.floor(Date.now()/1000)+300,sub:'user-123'};
 async function token(payload,header={alg:'RS256',kid:'test-key'}){const data=enc(header)+'.'+enc(payload);const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data));return data+'.'+Buffer.from(sig).toString('base64url');}
 const valid=await token(base);
 assert.equal(await verifyAccessToken(valid,'example.cloudflareaccess.com','our-app',fetcher),'cloudflare-access:user-123');
 for(const overrides of [{exp:1},{aud:['other-app']},{iss:'https://attacker.example'},{sub:''},{nbf:Date.now()/1000+600}])assert.equal(await verifyAccessToken(await token({...base,...overrides}),'example.cloudflareaccess.com','our-app',fetcher),null);
 const parts=valid.split('.');parts[1]=enc({...base,sub:'forged'});assert.equal(await verifyAccessToken(parts.join('.'),'example.cloudflareaccess.com','our-app',fetcher),null);
 assert.equal(await verifyAccessToken(await token(base,{alg:'none',kid:'test-key'}),'example.cloudflareaccess.com','our-app',fetcher),null);
 assert.equal(await verifyAccessToken(valid,'attacker.example','our-app',fetcher),null);
});
