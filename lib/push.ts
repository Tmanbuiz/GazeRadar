import {shareHash} from './goals.ts';
import {pushConfigured,sendPush,PushError,type PushEnv,type PushDevice} from './push-provider.ts';
export async function registerPush(db:D1Database,owner:string,value:Record<string,unknown>,now=Date.now()){
 const {platform,token}=value,environment=value.environment??'production';
 if(!['ios','android'].includes(String(platform))||typeof token!=='string'||token.length<32||token.length>4096||!['production','sandbox'].includes(String(environment)))throw new Error('Invalid device registration.');
 if(platform==='ios'&&!/^[a-f0-9]{32,256}$/i.test(token))throw new Error('Invalid Apple device token.');
 if(platform==='android'&&!/^[A-Za-z0-9_:\-]+$/.test(token))throw new Error('Invalid Android device token.');
 const id=await shareHash(`${platform}:${token}`);
 const existing=await db.prepare('SELECT owner FROM push_devices WHERE id=?').bind(id).first<{owner:string}>();
 if(existing&&existing.owner!==owner)throw new Error('Disable alerts in the previous account on this device before registering it again.');
 await db.prepare(`INSERT INTO push_devices(id,owner,platform,token,environment,created,cursor_time) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM push_devices WHERE owner=?)<5 OR EXISTS(SELECT 1 FROM push_devices WHERE id=? AND owner=?) ON CONFLICT(id) DO UPDATE SET enabled=1,environment=excluded.environment,failures=0,error=NULL,retry_at=0 WHERE push_devices.owner=excluded.owner`).bind(id,owner,platform,token,environment,now,now,owner,id,owner).run();
 const saved=await db.prepare('SELECT id FROM push_devices WHERE id=? AND owner=?').bind(id,owner).first();if(!saved)throw new Error('You can enable alerts on up to five devices. Remove an old device first.');
 return {id};
}
export async function removePush(db:D1Database,owner:string,id:string){await db.prepare('DELETE FROM push_devices WHERE id=? AND owner=?').bind(id,owner).run();}
export async function deliverPush(db:D1Database,env:PushEnv,now=Date.now(),send=(device:PushDevice)=>sendPush(env,device,fetch,now)){
 const rows=await db.prepare(`SELECT d.* FROM push_devices d WHERE enabled=1 AND locked_until<? AND retry_at<=? AND EXISTS(SELECT 1 FROM events e JOIN watches w ON w.id=e.watch_id AND w.owner=e.owner WHERE e.owner=d.owner AND w.active=1 AND (e.created>d.cursor_time OR (e.created=d.cursor_time AND e.id>d.cursor_id))) ORDER BY retry_at,created LIMIT 3`).bind(now,now).all<PushDevice&{id:string;owner:string;cursor_time:number;cursor_id:string;failures:number}>();
 let sent=0,failed=0;
 for(const d of rows.results){
  if(!pushConfigured(env,d.platform))continue;
  const claim=await db.prepare('UPDATE push_devices SET locked_until=? WHERE id=? AND enabled=1 AND locked_until<?').bind(now+180000,d.id,now).run();if(!claim.meta.changes)continue;
  try{
   const events=await db.prepare(`SELECT e.id,e.created FROM events e JOIN watches w ON w.id=e.watch_id AND w.owner=e.owner WHERE e.owner=? AND w.active=1 AND (e.created>? OR (e.created=? AND e.id>?)) ORDER BY e.created,e.id LIMIT 100`).bind(d.owner,d.cursor_time,d.cursor_time,d.cursor_id).all<{id:string;created:number}>();
   const last=events.results.at(-1);if(!last){await db.prepare('UPDATE push_devices SET locked_until=0 WHERE id=?').bind(d.id).run();continue;}
   await send(d);
   await db.prepare('UPDATE push_devices SET cursor_time=?,cursor_id=?,locked_until=0,failures=0,retry_at=0,error=NULL WHERE id=?').bind(last.created,last.id,d.id).run();sent++;
  }catch(e){failed++;await db.prepare('UPDATE push_devices SET locked_until=0,enabled=?,failures=failures+1,retry_at=?,error=? WHERE id=?').bind(e instanceof PushError&&e.permanent?0:1,now+Math.min(21600000,900000*2**Math.min(d.failures,5)),'Push delivery failed. Check notification setup or enable alerts again.',d.id).run();}
 }
 return {sent,failed};
}
