import {context,failure} from '../../../lib/server';
import {readPage,readSnapshot,toSnapshot,matchingAdditions,isMajorChange,buildAlert,MAX_LINES} from '../../../lib/monitor';

const KEEP_EVENTS=500; // newest alerts kept per account
const REBASE_AFTER_FAILURES=2; // problem checks in a row before an unfamiliar page may replace the baseline
const REBASE_MIN_AGE_MS=3600000; // ...and only if the last good check is at least this old

export async function POST(req:Request){try{const {owner,db}=await context(req);const {id}=await req.json() as {id:string};const w=await db.prepare('SELECT * FROM watches WHERE id=? AND owner=?').bind(id,owner).first<any>();if(!w)throw new Error('Watch not found.');if(!w.active)throw new Error('Resume this watch before checking.');if(w.checked && Date.now()-w.checked<60000)throw new Error('Please wait a minute between checks.');const lock=await db.prepare('UPDATE watches SET checking=? WHERE id=? AND owner=? AND (checking=0 OR checking<?)').bind(Date.now(),id,owner,Date.now()-60000).run();if(!lock.meta.changes)throw new Error('This watch is already being checked.');
 try{
 const page=await readPage(w.url);
 const lines=page.lines;
 const previous=readSnapshot(w.snapshot);
 const now=Date.now();
 // A page that no longer resembles the baseline is usually an error page, a bot check or a redesign. Keep the old baseline and say so; only after repeated problem checks over time accept it as the new baseline (with no alerts).
 const major=!!previous && isMajorChange(previous,lines);
 const rebase=major && (w.fail_count||0)>=REBASE_AFTER_FAILURES && now-(w.last_ok||0)>=REBASE_MIN_AGE_MS;
 if(major && !rebase)throw new Error('This page looks very different from the saved baseline, so it was not compared. It may be showing an error or a bot check. Check again later; if the page was redesigned, a later check will save a new baseline.');
 const additions=previous && !major?matchingAdditions(previous,lines,JSON.parse(w.keywords)):[];
 const statements=[db.prepare('UPDATE watches SET snapshot=?,checked=?,last_ok=?,fail_count=0,error=NULL,checking=0 WHERE id=? AND owner=?').bind(toSnapshot(lines),now,now,id,owner)];
 if(additions.length){
  statements.push(db.prepare('INSERT INTO events (id,owner,watch_id,name,url,content,created) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,id,w.name,w.url,JSON.stringify(buildAlert(additions,page.links)),now));
  statements.push(db.prepare('DELETE FROM events WHERE owner=? AND id NOT IN (SELECT id FROM events WHERE owner=? ORDER BY created DESC LIMIT ?)').bind(owner,owner,KEEP_EVENTS));
 }
 await db.batch(statements);
 const notes=[page.truncated?` Only the first ${MAX_LINES} lines of this page were compared.`:'',rebase?' The page layout changed a lot, so a new baseline was saved.':''].join('');
 const baseline=!previous;
 const message=baseline?'Baseline saved. Future checks will highlight new matching text.':(additions.length?`${additions.length} matching text change${additions.length===1?'':'s'} found.`:rebase?'':'No new matching text.');
 return Response.json({message:(message+notes).trim(),baseline,changes:additions.length,truncated:page.truncated});}
 catch(e){const msg=e instanceof Error?e.message:'Unable to read the website.';await db.prepare('UPDATE watches SET error=?,checked=?,fail_count=fail_count+1,checking=0 WHERE id=? AND owner=?').bind(msg,Date.now(),id,owner).run();throw new Error(msg);}
 }catch(e){return failure(e);}}
