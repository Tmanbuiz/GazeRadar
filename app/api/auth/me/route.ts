import {handleMe} from '../../../../lib/auth-routes';
export async function GET(req:Request){return handleMe(req);}
