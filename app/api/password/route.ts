import { query } from '@/lib/database';
import { NextResponse } from 'next/server';
import { passwordHash, sameOrigin, session, setSession } from '@/lib/server';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const s = await session();
  if (!s?.admin) return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  const { password } = await req.json();
  if (typeof password !== 'string' || password.trim().length < 8 || password.length > 128) return NextResponse.json({ error: 'Choose a password between 8 and 128 characters.' }, { status: 400 });
  const version = s.version + 1;
  let rows;
  try { rows = await query('UPDATE site_settings SET password_hash=$1,version=$2 WHERE id=1 AND version=$3 RETURNING id', [passwordHash(password), version, s.version]); }
  catch { return NextResponse.json({ error: 'Could not change the password.' }, { status: 500 }); }
  if (!rows.length) return NextResponse.json({ error: 'Please sign in again.' }, { status: 409 });
  await setSession({ ...s, version });
  return NextResponse.json({ ok: true });
}
