import Dashboard from './dashboard';
import {headers} from 'next/headers';
import {env} from 'cloudflare:workers';
import {identity} from '../lib/auth';
import {zohoConfigured} from '../lib/zoho-mail';
export const dynamic='force-dynamic';
export default async function Page(){const h=await headers();const who=await identity(new Headers(h));return <Dashboard signedIn={!!who} email={who?.email??null} siteKey={env.TURNSTILE_SITE_KEY||null} emailSignIn={!!(env.AUTH_SECRET&&env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&zohoConfigured(env))}/>;}
