// Email one-time-code sign-in. Standalone on purpose: db, secret, clock and the mail sender are passed in so the
// logic can be tested against a real SQLite database without a Worker.
type DB = D1Database;

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
export const LIMITS = { emailPerHour: 5, ipPerHour: 10, verifyPerIpPerHour: 30, globalPerDay: 300 };
export const SESSION_COOKIE = '__Host-gz_session';

export class LoginError extends Error {
 status: number;
 constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function normalizeEmail(input: unknown): string | null {
 if (typeof input !== 'string') return null;
 const e = input.trim().toLowerCase();
 if (e.length < 5 || e.length > 254) return null;
 if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(e)) return null;
 if (e.split('@')[0].length > 64) return null;
 return e;
}

const enc = new TextEncoder();
function toHex(buf: ArrayBuffer): string { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export function toBase64Url(bytes: Uint8Array): string {
 let s = ''; for (const b of bytes) s += String.fromCharCode(b);
 return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hmacHex(secret: string, data: string): Promise<string> {
 const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export async function sha256Hex(data: string): Promise<string> { return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data))); }

export function safeEqual(a: string, b: string): boolean {
 if (a.length !== b.length) return false;
 let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
 return d === 0;
}

// Uniform 6-digit code: rejection sampling so no digit is favoured.
export function randomCode(): string {
 const max = 4294967296 - (4294967296 % 1000000);
 const buf = new Uint32Array(1);
 for (;;) { crypto.getRandomValues(buf); if (buf[0] < max) return String(buf[0] % 1000000).padStart(6, '0'); }
}

// Counts one event for a key in a fixed window. Returns false once the limit is passed.
export async function hit(db: DB, key: string, limit: number, windowMs: number, now: number): Promise<boolean> {
 const row = await db.prepare(
  'INSERT INTO throttle (key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END, window_start=CASE WHEN window_start<? THEN ? ELSE window_start END RETURNING count'
 ).bind(key, now, now - windowMs, now - windowMs, now).first<{ count: number }>();
 return !!row && row.count <= limit;
}

async function cleanup(db: DB, now: number) {
 await db.batch([
  db.prepare('DELETE FROM login_codes WHERE expires<?').bind(now),
  db.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
  db.prepare('DELETE FROM throttle WHERE window_start<?').bind(now - 2 * DAY),
 ]);
}

export type RequestDeps = { db: DB; secret: string; email: string; ip: string; now: number; send: (to: string, code: string) => Promise<void> };

export async function requestCode(d: RequestDeps): Promise<void> {
 const { db, secret, email, ip, now } = d;
 if (!secret) throw new LoginError('Email sign-in is not configured.', 503);
 const tooMany = new LoginError('Too many sign-in requests. Please try again later.', 429);
 if (!(await hit(db, `ip:${ip}`, LIMITS.ipPerHour, HOUR, now))) throw tooMany;
 if (!(await hit(db, `email:${email}`, LIMITS.emailPerHour, HOUR, now))) throw tooMany;
 const existing = await db.prepare('SELECT sent FROM login_codes WHERE email=?').bind(email).first<{ sent: number }>();
 // A code was just sent: say nothing new and send nothing. The reply looks the same as a fresh send.
 if (existing && now - existing.sent < RESEND_COOLDOWN_MS) return;
 if (!(await hit(db, 'global:day', LIMITS.globalPerDay, DAY, now))) throw new LoginError('Sign-in email is busy right now. Please try again later.', 429);
 await cleanup(db, now);
 const code = randomCode();
 const hash = await hmacHex(secret, `${email}:${code}`);
 await db.prepare('INSERT INTO login_codes (email,hash,expires,attempts,sent) VALUES (?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,attempts=0,sent=excluded.sent')
  .bind(email, hash, now + CODE_TTL_MS, now).run();
 try { await d.send(email, code); }
 catch {
  await db.prepare('DELETE FROM login_codes WHERE email=? AND hash=?').bind(email, hash).run();
  throw new LoginError('We could not send the code. Please try again in a few minutes.', 502);
 }
}

export type VerifyDeps = { db: DB; secret: string; email: string; code: string; ip: string; now: number };
export type Session = { token: string; userId: string; email: string; maxAge: number };

export async function verifyCode(d: VerifyDeps): Promise<Session> {
 const { db, secret, email, now } = d;
 const bad = new LoginError('That code is wrong or has expired. Request a new one.', 400);
 if (!secret) throw new LoginError('Email sign-in is not configured.', 503);
 if (!/^\d{6}$/.test(d.code)) throw bad;
 if (!(await hit(db, `verify-ip:${d.ip}`, LIMITS.verifyPerIpPerHour, HOUR, now))) throw new LoginError('Too many attempts. Please try again later.', 429);
 // Count the attempt first so parallel guesses cannot exceed the limit.
 const row = await db.prepare('UPDATE login_codes SET attempts=attempts+1 WHERE email=? AND attempts<? AND expires>? RETURNING hash')
  .bind(email, MAX_ATTEMPTS, now).first<{ hash: string }>();
 if (!row) throw bad;
 const expected = await hmacHex(secret, `${email}:${d.code}`);
 if (!safeEqual(expected, row.hash)) throw bad;
 const used = await db.prepare('DELETE FROM login_codes WHERE email=? AND hash=?').bind(email, row.hash).run();
 if (!used.meta.changes) throw bad; // someone else used it first
 const user = await db.prepare('INSERT INTO users (id,email,created,last_login) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET last_login=excluded.last_login RETURNING id')
  .bind(crypto.randomUUID(), email, now, now).first<{ id: string }>();
 if (!user) throw new LoginError('Could not create your account.', 500);
 const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
 await db.prepare('INSERT INTO sessions (hash,user_id,expires,created) VALUES (?,?,?,?)').bind(await sha256Hex(token), user.id, now + SESSION_TTL_MS, now).run();
 return { token, userId: user.id, email, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export async function sessionUser(db: DB, token: string, now: number): Promise<{ userId: string; email: string } | null> {
 if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
 const row = await db.prepare('SELECT u.id AS id,u.email AS email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?')
  .bind(await sha256Hex(token), now).first<{ id: string; email: string }>();
 return row ? { userId: row.id, email: row.email } : null;
}

export async function endSession(db: DB, token: string): Promise<void> {
 await db.prepare('DELETE FROM sessions WHERE hash=?').bind(await sha256Hex(token)).run();
}

export function readCookie(header: string | null, name: string): string | null {
 if (!header) return null;
 for (const part of header.split(';')) {
  const i = part.indexOf('=');
  if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
 }
 return null;
}
export function sessionCookie(token: string, maxAge: number): string { return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`; }
export function clearedCookie(): string { return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`; }

// CSRF: cookies are sent automatically, so every state-changing request must come from this site.
export function sameOriginRequest(req: Request): boolean {
 const origin = req.headers.get('origin');
 if (origin) return origin === new URL(req.url).origin;
 return req.headers.get('sec-fetch-site') === 'same-origin';
}
