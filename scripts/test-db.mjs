// Runs the Supabase migration in an embedded Postgres (PGlite) with stand-ins for
// Supabase's auth/storage schemas, then checks ordering logic and cafe isolation.
// Usage: node scripts/test-db.mjs
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) failures++; };
const throws = async (fn, match, msg) => {
  try { await fn(); ok(false, `${msg} (expected error)`); }
  catch (e) { ok(!match || e.message.includes(match), `${msg} → ${e.message}`); }
};

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
  alter table storage.objects enable row level security;
`);
const migDir = new URL('../supabase/migrations/', import.meta.url);
for (const f of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(new URL(f, migDir), 'utf8'));
await db.exec(`
  grant usage on schema auth, storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
ok(true, 'migration applied');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const S = '00000000-0000-0000-0000-00000000000c'; // staff of cafe A
await db.exec(`insert into auth.users values ('${A}','a@x.test'),('${B}','b@x.test'),('${S}','s@x.test')`);

async function as(user, fn) {
  await db.exec(`reset role; set request.jwt.claim.sub = '${user || ''}'; set role ${user ? 'authenticated' : 'anon'};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;

// --- sign-up ---
const cafeA = await as(A, async () => (await q(`select create_cafe('Kape Uno','kape-uno',5) id`))[0].id);
const cafeB = await as(B, async () => (await q(`select create_cafe('Brew Two','brew-two',3) id`))[0].id);
ok(cafeA && cafeB, 'two owners created cafes');
await as(A, () => throws(() => q(`select create_cafe('Again','again-cafe',2)`), 'already have', 'owner cannot create a second cafe'));
const D = '00000000-0000-0000-0000-00000000000d';
await db.exec(`insert into auth.users values ('${D}','d@x.test')`);
await as(D, () => throws(() => q(`select create_cafe('Dup','kape-uno',2)`), 'already taken', 'duplicate cafe link rejected'));
await db.exec(`insert into cafe_members (cafe_id,user_id,role) values ('${cafeA}','${S}','staff')`);

// --- menu (owner A) ---
const { cat, latte, cake } = await as(A, async () => {
  const cat = (await q(`insert into categories (cafe_id,name) values ($1,'Coffee') returning id`, [cafeA]))[0].id;
  const latte = (await q(`insert into items (cafe_id,category_id,name,price,options,tags) values ($1,$2,'Latte',150,
    '[{"name":"Oat milk","price":30},{"name":"Iced","price":0}]','{vegetarian}') returning id`, [cafeA, cat]))[0].id;
  const cake = (await q(`insert into items (cafe_id,category_id,name,price,available) values ($1,$2,'Cake',120,false) returning id`, [cafeA, cat]))[0].id;
  return { cat, latte, cake };
});
ok(latte, 'owner added menu items');
await as(B, () => throws(() => q(`insert into items (cafe_id,category_id,name,price) values ($1,$2,'Hack',1)`, [cafeA, cat]), 'row-level security', 'other owner cannot add to cafe A menu'));
await as(S, () => throws(() => q(`insert into items (cafe_id,category_id,name,price) values ($1,$2,'X',1)`, [cafeA, cat]), 'row-level security', 'staff cannot edit menu'));
const updatedByB = await as(B, () => q(`update items set price = 1 where id = $1 returning id`, [latte]));
ok(updatedByB.length === 0, 'other owner cannot change cafe A prices');

// --- anonymous customer ---
const menu = await as(null, () => q(`select name from items where cafe_id = $1`, [cafeA]));
ok(menu.length === 2, 'anonymous customer can read the menu');
const tokensAnon = await as(null, () => q(`select token from cafe_tables`).catch(e => (e.message.includes('permission denied') ? [] : Promise.reject(e))));
ok(tokensAnon.length === 0, 'anonymous customer cannot read table tokens');
const token = (await q(`select token from cafe_tables where cafe_id = $1 and number = 2`, [cafeA]))[0].token;

const order = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2,'less ice') r`, [token,
  JSON.stringify([{ item_id: latte, qty: 2, options: ['Oat milk', 'Gold flakes'], price: 1 }])]))[0].r);
ok(order.number === 1 && Number(order.total) === 360, `order priced from menu incl. option: total ${order.total} (expect 360)`);
await as(null, () => throws(() => q(`select place_order('kape-uno','wrong-token',$1)`, [JSON.stringify([{ item_id: latte, qty: 1 }])]), 'INVALID_TABLE', 'bad table token rejected'));
await as(null, () => throws(() => q(`select place_order('brew-two',$1,$2)`, [token, JSON.stringify([{ item_id: latte, qty: 1 }])]), 'INVALID_TABLE', 'token from another cafe rejected'));
await as(null, () => throws(() => q(`select place_order('kape-uno',$1,$2)`, [token, JSON.stringify([{ item_id: cake, qty: 1 }])]), 'ITEM_UNAVAILABLE', 'sold-out item rejected'));
await as(null, () => throws(() => q(`select place_order('kape-uno',$1,'[]')`, [token]), 'EMPTY_ORDER', 'empty order rejected'));
const t2 = (await q(`select id from cafe_tables where token = $1`, [token]))[0].id;
await as(null, () => throws(() => q(`insert into orders (cafe_id,table_id,session_id,number,total) values ($1,$2,$2,99,0)`, [cafeA, t2]), 'permission denied', 'anonymous cannot insert orders directly'));

const order2 = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [token, JSON.stringify([{ item_id: latte, qty: 1 }])]))[0].r);
ok(order2.number === 2, 'order numbers increment per cafe');
const st = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(st.orders.length === 2 && st.session.status === 'open', 'second order joins the same open tab');

await as(null, () => q(`select request_service('kape-uno',$1,'bill')`, [token]));
await as(null, () => q(`select request_service('kape-uno',$1,'bill')`, [token]));
ok((await q(`select count(*)::int n from service_requests`))[0].n === 1, 'duplicate bill request ignored');

// --- staff ---
const staffSees = await as(S, () => q(`select id from orders`));
ok(staffSees.length === 2, 'staff of cafe A sees its orders');
const bSees = await as(B, () => q(`select id from orders`));
ok(bSees.length === 0, 'owner of cafe B sees none of cafe A orders');
await as(S, () => q(`update orders set status = 'preparing' where id = $1`, [order.order_id]));
ok((await q(`select status from orders where id = $1`, [order.order_id]))[0].status === 'preparing', 'staff updated order status');
await as(S, () => q(`select set_item_available($1, true)`, [cake]));
ok((await q(`select available from items where id = $1`, [cake]))[0].available === true, 'staff can mark items back in stock');
await as(B, () => throws(() => q(`select set_item_available($1, false)`, [cake]), 'Not allowed', 'other cafe cannot toggle stock'));
await as(B, () => throws(() => q(`select close_session($1)`, [st.session.id]), 'Not allowed', 'other cafe cannot close tab'));
await as(S, () => q(`select close_session($1)`, [st.session.id]));
const after = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(after.session.status === 'paid' && after.requests.length === 0, 'closing tab marks paid and clears requests');
const order3 = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [token, JSON.stringify([{ item_id: latte, qty: 1 }])]))[0].r);
const st3 = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(order3.number === 3 && st3.orders.length === 1 && st3.session.status === 'open', 'next order after payment starts a fresh tab');

// --- storage policy ---
await as(A, () => q(`insert into storage.objects (bucket_id,name) values ('cafe-media',$1)`, [`${cafeA}/latte.jpg`]));
ok(true, 'owner can upload into own cafe folder');
await as(B, () => throws(() => q(`insert into storage.objects (bucket_id,name) values ('cafe-media',$1)`, [`${cafeA}/x.jpg`]), 'row-level security', 'other owner cannot upload into cafe A folder'));

// --- menu details (0002) ---
await as(A, () => q(`update items set badge = 'Best Seller', prep_minutes = 15, calories = 250 where id = $1`, [latte]));
await as(A, () => q(`update categories set layout = 'grid' where id = $1`, [cat]));
await as(A, () => q(`update cafes set links = '{"instagram":"https://instagram.com/x"}' where id = $1`, [cafeA]));
const det = await as(null, async () => (await q(`select i.badge, i.prep_minutes, i.calories, c.layout from items i join categories c on c.id = i.category_id where i.id = $1`, [latte]))[0]);
ok(det.badge === 'Best Seller' && det.prep_minutes === 15 && det.calories === 250 && det.layout === 'grid', 'menu details readable by customers');
await as(A, () => throws(() => q(`update categories set layout = 'carousel' where id = $1`, [cat]), 'check', 'invalid layout rejected'));
await as(B, async () => ok((await q(`update cafes set links = '{}' where id = $1 returning id`, [cafeA])).length === 0, 'other owner cannot change cafe A links'));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);
