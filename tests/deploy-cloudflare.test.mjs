import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('deployment resolves an inherited DB ID before running remote migrations',()=>{
 const root=mkdtempSync(join(tmpdir(),'gazeradar-deploy-test-'));
 try{
 for(const d of ['scripts','dist/server','node_modules/wrangler/bin'])mkdirSync(join(root,d),{recursive:true});
 for(const f of ['deploy-cloudflare.mjs','cloudflare-bindings.mjs'])copyFileSync(new URL('../scripts/'+f,import.meta.url),join(root,'scripts',f));
 writeFileSync(join(root,'package.json'),'{"type":"module"}');
 writeFileSync(join(root,'dist/server/wrangler.json'),JSON.stringify({name:'gazeradar',d1_databases:[{binding:'DB',database_name:'gazeradar-db',migrations_dir:'drizzle'}]}));
 writeFileSync(join(root,'node_modules/wrangler/bin/wrangler.js'),`const fs=require('node:fs');const args=process.argv.slice(2);if(args[0]==='d1'){const c=JSON.parse(fs.readFileSync(args[args.indexOf('--config')+1]));if(c.d1_databases[0].database_id!=='11223344-5566-7788-99aa-bbccddeeff00')process.exit(9);fs.writeFileSync(${JSON.stringify(join(root,'migrated'))},'ok');}`);
 writeFileSync(join(root,'mock-api.mjs'),`globalThis.fetch=async(url,options)=>{if(!url.endsWith('/workers/scripts/gazeradar/settings'))throw new Error('Unexpected API path');return {ok:true,status:200,json:async()=>({success:true,result:{bindings:[{type:'d1',name:'DB',id:'11223344-5566-7788-99aa-bbccddeeff00'}]}})};};`);
 const result=spawnSync(process.execPath,['--import',join(root,'mock-api.mjs'),join(root,'scripts/deploy-cloudflare.mjs')],{encoding:'utf8',env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'11111111111111111111111111111111',CLOUDFLARE_API_TOKEN:'test-only-token'}});
 assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(root,'migrated'),'utf8'),'ok');
 assert.ok(!readFileSync(join(root,'dist/server/wrangler.json'),'utf8').includes('test-only-token'));
 const savedConfig=JSON.parse(readFileSync(join(root,'dist/server/wrangler.json'),'utf8'));
 assert.equal(savedConfig.d1_databases[0].migrations_dir,join(root,'drizzle'));
 }finally{rmSync(root,{recursive:true,force:true});}
});
