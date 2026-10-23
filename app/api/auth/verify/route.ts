import {handleVerify} from '../../../../lib/auth-routes';
export async function POST(req:Request){return handleVerify(req);}
