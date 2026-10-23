import Dashboard from './dashboard';
import {headers} from 'next/headers';
export const dynamic='force-dynamic';
export default async function Page(){const h=await headers();return <Dashboard signedIn={!!h.get('oai-authenticated-user-id')}/>;}
