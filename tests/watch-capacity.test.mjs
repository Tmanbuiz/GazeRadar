import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {sha256Hex} from '../lib/login.ts';
import {watchLimit,reserveWatch} from '../lib/watch-capacity.ts';

test('unlimited watches use the verified database identity and do not affect other accounts',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());
 db.raw.prepare('INSERT INTO users (id,email,created) VALUES (?,?,?)').run('owner-id','OWNER@example.com',1);
 db.raw.prepare('INSERT INTO users (id,email,created) VALUES (?,?,?)').run('other-id','other@example.com',1);
 const allowed=await sha256Hex('owner@example.com');
 assert.equal(await watchLimit(db,'email-otp:owner-id',allowed),null);
 for(const owner of ['email-otp:other-id','owner@example.com','owner-id','access-token-subject'])assert.equal(await watchLimit(db,owner,allowed),20);
 assert.equal(await watchLimit(db,'email-otp:owner-id'),20);
 assert.equal(await watchLimit(db,'email-otp:owner-id','invalid-hash'),20);
});

test('atomic reservation caps ordinary accounts at 20 while the exempt account can exceed it',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());
 const make=(owner,i)=>({id:owner+i,owner,name:'Job board '+i,url:'https://example.com/jobs/'+i,keywords:'[]',created:i,category:'jobs',hours:6,emailEnabled:true,options:'{}'});
 for(let i=0;i<20;i++)await reserveWatch(db,make('ordinary',i),20);
 await assert.rejects(reserveWatch(db,make('ordinary',20),20),/supports 20 watches/);
 for(let i=0;i<35;i++)await reserveWatch(db,make('exempt',i),null);
 assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM watches WHERE owner=?').get('ordinary').n,20);
 assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM watches WHERE owner=?').get('exempt').n,35);
 await reserveWatch(db,make('another',0),20);
});
