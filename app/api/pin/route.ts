import { NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { session, sameOrigin, rateLimit, checkPassword, passwordHash } from '@/lib/server';
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({error:'Forbidden'},{status:403});
  const s = await session();
  if (!s) return NextResponse.json({error:'Please sign in.'},{status:401});
  if (!await rateLimit(req,'pin')) return NextResponse.json({error:'Too many attempts. Try again in 15 minutes.'},{status:429});
  const {pin,currentPin} = await req.json();
  if (typeof pin !== 'string' || !/^\d{6,12}$/.test(pin)) return NextResponse.json({error:'Choose a PIN with 6–12 digits.'},{status:400});
  const rows = await query('SELECT pin_hash FROM visitors WHERE id=$1',[s.id]);
  if (!rows[0]) return NextResponse.json({error:'Enter your name first.'},{status:400});
  const previous = rows[0].pin_hash;
  if (previous && (typeof currentPin !== 'string' || currentPin.length > 12 || !checkPassword(currentPin,previous))) return NextResponse.json({error:'Current PIN is incorrect.'},{status:400});
  try {
    const updated = await query('UPDATE visitors SET pin_hash=$2 WHERE id=$1 AND pin_hash IS NOT DISTINCT FROM $3 RETURNING id',[s.id,passwordHash(pin),previous]);
    if (!updated.length) return NextResponse.json({error:'PIN changed elsewhere. Please try again.'},{status:409});
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:'This name already has a PIN. Sign out and use your existing name and PIN, or ask the admin for help.'},{status:409}); }
}
