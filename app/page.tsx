import Dashboard from './dashboard';
import {headers} from 'next/headers';
import {authenticatedOwner} from '../lib/auth';
export const dynamic='force-dynamic';
export default async function Page(){const h=await headers();const owner=await authenticatedOwner(new Headers(h));return <Dashboard signedIn={!!owner}/>;}
