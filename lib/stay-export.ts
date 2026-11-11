export type ShareStay = {bookingId:number;house:string;name:string;start:string;end:string;guestCount:number;guestNames:string};
function dateLabel(value:string){return new Date(value+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
export function staySummary(stay:ShareStay){
 return [`${stay.house} — ${stay.name}`,`Arrival: ${dateLabel(stay.start)}`,`Departure: ${dateLabel(stay.end)}`,`${stay.guestCount} guest${stay.guestCount===1?'':'s'}`,stay.guestNames?`Guest names: ${stay.guestNames}`:''].filter(Boolean).join('\n');
}
const escapeText=(text:string)=>text.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
// RFC 5545 folds at 75 UTF-8 octets, without splitting a Unicode character.
function fold(line:string){let result='',length=0;const encoder=new TextEncoder();for(const c of line){const size=encoder.encode(c).length;if(length+size>75){result+='\r\n ';length=1;}result+=c;length+=size;}return result;}
export function stayCalendar(stay:ShareStay,now=new Date()){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Bay Ave Bear Ln//Family Stays//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:booking-${stay.bookingId}@bayavebearln.com`,`DTSTAMP:${now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}`,`DTSTART;VALUE=DATE:${stay.start.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${stay.end.replace(/-/g,'')}`,`SUMMARY:${escapeText(stay.house+' — '+stay.name)}`,`LOCATION:${escapeText(stay.house)}`,`DESCRIPTION:${escapeText(staySummary(stay)+'\nCalendar copy only. Check the family site for changes or cancellations.')}`,'END:VEVENT','END:VCALENDAR'];
 return lines.map(fold).join('\r\n')+'\r\n';
}
