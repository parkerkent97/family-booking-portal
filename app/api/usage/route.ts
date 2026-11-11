import {query} from '@/lib/database';
import {session} from '@/lib/server';
import {monthUsage,shiftMonth,validMonth,UsageHouse,UsageBooking} from '@/lib/usage';
import {NextRequest,NextResponse} from 'next/server';
export async function GET(req:NextRequest){
 if(!(await session())?.admin)return NextResponse.json({error:'Admin access required.'},{status:403});
 const current=new Date().toISOString().slice(0,7);
 const month=req.nextUrl.searchParams.get('month')||shiftMonth(current,-1);
 if(!validMonth(month))return NextResponse.json({error:'Choose a valid month between 2000 and 2199.'},{status:400});
 try{
  const months=Array.from({length:12},(_,i)=>shiftMonth(month,i-11));
  const houses=await query('SELECT id,name FROM houses ORDER BY id') as UsageHouse[];
  const bookings=await query("SELECT house_id,start_date::text,end_date::text,status FROM bookings WHERE status='active' AND start_date<$1::date AND end_date>$2::date",[shiftMonth(month,1)+'-01',months[0]+'-01']) as UsageBooking[];
  const history=months.map(m=>monthUsage(m,houses,bookings));
  return NextResponse.json({...history[11],history});
 }catch{return NextResponse.json({error:'Could not load usage. Please try again.'},{status:503});}
}
