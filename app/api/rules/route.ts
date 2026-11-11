import { NextResponse } from 'next/server';
import { query } from '@/lib/database';
import { session, sameOrigin } from '@/lib/server';
export async function POST(req: Request) {
  if (!sameOrigin(req) || !(await session())?.admin) return NextResponse.json({error:'Admin access required.'},{status:403});
  const {houseId,rules} = await req.json();
  if (!Number.isSafeInteger(houseId) || typeof rules !== 'string' || rules.length>20000) return NextResponse.json({error:'Enter valid house rules (up to 20,000 characters).'},{status:400});
  const rows = await query('UPDATE houses SET rules=$2 WHERE id=$1 RETURNING id',[houseId,rules]);
  return NextResponse.json(rows.length?{ok:true}:{error:'House not found.'},{status:rows.length?200:404});
}
