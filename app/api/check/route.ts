import {jsonBody} from '../../../lib/request-body';
import {context,failure} from '../../../lib/server';
import {checkWatch,type WatchRow} from '../../../lib/checker';
export async function POST(req:Request){try{
 const {owner,db}=await context(req),body=await jsonBody<{id?:unknown}>(req);
 if(typeof body.id!=='string')throw new Error('Choose a watch to check.');
 const watch=await db.prepare('SELECT * FROM watches WHERE id=? AND owner=?').bind(body.id,owner).first<WatchRow>();
 if(!watch)throw new Error('Watch not found.');
 return Response.json(await checkWatch({db,watch}),{headers:{'cache-control':'no-store'}});
}catch(e){return failure(e);}}
