import { NextResponse } from 'next/server';
import { sameOrigin, session } from '@/lib/server';
import { query } from '@/lib/database';
import { bookingValues } from '@/lib/booking-validation';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const s = await session();
  if (!s) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
  let body;
  try { body = await req.json(); if (!body || typeof body !== 'object') throw new Error(); }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    if (body.action === 'create') {
      let v;
      try { v = bookingValues(body); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
      if (!Number.isSafeInteger(body.house_id)) return NextResponse.json({ error: 'Select a house.' }, { status: 400 });
      const rows = await query(`INSERT INTO bookings(house_id,visitor_id,booked_by,guest_count,start_date,end_date,note,guest_names)
        SELECT h.id,v.id,v.first_name || ' ' || v.last_name,$3,$4::date,$5::date,$6,$7 FROM visitors v JOIN houses h ON h.id=$1 WHERE v.id=$2 RETURNING id`,
        [body.house_id,s.id,v.guest_count,v.start_date,v.end_date,v.note,v.guest_names]);
      return NextResponse.json(rows.length ? { ok: true } : { error: 'Select a valid house and enter your name.' }, { status: rows.length ? 200 : 400 });
    }
    if (!['edit','cancel','delete'].includes(body.action) || !Number.isSafeInteger(body.bookingId)) return NextResponse.json({ error: 'Invalid booking action.' }, { status: 400 });
    const found = await query('SELECT id,visitor_id,status FROM bookings WHERE id=$1', [body.bookingId]);
    const booking = found[0];
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if ((!s.admin && booking.visitor_id !== s.id) || (body.action === 'delete' && !s.admin)) return NextResponse.json({ error: 'Only the booking creator or admin can make this change.' }, { status: 403 });
    let rows;
    if (body.action === 'delete') rows = await query('DELETE FROM bookings WHERE id=$1 RETURNING id', [body.bookingId]);
    else if (body.action === 'cancel') rows = await query("UPDATE bookings SET status='cancelled',cancelled_at=now() WHERE id=$1 AND status='active' RETURNING id", [body.bookingId]);
    else {
      let v;
      try { v=bookingValues(body); } catch(e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
      rows=await query("UPDATE bookings SET start_date=$2::date,end_date=$3::date,guest_count=$4,note=$5,guest_names=$6 WHERE id=$1 AND status='active' RETURNING id", [body.bookingId,v.start_date,v.end_date,v.guest_count,v.note,v.guest_names]);
    }
    return NextResponse.json(rows.length ? { ok: true } : { error: 'This booking is no longer active.' }, { status: rows.length ? 200 : 409 });
  } catch { return NextResponse.json({ error: 'Could not save your booking change. Please try again.' }, { status: 503 }); }
}
