import { query } from '@/lib/database';
import { cookies } from 'next/headers';
import { createHmac, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters.');
  return value;
}
export function equal(a: string, b: string) {
  const digest = (s: string) => createHmac('sha256', secret()).update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}
export function passwordHash(value: string) {
  const salt = randomUUID();
  return salt + ':' + scryptSync(value, salt, 32).toString('hex');
}
export function checkPassword(value: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return !!salt && !!hash && equal(scryptSync(value, salt, 32).toString('hex'), hash);
}
export async function settings() {
  const rows = await query('SELECT password_hash,version FROM site_settings WHERE id=1');
  return rows[0] as { password_hash: string | null; version: number };
}
type Session = { id: string; admin: boolean; named: boolean; version: number; exp: number };
function sign(payload: string) { return createHmac('sha256', secret()).update(payload).digest('base64url'); }
export async function setSession(session: Omit<Session, 'exp'>) {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  (await cookies()).set('family_session', payload + '.' + sign(payload), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
}
export async function session(requireName = true): Promise<Session | null> {
  const raw = (await cookies()).get('family_session')?.value;
  if (!raw) return null;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature || !equal(signature, sign(payload))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (s.exp < Date.now() || typeof s.id !== 'string' || (requireName && !s.named)) return null;
    if (s.version !== (await settings()).version) return null;
    return s;
  } catch { return null; }
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  return origin === new URL(req.url).origin;
}
export async function rateLimit(req: Request, scope = 'login') {
  // Atomic, shared across server instances; IP is trusted only from the hosting proxy.
  const ip = req.headers.get('x-vercel-forwarded-for') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  const key = createHmac('sha256', secret()).update(scope + ':' + ip).digest('hex');
  await query("DELETE FROM login_attempts WHERE window_start < now()-interval '1 day'");
  const rows = await query(`INSERT INTO login_attempts AS a(key,window_start,attempts) VALUES($1,now(),1)
    ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN a.window_start < now()-interval '15 minutes' THEN 1 ELSE a.attempts+1 END,
    window_start=CASE WHEN a.window_start < now()-interval '15 minutes' THEN now() ELSE a.window_start END RETURNING attempts`, [key]);
  return rows[0].attempts <= 15;
}

// A separate signed browser identity preserves booking ownership after signing out.
// It cannot unlock the site or grant admin privileges.
export async function visitorId() {
  const jar = await cookies();
  const raw = jar.get('family_visitor')?.value;
  const [id, signature] = (raw || '').split('.');
  if (id && signature && equal(signature, sign('visitor:' + id))) return id;
  const fresh = randomUUID();
  jar.set('family_visitor', fresh + '.' + sign('visitor:' + fresh), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
  return fresh;
}

export async function rememberVisitor(id: string) {
  (await cookies()).set('family_visitor', id + '.' + sign('visitor:' + id), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 365 * 86400 });
}
