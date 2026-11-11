import { query } from '@/lib/database';
import { NextResponse } from 'next/server';
import { sameOrigin, session, setSession, checkPassword, rateLimit, rememberVisitor } from '@/lib/server';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const s = await session(false);
  if (!s) return NextResponse.json({ error: 'Please enter the site password.' }, { status: 401 });
  const body = await req.json();
  const first = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const last = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!first || !last || first.length > 80 || last.length > 80) return NextResponse.json({ error: 'Enter your first and last name (up to 80 characters each).' }, { status: 400 });
  if (body.recover) {
    if (!await rateLimit(req, 'pin')) return NextResponse.json({ error: 'Too many PIN attempts. Try again in 15 minutes.' }, { status: 429 });
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (!/^\d{6,12}$/.test(pin)) return NextResponse.json({ error: 'Enter your 6–12 digit PIN.' }, { status: 400 });
    const rows = await query('SELECT id,pin_hash FROM visitors WHERE lower(trim(first_name))=lower($1) AND lower(trim(last_name))=lower($2) AND pin_hash IS NOT NULL', [first,last]);
    if (!rows[0] || !checkPassword(pin, rows[0].pin_hash)) return NextResponse.json({ error: 'Name and PIN did not match.' }, { status: 400 });
    await rememberVisitor(rows[0].id);
    await setSession({ ...s, id: rows[0].id, named: true });
    return NextResponse.json({ ok: true });
  }
  try {
    await query('INSERT INTO visitors(id,first_name,last_name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET first_name=CASE WHEN visitors.pin_hash IS NULL THEN $2 ELSE visitors.first_name END,last_name=CASE WHEN visitors.pin_hash IS NULL THEN $3 ELSE visitors.last_name END', [s.id, first, last]);
  } catch { return NextResponse.json({ error: 'Could not save your name.' }, { status: 500 }); }
  await setSession({ ...s, named: true });
  return NextResponse.json({ ok: true });
}
