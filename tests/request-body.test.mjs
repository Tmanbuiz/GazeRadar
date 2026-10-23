import test from 'node:test';
import assert from 'node:assert/strict';
import {jsonBody} from '../lib/request-body.ts';
test('JSON API bodies are size-bound even without a content-length header',async()=>{
 const req=body=>new Request('https://example.com/api/profiles',{method:'POST',body});
 assert.deepEqual(await jsonBody(req('{"skills":["Excel"]}')),{skills:['Excel']});
 await assert.rejects(jsonBody(req('x'.repeat(12001))),/too large/);
 await assert.rejects(jsonBody(req('null')),/valid fields/);await assert.rejects(jsonBody(req('[]')),/valid fields/);await assert.rejects(jsonBody(req('bad')),/could not be read/);
});
