const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const jar = new Map();
let config, allowLogin, rows, writes;
process.env.SESSION_SECRET = 'test-only-signing-secret-with-at-least-32-characters';
process.env.FAMILY_PASSWORD = 'test-family-password';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.DATABASE_URL = 'postgres://test-only';
async function query(sql, params = []) {
  if (sql.startsWith('SELECT id,pin_hash')) return rows.pinVisitor ? [rows.pinVisitor] : [];
  if (sql.startsWith('SELECT pin_hash')) return [{pin_hash:rows.pinHash||null}];
  if (sql.startsWith('UPDATE visitors SET pin_hash')) { rows.pinHash=params[1]; return [{id:params[0]}]; }
  if (sql.startsWith('UPDATE houses')) { writes.push({sql,params}); return [{id:params[0]}]; }
  if (sql.startsWith('SELECT password_hash')) return [config];
  if (sql.startsWith('DELETE FROM login_attempts')) return [];
  if (sql.startsWith('INSERT INTO login_attempts')) return [{ attempts: allowLogin ? 1 : 16 }];
  if (sql.startsWith('INSERT INTO visitors')) { writes.push({ table: 'visitors', values: params }); return []; }
  if (sql.startsWith('UPDATE site_settings')) {
    if (config.version !== params[2]) return [];
    config = { password_hash: params[0], version: params[1] };
    return [{ id: 1 }];
  }
  if (sql.startsWith('SELECT id,visitor_id')) return rows.bookings ? [rows.bookings] : [];
  if (sql.startsWith('INSERT INTO bookings')) {
    writes.push({ values: { visitor_id: params[1], booked_by: rows.visitors.first_name + ' ' + rows.visitors.last_name } });
    return [{ id: 1 }];
  }
  if (sql.startsWith('UPDATE bookings') || sql.startsWith('DELETE FROM bookings')) { writes.push({ sql, params }); return [{ id: 1 }]; }
  throw new Error('Unexpected query: ' + sql);
}
const cache = new Map();
function load(file) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const customRequire = name => {
    if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key, value) => jar.set(key, value), delete: key => jar.delete(key) }) };
    if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (name === '@/lib/database') return { query };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    return require(name);
  };
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(customRequire, { exports }, exports);
  return exports;
}
const auth = load('lib/server.ts');
const login = load('app/api/session/route.ts');
const bookings = load('app/api/bookings/route.ts');
const names = load('app/api/name/route.ts');
const passwords = load('app/api/password/route.ts');
const { bookingValues } = load('lib/booking-validation.ts');
const request = (body, origin = 'http://localhost') => new Request('http://localhost/api/test', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { jar.clear(); config = { version: 1, password_hash: null }; allowLogin = true; rows = {}; writes = []; });
test('wrong password and cross-origin login cannot create a session', async () => {
  assert.equal((await login.POST(request({ password: 'wrong' }))).status, 401);
  assert.equal((await login.POST(request({ password: process.env.FAMILY_PASSWORD }, 'https://other.invalid'))).status, 403);
  assert.equal(jar.has('family_session'), false);
});
test('shared password unlocks name prompt, not booking access or admin', async () => {
  assert.equal((await login.POST(request({ password: process.env.FAMILY_PASSWORD }))).status, 200);
  assert.equal((await auth.session(false)).admin, false);
  assert.equal(await auth.session(), null);
  assert.equal((await bookings.POST(request({ action: 'create' }))).status, 401);
  assert.equal((await names.POST(request({ firstName: 'Pat', lastName: '' }))).status, 400);
  assert.equal((await names.POST(request({ firstName: 'Pat', lastName: 'Kent' }))).status, 200);
  assert.equal((await auth.session()).named, true);
});
test('admin requires admin password; rate limit is enforced', async () => {
  assert.equal((await login.POST(request({ password: process.env.FAMILY_PASSWORD, admin: true }))).status, 401);
  assert.equal((await login.POST(request({ password: process.env.ADMIN_PASSWORD, admin: true }))).status, 200);
  assert.equal((await auth.session(false)).admin, true);
  allowLogin = false;
  assert.equal((await login.POST(request({ password: process.env.FAMILY_PASSWORD }))).status, 429);
});
test('tampered cookies and old password versions are rejected', async () => {
  await auth.setSession({ id: 'person', named: true, admin: false, version: 1 });
  const cookie = jar.get('family_session');
  jar.set('family_session', cookie.slice(0, -2) + 'xx');
  assert.equal(await auth.session(), null);
  jar.set('family_session', cookie);
  config.version = 2;
  assert.equal(await auth.session(), null);
});
test('browser identity survives logout and cannot be forged', async () => {
  const id = await auth.visitorId();
  await login.DELETE(request({}));
  assert.equal(await auth.visitorId(), id);
  jar.set('family_visitor', 'someone-else.forged');
  assert.notEqual(await auth.visitorId(), 'someone-else');
});
test('guests cannot edit other bookings, delete bookings, or change the password', async () => {
  await auth.setSession({ id: 'person', named: true, admin: false, version: 1 });
  rows.bookings = { id: 1, visitor_id: 'other', status: 'active' };
  assert.equal((await bookings.POST(request({ action: 'cancel', bookingId: 1 }))).status, 403);
  assert.equal((await bookings.POST(request({ action: 'delete', bookingId: 1 }))).status, 403);
  assert.equal((await passwords.POST(request({ password: 'new-password' }))).status, 403);
  assert.equal(writes.length, 0);
});
test('name and owner are derived on the server when creating a booking', async () => {
  await auth.setSession({ id: 'person', named: true, admin: false, version: 1 });
  rows.visitors = { first_name: 'Pat', last_name: 'Kent' };
  const response = await bookings.POST(request({ action: 'create', house_id: 1, start_date: '2027-01-01', end_date: '2027-01-04', guest_count: 2, created_by: 'other', booked_by: 'Someone Else' }));
  assert.equal(response.status, 200);
  assert.equal(writes[0].values.visitor_id, 'person');
  assert.equal(writes[0].values.booked_by, 'Pat Kent');
});
test('date and guest validation covers invalid dates and seven-night limit', () => {
  const valid = { start_date: '2027-03-10', end_date: '2027-03-17', guest_count: 2 };
  assert.equal(bookingValues(valid).guest_count, 2);
  for (const bad of [{ end_date: '2027-03-18' }, { end_date: '2027-03-10' }, { start_date: '2027-02-30' }, { guest_count: 1.5 }, { guest_count: 0 }]) assert.throws(() => bookingValues({ ...valid, ...bad }));
});
test('password hash verifies only the matching password', () => {
  const hash = auth.passwordHash('a-family-password');
  assert.notEqual(hash, 'a-family-password');
  assert.equal(auth.checkPassword('a-family-password', hash), true);
  assert.equal(auth.checkPassword('wrong', hash), false);
});

test('admin can change family password and old sessions stop working', async () => {
  await auth.setSession({ id: 'guest', named: true, admin: false, version: 1 });
  const guestCookie = jar.get('family_session');
  await auth.setSession({ id: 'admin', named: true, admin: true, version: 1 });
  assert.equal((await passwords.POST(request({ password: 'replacement-password' }))).status, 200);
  assert.equal((await auth.session()).admin, true);
  jar.set('family_session', guestCookie);
  assert.equal(await auth.session(), null);
  assert.equal((await login.POST(request({ password: process.env.FAMILY_PASSWORD }))).status, 401);
  assert.equal((await login.POST(request({ password: 'replacement-password' }))).status, 200);
});
test('booking owner can cancel; admin can manage legacy bookings', async () => {
  await auth.setSession({ id: 'person', named: true, admin: false, version: 1 });
  rows.bookings = { id: 1, visitor_id: 'person', status: 'active' };
  assert.equal((await bookings.POST(request({ action: 'cancel', bookingId: 1 }))).status, 200);
  await auth.setSession({ id: 'admin', named: true, admin: true, version: 1 });
  rows.bookings = { id: 2, visitor_id: null, status: 'active' };
  assert.equal((await bookings.POST(request({ action: 'cancel', bookingId: 2 }))).status, 200);
});

test('personal PIN restores ownership without granting admin access and survives logout', async () => {
  await login.POST(request({password:process.env.FAMILY_PASSWORD}));
  rows.pinVisitor={id:'saved-visitor',pin_hash:auth.passwordHash('12345678')};
  assert.equal((await names.POST(request({firstName:'Pat',lastName:'Kent',recover:true,pin:'87654321'}))).status,400);
  assert.equal((await names.POST(request({firstName:'Pat',lastName:'Kent',recover:true,pin:'12345678'}))).status,200);
  assert.equal((await auth.session()).id,'saved-visitor');
  assert.equal((await auth.session()).admin,false);
  await login.DELETE(request({}));
  assert.equal(await auth.visitorId(),'saved-visitor');
});
test('PIN creation, replacement, rate limiting, and protected rules', async()=>{
  const pins=load('app/api/pin/route.ts'),rules=load('app/api/rules/route.ts');
  assert.equal((await pins.POST(request({pin:'123456'}))).status,401);
  await auth.setSession({id:'owner',admin:false,named:true,version:1});
  assert.equal((await pins.POST(request({pin:'123'}))).status,400);
  assert.equal((await pins.POST(request({pin:'123456'}))).status,200);
  assert.equal((await pins.POST(request({pin:'654321',currentPin:'000000'}))).status,400);
  assert.equal((await pins.POST(request({pin:'654321',currentPin:'123456'}))).status,200);
  assert.equal(auth.checkPassword('654321',rows.pinHash),true);
  assert.equal((await rules.POST(request({houseId:1,rules:'Quiet after 10'}))).status,403);
  await auth.setSession({id:'admin',admin:true,named:true,version:1});
  assert.equal((await rules.POST(request({houseId:1,rules:'Quiet after 10'}))).status,200);
  assert.equal((await rules.POST(request({houseId:1,rules:'x'.repeat(20001)}))).status,400);
  allowLogin=false;
  assert.equal((await pins.POST(request({pin:'123456'}))).status,429);
  assert.equal((await names.POST(request({firstName:'Pat',lastName:'Kent',recover:true,pin:'123456'}))).status,429);
});

test('optional guest names are trimmed, may be cleared, and reject invalid input',()=>{
  const base={start_date:'2027-01-01',end_date:'2027-01-03',guest_count:2};
  assert.equal(bookingValues(base).guest_names,null);
  assert.equal(bookingValues({...base,guest_names:' Alex, Jamie '}).guest_names,'Alex, Jamie');
  assert.equal(bookingValues({...base,guest_names:'  '}).guest_names,null);
  assert.throws(()=>bookingValues({...base,guest_names:42}));
  assert.throws(()=>bookingValues({...base,guest_names:'x'.repeat(2001)}));
});
test('usage API rejects non-admin sessions before reading occupancy',async()=>{
 const usage=load('app/api/usage/route.ts');
 const req={nextUrl:new URL('http://localhost/api/usage?month=2026-11')};
 assert.equal((await usage.GET(req)).status,403);
 await auth.setSession({id:'family',admin:false,named:true,version:1});
 assert.equal((await usage.GET(req)).status,403);
 await auth.setSession({id:'admin',admin:true,named:true,version:1});
 assert.equal((await usage.GET({nextUrl:new URL('http://localhost/api/usage?month=bad')})).status,400);
});
