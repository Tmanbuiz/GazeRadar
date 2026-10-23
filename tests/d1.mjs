// Minimal D1 look-alike over node:sqlite, loaded with the real migration files.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
export function makeDb(){
 const sql=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())
  for(const part of readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8').split('--> statement-breakpoint'))if(part.trim())sql.exec(part);
 const stmt=(q,args=[])=>({
  bind:(...a)=>stmt(q,a),
  first:async()=>sql.prepare(q).get(...args)??null,
  all:async()=>({results:sql.prepare(q).all(...args)}),
  run:async()=>{const r=sql.prepare(q).run(...args);return {meta:{changes:Number(r.changes)}};},
 });
 return {prepare:q=>stmt(q),batch:async list=>{for(const s of list)await s.run();return [];},raw:sql};
}
