import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDb} from './d1.mjs';
import {goalValue,readGoal,saveGoal,createGoalShare,readGoalShare,revokeGoalShare} from '../lib/goals.ts';
const now=1800000000000;
async function seed(db,owner,id){
 await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,category) VALUES (?,?,?,?,?,?,?)').bind(id,owner,'Source','https://example.com','[]',now,'jobs').run();
 await db.prepare("INSERT INTO opportunities (id,owner,watch_id,category,url,name,content,fingerprint,available,state,created,updated) VALUES (?,?,?,'jobs',?,?,'{}','hash',1,'saved',?,?)").bind(id,owner,id,`https://example.com/jobs/${id}`,`Job ${id}`,now,now).run();
}
test('goals validate limits and deduplicate shortlist choices',()=>{
 assert.deepEqual(goalValue({title:' Goal ',notes:' Private ',shortlist:['a','a']}),{title:'Goal',notes:'Private',shortlist:['a']});
 for(const value of [null,{}, {title:'x',notes:'n'.repeat(2001),shortlist:[]},{title:'x',notes:'',shortlist:Array(21).fill('a')}])assert.throws(()=>goalValue(value));
});
test('goals are isolated by owner and reject foreign shortlist IDs',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await seed(db,'one','a');await seed(db,'two','b');
 await saveGoal(db,'one',{title:'Move',notes:'Private notes',shortlist:['a']},now);
 assert.equal((await readGoal(db,'one')).title,'Move');assert.equal((await readGoal(db,'two')).title,'');
 await assert.rejects(saveGoal(db,'one',{title:'Move',notes:'',shortlist:['b']},now),/own workspace/);
});
test('sharing is opt-in, read-only, expires, excludes notes and replaces or revokes old tokens',async t=>{
 const db=makeDb();t.after(()=>db.raw.close());await seed(db,'one','a');await seed(db,'two','b');
 await saveGoal(db,'one',{title:'Move',notes:'PRIVATE_NOTE_AND_EMAIL',shortlist:['a']},now);
 await assert.rejects(createGoalShare(db,'two',now));
 const first=await createGoalShare(db,'one',now),token=first.path.split('#')[1];
 const snapshot=await readGoalShare(db,token,now);
 assert.deepEqual(snapshot.items,[{name:'Job a',url:'https://example.com/jobs/a',category:'jobs'}]);
 assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE|owner|shortlist|notes/);
 assert.equal(await readGoalShare(db,token,first.expires),null);
 await saveGoal(db,'one',{title:'Changed title',notes:'New note',shortlist:['a']},now+1);
 assert.equal((await readGoalShare(db,token,now+1)).title,'Move');
 const second=await createGoalShare(db,'one',now+2);
 assert.equal(await readGoalShare(db,token,now+2),null);
 const nextToken=second.path.split('#')[1];
 await revokeGoalShare(db,'two');assert.ok(await readGoalShare(db,nextToken,now+3));
 await revokeGoalShare(db,'one');assert.equal(await readGoalShare(db,nextToken,now+3),null);
 assert.equal(await readGoalShare(db,'guess',now),null);
});
