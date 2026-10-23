import {context,failure} from '../../../lib/server';
export async function GET(req:Request){try{const {owner,db}=context(req);const rows=await db.prepare('SELECT * FROM events WHERE owner=? ORDER BY created DESC LIMIT 100').bind(owner).all();return Response.json(rows.results);}catch(e){return failure(e);}}
export async function PATCH(req:Request){try{const {owner,db}=context(req);await db.prepare('UPDATE events SET seen=1 WHERE owner=?').bind(owner).run();return Response.json({ok:true});}catch(e){return failure(e);}}
