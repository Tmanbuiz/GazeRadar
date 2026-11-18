import {deliverPush} from './push.ts';
import type {PushEnv} from './push-provider.ts';
import {checkWatch,type WatchRow} from './checker.ts';
import {deliverNotifications,type MailEnv} from './notifications.ts';
export const WATCHES_PER_RUN=6,CHECK_CONCURRENCY=3;
export async function runScheduled(db:D1Database,env:MailEnv&PushEnv,now=Date.now()) {
 await db.prepare("INSERT INTO throttle (key,count,window_start) VALUES ('scheduler:last_run',1,?) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start").bind(now).run();
 const due=await db.prepare('SELECT * FROM watches WHERE active=1 AND next_check<=? AND (checked IS NULL OR checked<=?) AND (checking=0 OR checking<?) ORDER BY next_check ASC LIMIT ?').bind(now,now-60000,now-120000,WATCHES_PER_RUN).all<WatchRow>();
 let checked=0,failed=0;
 // Checks are mostly network waits, so a few run side by side. Each watch has its own lock.
 for(let i=0;i<due.results.length;i+=CHECK_CONCURRENCY){
  const results=await Promise.allSettled(due.results.slice(i,i+CHECK_CONCURRENCY).map(watch=>checkWatch({db,watch})));
  for(const r of results){if(r.status==="fulfilled")checked++;else failed++;}
 }
 const mail=await deliverNotifications({db,env});
 const push=await deliverPush(db,env);
 return {checked,failed,mail,push};
}
