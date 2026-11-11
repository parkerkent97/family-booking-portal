const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const moduleResult={exports:{}};
vm.runInThisContext('(function(module,exports){'+ts.transpileModule(fs.readFileSync('lib/usage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText+'})')(moduleResult,moduleResult.exports);
const {monthUsage,shiftMonth,validMonth}=moduleResult.exports;
const houses=[{id:1,name:'Bay Ave'},{id:2,name:'Bear Ln'}];
const booking=(house,start,end,status='active')=>({house_id:house,start_date:start,end_date:end,status});
test('overlaps deduplicate per house and across either house; cancelled stays excluded',()=>{
 const r=monthUsage('2026-11',houses,[booking(1,'2026-11-01','2026-11-04'),booking(1,'2026-11-02','2026-11-05'),booking(2,'2026-11-03','2026-11-06'),booking(1,'2026-11-10','2026-11-15','cancelled')]);
 assert.deepEqual(r.rows.map(x=>x.occupiedNights),[4,3]);assert.equal(r.eitherNights,5);assert.equal(r.totalDays,30);assert.equal(r.rows[0].usageRate,4/30);
});
test('cross-month stays split, checkout excluded, leap day and empty houses included',()=>{
 const b=[booking(1,'2024-02-28','2024-03-02')];
 assert.equal(monthUsage('2024-02',houses,b).rows[0].occupiedNights,2);
 const march=monthUsage('2024-03',houses,b);assert.equal(march.rows[0].occupiedNights,1);assert.equal(march.rows[1].occupiedNights,0);
 assert.equal(monthUsage('2024-02',houses,[]).totalDays,29);assert.equal(monthUsage('2024-02',houses,[]).eitherNights,0);
});
test('year rollover, DST dates and boundary-only stays',()=>{
 assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2026-12',1),'2027-01');
 assert.equal(monthUsage('2026-03',houses,[booking(1,'2026-03-07','2026-03-10')]).eitherNights,3);
 assert.equal(monthUsage('2026-11',houses,[booking(1,'2026-10-30','2026-11-01'),booking(1,'2026-12-01','2026-12-02')]).eitherNights,0);
 assert.equal(validMonth('2026-13'),false);assert.equal(validMonth('2026-02'),true);
});
