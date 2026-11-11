import { NextResponse } from 'next/server';
import { session } from '@/lib/server';
import { query } from '@/lib/database';
export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    const [houses, bookings, visitors] = await Promise.all([
      query('SELECT id,name,rules FROM houses ORDER BY id'),
      query("SELECT id,house_id,visitor_id AS created_by,booked_by,guest_count,start_date::text,end_date::text,status,note FROM bookings WHERE status='active'"),
      query('SELECT first_name,last_name,(pin_hash IS NOT NULL) AS has_pin FROM visitors WHERE id=$1', [s.id]),
    ]);
    if (!visitors[0]) return NextResponse.json({ error: 'Please enter your name again.' }, { status: 401 });
    return NextResponse.json({ houses, bookings, profiles: [], user: { id: s.id, admin: s.admin, hasPin: visitors[0].has_pin, name: `${visitors[0].first_name} ${visitors[0].last_name}` } });
  } catch { return NextResponse.json({ error: 'Could not load the calendar. Please try again.' }, { status: 503 }); }
}
