// Asks for the three Supabase values, checks them, and writes .env.local.
// Usage: npm run setup
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { stdin, stdout } from 'node:process';

const file = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '.env.local');
const rl = readline.createInterface({ input: stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
async function question(q) {
  stdout.write(q);
  const { value, done } = await lines.next();
  if (done) { console.log('\nCancelled — nothing was saved.'); process.exit(1); }
  return value;
}

const steps = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL',
    ask: '1/3  Paste your Project URL (looks like https://abcd1234.supabase.co)',
    clean: v => v.replace(/\/+$/, '').replace(/\/rest\/v1$/, ''),
    check: v => (/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(v) ? null : 'That doesn’t look like a Project URL. It should be https://<something>.supabase.co'),
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ask: '2/3  Paste your Publishable key (starts with sb_publishable_) — or the older "anon public" key',
    check: v => (v.startsWith('sb_secret_') ? 'That’s the SECRET key. Paste the Publishable one here.'
      : v.startsWith('sb_publishable_') || v.startsWith('eyJ') ? null : 'That doesn’t look like a publishable/anon key.'),
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    ask: '3/3  Paste your Secret key (starts with sb_secret_ — click Reveal first) — or the older "service_role" key',
    check: (v, vals) => (v.startsWith('sb_publishable_') ? 'That’s the PUBLISHABLE key. Paste the Secret one here.'
      : v === vals.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'That’s the same as the publishable key. Paste the Secret one.'
      : v.startsWith('sb_secret_') || v.startsWith('eyJ') ? null : 'That doesn’t look like a secret/service_role key.'),
  },
];

console.log('\nQRave setup — copy each value from Supabase → Project Settings → API Keys\n');
const values = {};
for (const s of steps) {
  for (;;) {
    let v = (await question(`${s.ask}\n> `)).trim().replace(/^["']|["']$/g, '');
    if (s.clean) v = s.clean(v);
    const problem = s.check(v, values);
    if (!problem) { values[s.key] = v; console.log('   ✓ looks good\n'); break; }
    console.log(`   ✗ ${problem} Try again.\n`);
  }
}
rl.close();

// Keep any existing site URL.
let siteUrl = '';
try { siteUrl = fs.readFileSync(file, 'utf8').match(/^NEXT_PUBLIC_SITE_URL=(.*)$/m)?.[1] ?? ''; } catch {}

fs.writeFileSync(file, `# Written by npm run setup. Never commit this file.
NEXT_PUBLIC_SUPABASE_URL=${values.NEXT_PUBLIC_SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${values.NEXT_PUBLIC_SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${values.SUPABASE_SERVICE_ROLE_KEY}
NEXT_PUBLIC_SITE_URL=${siteUrl}
`, { mode: 0o600 });

// Quick connection test with the publishable key.
try {
  const res = await fetch(`${values.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/cafes?select=id&limit=1`, {
    headers: { apikey: values.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${values.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  if (res.ok) console.log('✓ Connected to Supabase and found the QRave tables.');
  else if (res.status === 404 || (await res.text()).includes('cafes')) console.log('⚠ Connected, but the tables aren’t there yet. Run the SQL from Step 2, then you’re set.');
  else console.log(`⚠ Supabase answered with an error (${res.status}). Double-check the URL and publishable key.`);
} catch {
  console.log('⚠ Couldn’t reach Supabase. Check the Project URL and your internet connection.');
}
console.log('\nSaved to .env.local. Tell Claude “keys are in”.\n');
