import {handleLogout} from '../../../../lib/auth-routes';
export async function POST(req:Request){return handleLogout(req);}
