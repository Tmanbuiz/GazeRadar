import {jsonBody} from '../../../lib/request-body';
import {context,failure} from '../../../lib/server';
import {validUrl} from '../../../lib/monitor';
import {categories,intervals,jsonValue,watchOptions} from '../../../lib/preferences';
export async function GET(req:Request){try{const {owner,db}=await context(req);const rows=await db.prepare('SELECT id,name,url,keywords,active,checked,created,error,last_ok,fail_count,category,interval_hours,next_check,email_enabled,options,property_snapshot FROM watches WHERE owner=? ORDER BY created DESC').bind(owner).all();return Response.json(rows.results,{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const {owner,db}=await context(req),b=await jsonBody<Record<string,unknown>>(req);
 const name=String(b.name||'').trim().slice(0,100);if(!name)throw new Error('Give your watch a name.');
 const url=validUrl(String(b.url||'')),category=String(b.category||'website'),hours=Number(b.intervalHours??6);
 if(!categories.includes(category as typeof categories[number])||!intervals.includes(hours))throw new Error('Choose a valid category and checking interval.');
 const keywords=String(b.keywords||'').split(',').map(x=>x.trim()).filter(Boolean);if(keywords.length>15||keywords.some(k=>k.length>60))throw new Error('Use up to 15 keywords, each under 60 characters.');
 const duplicate=await db.prepare('SELECT id FROM watches WHERE owner=? AND url=?').bind(owner,url).first();if(duplicate)throw new Error('You already have a watch for this URL.');
 const id=crypto.randomUUID(),now=Date.now();
 const inserted=await db.prepare('INSERT INTO watches (id,owner,name,url,keywords,created,category,interval_hours,next_check,email_enabled,options) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM watches WHERE owner=?)<20')
 .bind(id,owner,name,url,JSON.stringify(keywords),now,category,hours,now,b.emailEnabled===false?0:1,JSON.stringify(watchOptions(b.options)),owner).run();
 if(!inserted.meta.changes)throw new Error('Your account supports 20 watches. Delete one before adding another.');
 return Response.json({id});
}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{
 const {owner,db}=await context(req),b=await jsonBody<Record<string,unknown>>(req);
 const w=await db.prepare('SELECT * FROM watches WHERE id=? AND owner=?').bind(String(b.id),owner).first<{active:number;interval_hours:number;email_enabled:number;options:string;name:string;keywords:string}>();if(!w)throw new Error('Watch not found.');
 const hours=Number(b.intervalHours??w.interval_hours);if(!intervals.includes(hours))throw new Error('Choose a valid checking interval.');
 const name=String(b.name??w.name).trim().slice(0,100);if(!name)throw new Error('Give your watch a name.');
 const keywords=b.keywords===undefined?jsonValue<string[]>(w.keywords,[]):String(b.keywords).split(',').map(x=>x.trim()).filter(Boolean);if(keywords.length>15||keywords.some(k=>k.length>60))throw new Error('Use up to 15 keywords, each under 60 characters.');
 await db.prepare('UPDATE watches SET active=?,interval_hours=?,next_check=?,email_enabled=?,options=?,name=?,keywords=? WHERE id=? AND owner=?').bind(typeof b.active==='boolean'?(b.active?1:0):w.active,hours,Date.now(),typeof b.emailEnabled==='boolean'?(b.emailEnabled?1:0):w.email_enabled,JSON.stringify(watchOptions(b.options??jsonValue(w.options,{}))),name,JSON.stringify(keywords),String(b.id),owner).run();
 return Response.json({ok:true});
}catch(e){return failure(e);}}
export async function DELETE(req:Request){try{
 const {owner,db}=await context(req),id=new URL(req.url).searchParams.get('id');if(!id)throw new Error('Choose a watch to delete.');
 await db.batch([db.prepare('DELETE FROM opportunities WHERE watch_id=? AND owner=?').bind(id,owner),db.prepare('DELETE FROM events WHERE watch_id=? AND owner=?').bind(id,owner),db.prepare('DELETE FROM watches WHERE id=? AND owner=?').bind(id,owner)]);
 return Response.json({ok:true});
}catch(e){return failure(e);}}
