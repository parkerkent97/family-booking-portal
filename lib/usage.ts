export type UsageHouse = {id:number;name:string};
export type UsageBooking = {house_id:number;start_date:string;end_date:string;status:string};
export function validMonth(month:string) { return /^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(month); }
export function shiftMonth(month:string, offset:number) {
 const [year,m]=month.split('-').map(Number);
 return new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7);
}
export function monthUsage(month:string,houses:UsageHouse[],bookings:UsageBooking[]) {
 const start=month+'-01',end=shiftMonth(month,1)+'-01';
 const totalDays=(Date.parse(end)-Date.parse(start))/86400000;
 const either=new Set<string>();
 const rows=houses.map(h=>{
  const nights=new Set<string>();
  for(const b of bookings){
   if(b.house_id!==h.id || b.status!=='active')continue;
   const from=b.start_date>start?b.start_date:start,to=b.end_date<end?b.end_date:end;
   for(let t=Date.parse(from);t<Date.parse(to);t+=86400000){const day=new Date(t).toISOString().slice(0,10);nights.add(day);either.add(day);}
  }
  return {houseId:h.id,houseName:h.name,occupiedNights:nights.size,usageRate:nights.size/totalDays};
 });
 return {month,totalDays,rows,eitherNights:either.size,eitherRate:either.size/totalDays};
}
