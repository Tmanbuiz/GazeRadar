import {checkWatch,type WatchRow} from './checker.ts';
import {deliverNotifications,type MailEnv} from './notifications.ts';
export async function runScheduled(db:D1Database,env:MailEnv,now=Date.now()) {
 await db.prepare("INSERT INTO throttle (key,count,window_start) VALUES ('scheduler:last_run',1,?) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start").bind(now).run();
 const due=await db.prepare('SELECT * FROM watches WHERE active=1 AND next_check<=? AND (checked IS NULL OR checked<=?) AND (checking=0 OR checking<?) ORDER BY next_check ASC LIMIT 3').bind(now,now-60000,now-120000).all<WatchRow>();
 let checked=0,failed=0;
 for(const watch of due.results){try{await checkWatch({db,watch});checked++;}catch{failed++;}}
 const mail=await deliverNotifications({db,env});
 return {checked,failed,mail};
}
