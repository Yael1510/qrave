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
const after = await as(null, async () => (await q(`select table_status('kape-uno',$1,$2) s`, [token, st.session.id]))[0].s);
const stranger = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(stranger.session === null && stranger.orders.length === 0, 'next customer at the table sees a clean menu after payment');
ok(after.session.status === 'paid' && after.requests.length === 0, 'closing tab marks paid and clears requests');
const order3 = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [token, JSON.stringify([{ item_id: latte, qty: 1 }])]))[0].r);
const st3 = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(order3.number === 3 && st3.orders.length === 1 && st3.session.status === 'open', 'next order after payment starts a fresh tab');

// --- moving a tab to another table (0004) ---
const tok = async n => (await q(`select id, token from cafe_tables where cafe_id = $1 and number = $2`, [cafeA, n]))[0];
const T4 = await tok(4), T5 = await tok(5);
const tB = (await q(`select id from cafe_tables where cafe_id = $1 limit 1`, [cafeB]))[0].id;
const mine = st3.session.id; // the phone that ordered at table 2
await as(null, () => throws(() => q(`select move_session($1,$2)`, [mine, T4.id]), 'permission denied', 'customers cannot move tabs'));
await as(B, () => throws(() => q(`select move_session($1,$2)`, [mine, T4.id]), 'Not allowed', 'other cafe cannot move tab'));
await as(S, () => throws(() => q(`select move_session($1,$2)`, [mine, tB]), 'BAD_TABLE', 'cannot move to another cafe\'s table'));
await as(S, () => throws(() => q(`select move_session($1,$2)`, [mine, t2]), 'SAME_TABLE', 'cannot move to the same table'));
await as(null, () => q(`select request_service('kape-uno',$1,'waiter')`, [token]));
const mv = await as(S, async () => (await q(`select move_session($1,$2) r`, [mine, T4.id]))[0].r);
ok(mv.merged === false && mv.table_number === 4, 'staff moved the tab to free table 4');
const at4 = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [T4.token]))[0].s);
ok(at4.orders.length === 1 && at4.session.id === mine && at4.requests.some(r => r.kind === 'waiter'), 'table 4 shows the moved order and waiter request');
ok((await q(`select count(*)::int n from orders where session_id = $1 and table_id <> $2`, [mine, T4.id]))[0].n === 0, 'moved orders point at table 4 for the kitchen');
const oldPhone = await as(null, async () => (await q(`select table_status('kape-uno',$1,$2) s`, [token, mine]))[0].s);
ok(oldPhone.session === null && oldPhone.moved_to?.number === 4, 'old table page tells the phone its tab moved to table 4');
const nextGuest = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [token]))[0].s);
ok(nextGuest.session === null && !nextGuest.moved_to && nextGuest.requests.length === 0, 'next guest at table 2 starts clean');

const o5 = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [T5.token, JSON.stringify([{ item_id: latte, qty: 1 }])]))[0].r);
const s5 = (await q(`select session_id from orders where id = $1`, [o5.order_id]))[0].session_id;
await as(null, () => q(`select request_service('kape-uno',$1,'waiter')`, [T5.token]));
const mg = await as(S, async () => (await q(`select move_session($1,$2) r`, [mine, T5.id]))[0].r);
ok(mg.merged === true && mg.session === s5, 'moving onto a table with an open tab combines them');
const at5 = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [T5.token]))[0].s);
ok(at5.orders.length === 2 && at5.requests.filter(r => r.kind === 'waiter').length === 1, 'table 5 has one bill with both orders and no duplicate request');
const phoneAt4 = await as(null, async () => (await q(`select table_status('kape-uno',$1,$2) s`, [T4.token, mine]))[0].s);
ok(phoneAt4.session === null && phoneAt4.moved_to?.number === 5, 'combined tab: phone is told to go to table 5');
await as(S, () => throws(() => q(`select move_session($1,$2)`, [mine, T4.id]), 'TAB_CLOSED', 'a combined tab cannot be moved again'));
await as(S, () => q(`select close_session($1)`, [s5]));
const paidPhone = await as(null, async () => (await q(`select table_status('kape-uno',$1,$2) s`, [T4.token, mine]))[0].s);
ok(!paidPhone.moved_to, 'after the combined tab is paid, the old page stops pointing to it');

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

// --- stations (0005): drinks to the bar, food to the kitchen ---
const { pastry, croissant } = await as(A, async () => {
  await q(`update categories set station = 'bar' where id = $1`, [cat]);
  const pastry = (await q(`insert into categories (cafe_id,name) values ($1,'Pastries') returning id, station`, [cafeA]))[0];
  const croissant = (await q(`insert into items (cafe_id,category_id,name,price) values ($1,$2,'Croissant',95) returning id`, [cafeA, pastry.id]))[0].id;
  return { pastry, croissant };
});
ok(pastry.station === 'kitchen', 'new categories go to the kitchen by default');
await as(A, () => throws(() => q(`update categories set station = 'patio' where id = $1`, [cat]), 'check', 'invalid station rejected'));
const tok3 = (await q(`select token from cafe_tables where cafe_id = $1 and number = 3`, [cafeA]))[0].token;
const so = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [tok3,
  JSON.stringify([{ item_id: latte, qty: 1 }, { item_id: croissant, qty: 1 }])]))[0].r);
const lines = async () => Object.fromEntries((await q(`select name, station, status from order_items where order_id = $1`, [so.order_id])).map(r => [r.name, r]));
const ordStatus = async () => (await q(`select status from orders where id = $1`, [so.order_id]))[0].status;
let L = await lines();
ok(L.Latte.station === 'bar' && L.Croissant.station === 'kitchen' && L.Latte.status === 'new', 'order lines copy their category station');
await as(null, () => throws(() => q(`select set_station_status($1,'bar','ready')`, [so.order_id]), 'permission denied', 'customers cannot change station status'));
await as(B, () => throws(() => q(`select set_station_status($1,'bar','ready')`, [so.order_id]), 'Not allowed', 'other cafe cannot change station status'));
await as(S, () => q(`select set_station_status($1,'bar','preparing')`, [so.order_id]));
L = await lines();
ok(L.Latte.status === 'preparing' && L.Croissant.status === 'new' && (await ordStatus()) === 'preparing', 'bar starts: only the latte moves, order is preparing');
await as(S, () => q(`select set_station_status($1,'bar','ready')`, [so.order_id]));
ok((await lines()).Latte.status === 'ready' && (await ordStatus()) === 'preparing', 'drinks ready, food not started: order still preparing');
const phone = await as(null, async () => (await q(`select table_status('kape-uno',$1) s`, [tok3]))[0].s);
ok(phone.orders[0].items.some(i => i.station === 'bar' && i.status === 'ready'), 'customer status includes each line\'s station and status');
await as(S, () => q(`select set_station_status($1,'kitchen','ready')`, [so.order_id]));
ok((await lines()).Croissant.status === 'ready' && (await ordStatus()) === 'ready', 'order is ready only once both stations are ready');
await as(S, () => q(`update orders set status = 'served' where id = $1`, [so.order_id]));
await as(S, () => throws(() => q(`select set_station_status($1,'bar','preparing')`, [so.order_id]), 'ORDER_CLOSED', 'served order cannot be moved back'));
const so2 = await as(null, async () => (await q(`select place_order('kape-uno',$1,$2) r`, [tok3,
  JSON.stringify([{ item_id: latte, qty: 1 }, { item_id: croissant, qty: 1 }])]))[0].r);
await as(S, () => q(`update orders set status = 'ready' where id = $1`, [so2.order_id]));
ok((await q(`select bool_and(status = 'ready') r from order_items where order_id = $1`, [so2.order_id]))[0].r, 'setting a whole order ready directly also readies its lines');

// --- plans (0006): free 7-day trial, then monthly or a one-time build ---
const asQRave = async fn => { await db.exec(`reset role; set role service_role;`); try { return await fn(); } finally { await db.exec('reset role;'); } };
const planA = (await q(`select plan, extract(epoch from trial_ends_at - now()) / 86400 days from cafes where id = $1`, [cafeA]))[0];
ok(planA.plan === 'trial' && planA.days > 6.9 && planA.days <= 7, 'new cafes start on a 7-day free trial');
await as(A, () => throws(() => q(`update cafes set plan = 'comp' where id = $1`, [cafeA]), 'Only QRave', 'owner cannot change their own plan'));
await as(A, () => throws(() => q(`update cafes set trial_ends_at = now() + interval '1 year' where id = $1`, [cafeA]), 'Only QRave', 'owner cannot extend their own trial'));
await as(A, () => throws(() => q(`update cafes set status = 'suspended' where id = $1`, [cafeA]), 'Only QRave', 'owner cannot change their status'));
await as(A, async () => ok((await q(`update cafes set tagline = 'Hello' where id = $1 returning id`, [cafeA])).length === 1, 'owner can still edit their cafe details'));
const anonSees = async () => as(null, async () => ({
  cafe: (await q(`select id from cafes where id = $1`, [cafeA])).length,
  items: (await q(`select id from items where cafe_id = $1`, [cafeA])).length,
  table: (await q(`select * from resolve_table('kape-uno', $1)`, [token])).length,
  closed: (await q(`select cafe_closed('kape-uno') c`))[0].c,
}));
let seen = await anonSees();
ok(seen.cafe === 1 && seen.items > 0 && seen.table === 1 && !seen.closed, 'during the trial customers can open the menu');
await asQRave(() => q(`update cafes set trial_ends_at = now() - interval '1 minute' where id = $1`, [cafeA]));
seen = await anonSees();
ok(seen.cafe === 0 && seen.items === 0 && seen.table === 0 && seen.closed, 'after the trial the menu and table link are closed to customers');
await as(null, () => throws(() => q(`select place_order('kape-uno',$1,$2)`, [token, JSON.stringify([{ item_id: latte, qty: 1 }])]), '', 'customers cannot order once the trial is over'));
await as(A, async () => ok((await q(`select id from cafes where id = $1`, [cafeA])).length === 1 && (await q(`select id from items where cafe_id = $1`, [cafeA])).length > 0, 'owner can still sign in and see their cafe after the trial'));
ok((await as(null, async () => (await q(`select id from cafes where id = $1`, [cafeB])).length)) === 1, 'other cafes are not affected');
await asQRave(() => q(`update cafes set plan = 'monthly', paid_until = now() + interval '1 month' where id = $1`, [cafeA]));
ok((await anonSees()).table === 1, 'a paid month reopens the cafe');
await asQRave(() => q(`update cafes set paid_until = now() - interval '1 day' where id = $1`, [cafeA]));
ok((await anonSees()).table === 0, 'an unpaid month closes it again');
await asQRave(() => q(`update cafes set plan = 'monthly', paid_until = null, trial_ends_at = now() + interval '2 days' where id = $1`, [cafeA]));
ok((await anonSees()).table === 1, 'switching to monthly before the first payment keeps the trial days');
await asQRave(() => q(`update cafes set plan = 'one_time', paid_until = null, trial_ends_at = now() - interval '9 days' where id = $1`, [cafeA]));
ok((await anonSees()).table === 1, 'a one-time build never expires');
await asQRave(() => q(`update cafes set status = 'suspended' where id = $1`, [cafeA]));
ok((await anonSees()).closed, 'a suspended cafe is closed whatever its plan');
await asQRave(() => q(`update cafes set status = 'active' where id = $1`, [cafeA]));
ok(!(await q(`select cafe_closed('no-such-cafe') c`))[0].c, 'an unknown link is not reported as a paused cafe');

// --- sales reports (0007) ---
{
  const tz = await q(`select id, total from orders where cafe_id = $1 and status <> 'cancelled' order by created_at limit 1`, [cafeA]);
  // One order placed at 23:30 Manila time on Nov 20 (15:30 UTC): it belongs to Nov 20, hour 23, not Nov 20 UTC hour 15.
  await q(`update orders set created_at = '2026-11-20 15:30:00+00' where id = $1`, [tz[0].id]);
  const range = ['2026-11-19 16:00:00+00', '2026-11-21 16:00:00+00']; // Nov 20 and 21, Manila
  const rep = await as(A, async () => (await q(`select sales_report($1,$2,$3) r`, [cafeA, ...range]))[0].r);
  ok(rep.days.length === 2 && rep.days[0].day === '2026-11-20', 'report has one row per Philippine day in the range');
  ok(Number(rep.days[0].sales) === Number(tz[0].total) && rep.days[0].orders === 1, 'a late-night order counts on its Philippine date');
  ok(rep.hours.length === 24 && rep.hours[23].orders === 1 && rep.hours[15].orders === 0, 'busy hours use Philippine time');

  const all = ['2000-01-01 00:00:00+00', '2100-01-01 00:00:00+00'];
  await throws(() => as(A, () => q(`select sales_report($1,$2,$3)`, [cafeA, ...all])), 'BAD_RANGE', 'a huge date range is rejected');
  const from = new Date(Date.now() - 300 * 86400000).toISOString(), to = new Date(Date.now() + 86400000).toISOString();
  const full = await as(A, async () => (await q(`select sales_report($1,$2,$3) r`, [cafeA, from, to]))[0].r);
  const want = (await q(`select coalesce(sum(total),0) s, count(*) n from orders where cafe_id = $1 and status <> 'cancelled'`, [cafeA]))[0];
  ok(Number(full.sales) === Number(want.s) && full.orders === Number(want.n), 'total sales and orders match, cancelled orders left out');
  const lineSum = full.best.reduce((s, b) => s + Number(b.sales), 0);
  ok(full.best[0].name === 'Latte' && full.best.every((b, i) => i === 0 || Number(full.best[i - 1].qty) >= Number(b.qty)), 'best sellers are ranked by quantity');
  ok(Math.abs(lineSum - Number(full.sales)) < 0.01, 'best-seller sales add up to total sales (with add-ons)');
  ok(full.stations.some(s => s.station === 'bar') && full.stations.some(s => s.station === 'kitchen'), 'report splits bar and kitchen');
  await throws(() => as(S, () => q(`select sales_report($1,$2,$3)`, [cafeA, from, to])), 'Not allowed', 'staff cannot open sales reports');
  await throws(() => as(B, () => q(`select sales_report($1,$2,$3)`, [cafeA, from, to])), 'Not allowed', 'other owners cannot see cafe A sales');
  await throws(() => as(null, () => q(`select sales_report($1,$2,$3)`, [cafeA, from, to])), 'permission denied', 'customers cannot see sales');
}

{
  // Previous-period comparison stops at the same elapsed time.
  const t0 = new Date(Date.now() - 3600e3).toISOString(), t1 = new Date(Date.now() + 23 * 3600e3).toISOString();
  const o = (await q(`select id from orders where cafe_id = $1 and status <> 'cancelled' order by created_at desc limit 2`, [cafeA])).map(r => r.id);
  await q(`update orders set created_at = now() - interval '24 hours 30 minutes' where id = $1`, [o[0]]); // yesterday, before this time of day
  await q(`update orders set created_at = now() - interval '22 hours' where id = $1`, [o[1]]);            // yesterday, later in the day
  const rr = await as(A, async () => (await q(`select sales_report($1,$2,$3) r`, [cafeA, t0, t1]))[0].r);
  ok(rr.prev_orders === 1, 'today is compared with yesterday up to the same time, not the whole day');
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll database checks passed');
process.exit(failures ? 1 : 0);
