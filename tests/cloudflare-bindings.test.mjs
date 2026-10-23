import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAccount, attachedDatabaseId } from '../scripts/cloudflare-bindings.mjs';
const id = '11223344-5566-7788-99aa-bbccddeeff00';
test('resolve inherited DB from its deployed binding rather than database name', () => {
  assert.equal(attachedDatabaseId({bindings:[{type:'d1',name:'OTHER',id:'ffffffff-ffff-ffff-ffff-ffffffffffff'},{type:'d1',name:'DB',id}]}),id);
  assert.equal(attachedDatabaseId({bindings:[{type:'d1',name:'DB',database_id:id}]}),id);
});
test('reject missing, ambiguous and placeholder bindings', () => {
  for(const bindings of [[],[{type:'kv_namespace',name:'DB',id}],[{type:'d1',name:'DB'}],[{type:'d1',name:'DB',id:'00000000-0000-4000-8000-000000000000'}],[{type:'d1',name:'DB',id},{type:'d1',name:'DB',id}]]) assert.throws(()=>attachedDatabaseId({bindings}));
});
test('select only an explicit or unambiguous account', () => {
  assert.equal(selectAccount('chosen',[{id:'other'}]),'chosen');
  assert.equal(selectAccount(undefined,[{id:'only'}]),'only');
  assert.throws(()=>selectAccount(undefined,[{id:'one'},{id:'two'}]));
});
