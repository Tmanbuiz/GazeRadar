// Shared Zoho Mail adapter for sign-in and opted-in watch alerts.
import {normalizeEmail} from './login.ts';
type DB = D1Database;
export type ZohoEnv = {
 ZOHO_CLIENT_ID?: string; ZOHO_CLIENT_SECRET?: string; ZOHO_REFRESH_TOKEN?: string; ZOHO_ACCOUNT_ID?: string;
 ZOHO_FROM?: string; ZOHO_ACCOUNTS_URL?: string; ZOHO_MAIL_URL?: string;
};
export type MailMessage = {subject:string;content:string};
export const zohoConfigured=(env:ZohoEnv)=>!!(env.ZOHO_CLIENT_ID&&env.ZOHO_CLIENT_SECRET&&env.ZOHO_REFRESH_TOKEN&&env.ZOHO_ACCOUNT_ID&&env.ZOHO_FROM);
const DEFAULT_ACCOUNTS = 'https://accounts.zohocloud.ca';
const DEFAULT_MAIL = 'https://mail.zohocloud.ca';
const HOST_OK = /^(accounts|mail)\.(zoho\.(com|eu|in|com\.au|jp|sa|com\.cn)|zohocloud\.ca)$/;

// Only real Zoho hosts may receive the client secret and refresh token.
export function zohoBase(value: string | undefined, fallback: string): string {
 const u = new URL(value || fallback);
 if (u.protocol !== 'https:' || !HOST_OK.test(u.hostname) || u.port || u.username || u.password) throw new Error('Zoho URL is not allowed.');
 return u.origin;
}

export function loginMessage(code: string): { subject: string; content: string } {
 return {
  subject: 'Your GazeRadar sign-in code',
  content: `Your GazeRadar sign-in code is ${code}\n\nIt expires in 10 minutes and works once. If you did not ask for it, you can ignore this email.`,
 };
}

// Log only fixed classifications: never raw exceptions, provider bodies, addresses or credentials.
function reportMailFailure(stage: string, error: unknown, httpStatus?: number, providerError?: string) {
 const message = error instanceof Error ? error.message : '';
 const allowed = ['Zoho is not configured.', 'Zoho account id is invalid.', 'Email address is invalid.',
  'Zoho URL is not allowed.', 'Invalid URL', 'Zoho token request failed.', 'Zoho send failed.', 'Illegal invocation'];
 const reason = allowed.includes(message) ? message : /^Zoho send failed \(\d{3}\)\.$/.test(message) ? message : 'Unclassified runtime failure';
 const kind = error instanceof Error && ['Error','TypeError','TimeoutError','AbortError'].includes(error.name) ? error.name : 'Error';
 console.error('gazeradar.mail.failure', {stage, reason, kind, ...(providerError ? {providerError} : {}), ...(httpStatus === undefined ? {} : {httpStatus})});
}

async function accessToken(env: ZohoEnv, db: DB, f: typeof fetch, now: number, force: boolean): Promise<string> {
 let providerError: string | undefined;
 let stage = 'token_cache_read';
 let httpStatus: number | undefined;
 try {
 if (!force) {
  const c = await db.prepare('SELECT token,expires FROM zoho_token WHERE id=1').first<{ token: string; expires: number }>();
  if (c && c.expires - now > 300000) return c.token;
 }
 stage = 'token_configuration';
 if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) throw new Error('Zoho is not configured.');
 const tokenUrl = `${zohoBase(env.ZOHO_ACCOUNTS_URL, DEFAULT_ACCOUNTS)}/oauth/v2/token`;
 stage = 'token_request';
 const res = await f(tokenUrl, {
  method: 'POST',
  redirect:'manual',signal:AbortSignal.timeout(20000),
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.ZOHO_CLIENT_ID, client_secret: env.ZOHO_CLIENT_SECRET, refresh_token: env.ZOHO_REFRESH_TOKEN }).toString(),
 });
 httpStatus = res.status;
 stage = 'token_response';
 const data = await res.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown; error?: unknown } | null;
 if (typeof data?.error === 'string' && ['invalid_client','invalid_client_secret','invalid_code','invalid_grant','invalid_token','invalid_scope','access_denied'].includes(data.error)) providerError = data.error;
 if (!res.ok || !data || typeof data.access_token !== 'string') throw new Error('Zoho token request failed.');
 const secs = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
 stage = 'token_cache_write';
 await db.prepare('INSERT INTO zoho_token (id,token,expires) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires=excluded.expires')
  .bind(data.access_token, now + secs * 1000).run();
 return data.access_token;
 } catch (error) { reportMailFailure(stage, error, httpStatus, providerError); throw error; }
}

export async function sendMail(env: ZohoEnv, db: DB, f: typeof fetch, to: string, msg:MailMessage, now = Date.now()): Promise<void> {
 let stage = 'mail_configuration';
 let httpStatus: number | undefined;
 try {
 if (!zohoConfigured(env) || !env.ZOHO_ACCOUNT_ID || !env.ZOHO_FROM) throw new Error('Zoho is not configured.');
 if (!/^\d+$/.test(env.ZOHO_ACCOUNT_ID)) throw new Error('Zoho account id is invalid.');
 const url = `${zohoBase(env.ZOHO_MAIL_URL, DEFAULT_MAIL)}/api/accounts/${env.ZOHO_ACCOUNT_ID}/messages`;
 if(!normalizeEmail(to)||!normalizeEmail(env.ZOHO_FROM))throw new Error('Email address is invalid.');
 const body = JSON.stringify({ fromAddress: env.ZOHO_FROM, toAddress: to, subject: msg.subject, content: msg.content, mailFormat: 'plaintext' });
 stage = 'token';
 let token = await accessToken(env, db, f, now, false);
 for (let attempt = 0; attempt < 2; attempt++) {
  stage = 'mail_request';
  const res = await f(url, { method: 'POST', redirect:'manual',signal:AbortSignal.timeout(20000), headers: { authorization: `Zoho-oauthtoken ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body });
  httpStatus = res.status;
  stage = 'mail_response';
  if (res.status === 401 && attempt === 0) { stage = 'token'; token = await accessToken(env, db, f, now, true); continue; }
  const data = await res.json().catch(() => null) as { status?: { code?: number } } | null;
  if (!res.ok || data?.status?.code !== 200) throw new Error(`Zoho send failed (${res.status}).`);
  return;
 }
 throw new Error('Zoho send failed.');
 } catch (error) {
  if (stage !== 'token') reportMailFailure(stage, error, httpStatus);
  throw error;
 }
}
export async function sendLoginCode(env:ZohoEnv,db:DB,f:typeof fetch,to:string,code:string,now=Date.now()):Promise<void>{return sendMail(env,db,f,to,loginMessage(code),now);}

export async function verifyTurnstile(secret: string | undefined, token: unknown, ip: string, f: typeof fetch): Promise<boolean> {
 if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;
 const res = await f('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
 });
 const data = await res.json().catch(() => null) as { success?: boolean } | null;
 return res.ok && data?.success === true;
}
