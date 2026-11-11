import { query } from '@/lib/database';
import { NextResponse } from 'next/server';
import { sameOrigin, session, setSession } from '@/lib/server';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const s = await session(false);
  if (!s) return NextResponse.json({ error: 'Please enter the site password.' }, { status: 401 });
  const body = await req.json();
  const first = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const last = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  if (!first || !last || first.length > 80 || last.length > 80) return NextResponse.json({ error: 'Enter your first and last name (up to 80 characters each).' }, { status: 400 });
  try {
    await query('INSERT INTO visitors(id,first_name,last_name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET first_name=$2,last_name=$3', [s.id, first, last]);
  } catch { return NextResponse.json({ error: 'Could not save your name.' }, { status: 500 }); }
  await setSession({ ...s, named: true });
  return NextResponse.json({ ok: true });
}
