import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkPassword, equal, rateLimit, sameOrigin, session, setSession, settings, visitorId } from '@/lib/server';
export async function GET() {
  const s = await session(false);
  return NextResponse.json(s ? { id: s.id, admin: s.admin, named: s.named } : null, { status: s ? 200 : 401 });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    if (!await rateLimit(req)) return NextResponse.json({ error: 'Too many attempts. Please try again in 15 minutes.' }, { status: 429 });
    const { password, admin } = await req.json();
    if (typeof password !== 'string' || password.length > 256) return NextResponse.json({ error: 'Invalid password.' }, { status: 400 });
    const config = await settings();
    const expected = admin === true ? process.env.ADMIN_PASSWORD : process.env.FAMILY_PASSWORD;
    const valid = admin === true ? !!expected && equal(password, expected) : config.password_hash ? checkPassword(password, config.password_hash) : !!expected && equal(password, expected);
    if (!valid) return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    await setSession({ id: await visitorId(), admin: admin === true, named: false, version: config.version });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
    console.error('Login configuration check failed', {
      databaseConfigured: !!process.env.DATABASE_URL,
      sessionSecretValid: (process.env.SESSION_SECRET?.length ?? 0) >= 32,
      familyPasswordConfigured: !!process.env.FAMILY_PASSWORD,
      adminPasswordConfigured: !!process.env.ADMIN_PASSWORD,
      databaseErrorCode: /^[A-Z0-9_]{1,30}$/.test(code) ? code : 'unknown',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
}
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  (await cookies()).delete('family_session');
  return NextResponse.json({ ok: true });
}
