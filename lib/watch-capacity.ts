import {sha256Hex} from './login.ts';

export const DEFAULT_WATCH_LIMIT=20;

// Resolve exemptions from the authenticated owner's database record, never from
// a submitted email, mailbox connection, header or request-body quota flag.
export async function watchLimit(db:D1Database,owner:string,allowedHashes=''):Promise<number|null>{
 const hashes=allowedHashes.split(',').map(s=>s.trim().toLowerCase()).filter(s=>/^[a-f0-9]{64}$/.test(s));
 if(!hashes.length)return DEFAULT_WATCH_LIMIT;
 const user=await db.prepare("SELECT email FROM users WHERE 'email-otp:'||id=?").bind(owner).first<{email:string}>();
 return user&&hashes.includes(await sha256Hex(user.email.trim().toLowerCase()))?null:DEFAULT_WATCH_LIMIT;
}

export type NewWatch={id:string;owner:string;name:string;url:string;keywords:string;created:number;category:string;hours:number;emailEnabled:boolean;options:string};
export async function reserveWatch(db:D1Database,w:NewWatch,limit:number|null){
 // The duplicate-URL check is part of the same statement, so two simultaneous requests cannot both create the watch.
 const inserted=await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,category,interval_hours,next_check,email_enabled,options) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (?=1 OR (SELECT COUNT(*) FROM watches WHERE owner=?)<?) AND NOT EXISTS (SELECT 1 FROM watches WHERE owner=? AND url=?)')
 .bind(w.id,w.owner,w.name,w.url,w.keywords,w.created,w.category,w.hours,w.created,w.emailEnabled?1:0,w.options,limit===null?1:0,w.owner,limit??DEFAULT_WATCH_LIMIT,w.owner,w.url).run();
 if(!inserted.meta.changes&&await db.prepare('SELECT 1 AS x FROM watches WHERE owner=? AND url=?').bind(w.owner,w.url).first())throw new Error('You already have a watch for this URL.');
 if(!inserted.meta.changes)throw new Error(`Your account supports ${limit??DEFAULT_WATCH_LIMIT} watches. Delete one before adding another.`);
}
