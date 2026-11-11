const {test}=require('node:test'),assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const result={exports:{}};
vm.runInThisContext('(function(module,exports){'+ts.transpileModule(fs.readFileSync('lib/stay-export.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+'})')(result,result.exports);
const {stayCalendar,staySummary}=result.exports;
const stay={bookingId:42,house:'Bay Ave',name:'Pat Kent',start:'2027-01-30',end:'2027-02-02',guestCount:2,guestNames:'Alex, Jamie'};
test('calendar exports all-day dates with exclusive departure and stable booking identity',()=>{
 const text=stayCalendar(stay,new Date('2026-11-11T12:00:00Z'));
 assert.match(text,/DTSTART;VALUE=DATE:20270130\r\n/);assert.match(text,/DTEND;VALUE=DATE:20270202\r\n/);assert.match(text,/UID:booking-42@bayavebearln.com/);assert.match(text,/DTSTAMP:20261111T120000Z/);
 assert.match(text,/Alex\\, Jamie/);assert.ok(text.endsWith('END:VCALENDAR\r\n'));
});
test('calendar escapes injected lines and folds Unicode safely at 75 bytes',()=>{
 const text=stayCalendar({...stay,name:'é'.repeat(70)+'\nBEGIN:VEVENT;test,\\'});
 for(const line of text.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 assert.equal(text.split('\r\nBEGIN:VEVENT\r\n').length,2);
 assert.ok(text.replace(/\r\n /g,'').includes('\\nBEGIN:VEVENT\\;test\\,\\\\'));
});
test('share summary includes dates and optional guest names but not notes',()=>{
 const text=staySummary({...stay,note:'Private note'});
 assert.ok(text.includes('Arrival: Jan 30, 2027'));assert.ok(text.includes('Departure: Feb 2, 2027'));assert.ok(text.includes('Guest names: Alex, Jamie'));assert.ok(!text.includes('Private note'));
 assert.ok(!staySummary({...stay,guestNames:''}).includes('Guest names:'));
});
