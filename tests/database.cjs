const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const path = require('node:path');
test('fresh Postgres initializes once, keeps bookings, validates constraints, and shares login limits', async () => {
  const pg = new PGlite();
  process.env.DATABASE_URL = 'postgres://test';
  const sql = {
    query: (text, values = []) => ({ text, values }),
    transaction: async statements => { await pg.transaction(async tx => { for (const s of statements) await tx.query(s.text,s.values); }); }
  };
  // Neon query objects are lazy promises; emulate that against a real Postgres engine.
  sql.query = (text, values = []) => ({ text, values, then: (resolve,reject) => pg.query(text,values).then(r=>r.rows).then(resolve,reject) });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file,exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    vm.runInThisContext('(function(require,module,exports){'+code+'\n})')((name)=>{
      if(name==='@neondatabase/serverless') return {neon:()=>sql};
      if(name==='@/lib/database') return load('lib/database.ts');
      if(name==='next/headers') return { cookies: async()=>({get:()=>undefined}) };
      return require(name);
    },{exports},exports);
    return exports;
  }
  try {
    const {query}=load('lib/database.ts');
    assert.equal((await query('SELECT * FROM houses')).length,2);
    assert.equal((await query('SELECT * FROM bookings')).length,0);
    const id='00000000-0000-4000-8000-000000000001';
    await query('INSERT INTO visitors VALUES($1,$2,$3)',[id,'Pat','Kent']);
    await query('UPDATE visitors SET pin_hash=$2 WHERE id=$1',[id,'test-hash']);
    await assert.rejects(query('INSERT INTO visitors(id,first_name,last_name,pin_hash) VALUES($1,$2,$3,$4)',['00000000-0000-4000-8000-000000000002','pat','KENT','other-hash']));
    const create=`INSERT INTO bookings(house_id,visitor_id,booked_by,guest_count,start_date,end_date,note) SELECT h.id,v.id,v.first_name || ' ' || v.last_name,$3,$4::date,$5::date,$6 FROM visitors v JOIN houses h ON h.id=$1 WHERE v.id=$2 RETURNING id`;
    const created=await query(create,[1,id,2,'2027-01-01','2027-01-04',null]);
    assert.equal(created.length,1);
    assert.equal((await query('SELECT booked_by FROM bookings'))[0].booked_by,'Pat Kent');
    await assert.rejects(query(create,[1,id,2,'2027-01-01','2027-01-10',null]));
    cache.clear();
    assert.equal((await load('lib/database.ts').query('SELECT * FROM bookings')).length,1,'cold start must not clear bookings');
    process.env.SESSION_SECRET='test-session-secret-at-least-32-characters';
    const {rateLimit}=load('lib/server.ts');
    const req=new Request('https://test.invalid',{headers:{'x-vercel-forwarded-for':'192.0.2.1'}});
    for(let i=0;i<15;i++) assert.equal(await rateLimit(req),true);
    assert.equal(await rateLimit(req),false);
  } finally { await pg.close(); }
});
