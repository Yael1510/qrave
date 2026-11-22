// Loads the Fre&co menu (supabase/seed/fresco/menu.json + public/seed/fresco photos) into Supabase.
//
// 1. Sign up in the app with the owner's email (you can skip the "Set up your cafe" step).
// 2. node --env-file=.env.local scripts/seed-fresco.mjs owner@email.com [--tables 10] [--replace]
//
// Creates the cafe for that owner if they don't have one yet, sets the name, logo and colour,
// uploads all photos and adds the categories and items. --replace wipes an existing menu first.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const email = args.find(a => a.includes('@'))?.toLowerCase();
const replace = args.includes('--replace');
const tables = Number(args[args.indexOf('--tables') + 1]) || 10;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!email) exit('Usage: node --env-file=.env.local scripts/seed-fresco.mjs owner@email.com [--tables 10] [--replace]');
if (!url || !key || url.includes('example.supabase.co')) exit('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const menu = JSON.parse(fs.readFileSync(path.join(root, 'supabase/seed/fresco/menu.json'), 'utf8'));
const photoDir = path.join(root, 'public/seed/fresco');

function exit(msg) { console.error(`✗ ${msg}`); process.exit(1); }
const must = (res, what) => { if (res.error) exit(`${what}: ${res.error.message}`); return res.data; };

// --- find the owner ---
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) exit(`Listing users: ${error.message}`);
  user = data.users.find(u => u.email?.toLowerCase() === email);
  if (data.users.length < 1000) break;
}
if (!user) exit(`No account for ${email}. Sign up in the app first.`);

// --- find or create the cafe ---
const membership = must(await db.from('cafe_members').select('cafe_id, role').eq('user_id', user.id).maybeSingle(), 'Membership');
let cafeId = membership?.cafe_id;
if (membership && membership.role !== 'owner') exit(`${email} is a staff account, not an owner.`);
if (!cafeId) {
  const cafe = must(await db.from('cafes').insert({ name: menu.cafe.name, slug: menu.cafe.slug }).select().single(), 'Creating cafe');
  cafeId = cafe.id;
  must(await db.from('cafe_members').insert({ cafe_id: cafeId, user_id: user.id, role: 'owner', email }), 'Adding owner');
  must(await db.from('cafe_tables').insert(Array.from({ length: tables }, (_, i) => ({ cafe_id: cafeId, number: i + 1 }))), 'Adding tables');
  console.log(`✓ Created cafe /c/${menu.cafe.slug} with ${tables} tables`);
}

const { count, error: countError } = await db.from('items').select('id', { count: 'exact', head: true }).eq('cafe_id', cafeId);
if (countError) exit(`Checking menu: ${countError.message}`);
if (count && !replace) exit(`This cafe already has ${count} menu items. Re-run with --replace to wipe and reload them.`);
if (count) {
  must(await db.from('categories').delete().eq('cafe_id', cafeId), 'Clearing old menu');
  console.log(`✓ Removed ${count} old items`);
}

// --- photos ---
async function upload(file, folder) {
  const storagePath = `${cafeId}/${folder}/${file}`;
  const body = fs.readFileSync(path.join(photoDir, file));
  must(await db.storage.from('cafe-media').upload(storagePath, body, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' }), `Uploading ${file}`);
  return db.storage.from('cafe-media').getPublicUrl(storagePath).data.publicUrl;
}

const logoUrl = await upload(menu.cafe.logo, 'branding');
must(await db.from('cafes').update({
  name: menu.cafe.name, tagline: menu.cafe.tagline, primary_color: menu.cafe.primary_color, logo_url: logoUrl,
}).eq('id', cafeId), 'Updating branding');
console.log('✓ Name, logo and colour set');

// --- menu ---
let photos = 0, items = 0;
for (const [ci, c] of menu.categories.entries()) {
  const cat = must(await db.from('categories').insert({ cafe_id: cafeId, name: c.name, name_fil: c.name_fil, position: ci, layout: c.layout ?? 'list' }).select().single(), `Category ${c.name}`);
  const rows = [];
  for (const [ii, it] of c.items.entries()) {
    const photo_url = it.photo ? await upload(it.photo, 'items') : null;
    if (photo_url) photos++;
    rows.push({
      cafe_id: cafeId, category_id: cat.id, position: ii, name: it.name, name_fil: it.name_fil ?? null,
      description: it.description, description_fil: it.description_fil ?? null, price: it.price,
      photo_url, badge: it.badge ?? null, prep_minutes: it.prep_minutes ?? null, calories: it.calories ?? null, tags: it.tags ?? [], options: it.options ?? [], available: true,
    });
  }
  must(await db.from('items').insert(rows), `Items in ${c.name}`);
  items += rows.length;
  process.stdout.write(`  ${c.name}: ${rows.length}\n`);
}
console.log(`✓ ${menu.categories.length} categories, ${items} items, ${photos} photos`);
console.log(`\nDone. Customer menu: /c/${menu.cafe.slug}  ·  Print QR codes from Tables & QR in the dashboard.`);
