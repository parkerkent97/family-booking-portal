import { neon } from '@neondatabase/serverless';
let ready: Promise<void> | undefined;
function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Connect the Neon database in Vercel first.');
  return neon(url);
}
// The new, dedicated database initializes itself; no SQL dashboard is needed.
const schema = [
  `SELECT pg_advisory_xact_lock(67281403)`,
  `CREATE TABLE IF NOT EXISTS houses (id integer PRIMARY KEY, name text NOT NULL, rules text NOT NULL DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS visitors (id uuid PRIMARY KEY, first_name text NOT NULL, last_name text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS site_settings (id integer PRIMARY KEY CHECK(id=1), password_hash text, version integer NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS bookings (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, house_id integer NOT NULL REFERENCES houses(id), visitor_id uuid NOT NULL REFERENCES visitors(id), booked_by text NOT NULL, guest_count integer NOT NULL CHECK(guest_count>0), start_date date NOT NULL, end_date date NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), note text, cancelled_at timestamptz, CHECK(end_date>start_date AND end_date-start_date<=7))`,
  `CREATE INDEX IF NOT EXISTS bookings_active_house ON bookings(house_id,start_date) WHERE status='active'`,
  `INSERT INTO houses(id,name) VALUES(1,'Bay Ave'),(2,'Bear Ln') ON CONFLICT DO NOTHING`,
  `INSERT INTO site_settings(id) VALUES(1) ON CONFLICT DO NOTHING`,
];
export async function query(text: string, values: unknown[] = []) {
  const sql = client();
  if (!ready) ready = sql.transaction(schema.map(s => sql.query(s))).then(() => {}).catch(e => { ready = undefined; throw e; });
  await ready;
  return sql.query(text, values);
}
