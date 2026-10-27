import {context,failure} from '../../../lib/server';
import {jsonBody} from '../../../lib/request-body';
import {readGoal,saveGoal} from '../../../lib/goals';
export async function GET(req:Request){try{const {owner,db}=await context(req);return Response.json(await readGoal(db,owner),{headers:{'cache-control':'no-store'}});}catch(e){return failure(e);}}
export async function PUT(req:Request){try{const {owner,db}=await context(req);return Response.json(await saveGoal(db,owner,await jsonBody(req)));}catch(e){return failure(e);}}
