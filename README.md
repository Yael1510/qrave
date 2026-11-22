# QRave

QR table ordering for cafes, built to sell to many cafes. Each cafe signs up, builds its menu, prints table QR codes, and gets a live order screen. Customers scan, browse (English or Filipino), and order from their table. They pay at the counter.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, Realtime) · Tailwind · deploy on Vercel.

## MVP features

| For | What |
|---|---|
| Cafe owners | Self sign-up, cafe setup, menu editor (categories, photos, ₱ prices, options with add-on prices, diet/allergen tags, Filipino names), sold-out switch, tables & printable QR codes, branding (logo, colour, tagline), staff accounts |
| Staff | Live order board (New → Preparing → Ready → Served) with sound, waiter/bill alerts, open tabs with totals, “Mark paid & close tab”, sold-out switch |
| Customers | Branded menu, EN/FIL toggle, diet filters, photos, options, cart, notes, running table tab with live status, “Call waiter” and “Ask for bill” |

## Set up

### 1. Create a Supabase project
1. Sign up at [supabase.com](https://supabase.com) and create a project. Choose the **Southeast Asia (Singapore)** region for speed in the Philippines.
2. Open **SQL Editor**, paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**.
3. Go to **Authentication → URL Configuration** and set **Site URL** to your app address (`http://localhost:3000` while testing). Add `http://localhost:3000/auth/callback` (and later your live `/auth/callback`) under **Redirect URLs**.
4. Optional, for faster testing: **Authentication → Sign In / Providers → Email** and turn off **Confirm email**. Turn it back on before launch.

### 2. Add your keys
Copy the values from **Project Settings → API** into `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # anon / publishable key
SUPABASE_SERVICE_ROLE_KEY=...            # service_role / secret key (server only, needed to add staff)
NEXT_PUBLIC_SITE_URL=                    # your live address, used in QR codes (blank = current address)
```

Never commit `.env.local`. It's already git-ignored.

### 3. Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Sign up, create your cafe, add a category and some items, then open **Tables & QR** and click **Open** on a table to see the customer menu.

## Deploy (Vercel)
1. Push this folder to a GitHub repository and import it in [Vercel](https://vercel.com).
2. Add the same four environment variables in Vercel. Set `NEXT_PUBLIC_SITE_URL` to your domain, e.g. `https://qrave.ph`.
3. In Supabase, update **Site URL** and **Redirect URLs** to the live domain.
4. Print QR codes from the live site so they contain the live address.

## How it's secured
- **Row-level security** on every table: a cafe's owners and staff only ever see their own cafe's data. Staff can't edit the menu, tables or settings.
- Customers are anonymous. They can read the public menu but can only place orders through database functions that check the table's secret QR token and **compute prices from the menu**, never from the phone.
- Each QR code holds a random token, so nobody can send orders to a table by guessing its number. Owners can regenerate a table's code.
- Orders are rate-limited per table. Photos upload only into the owner's own cafe folder.

## Tests
`node scripts/test-db.mjs` runs the migration in an embedded Postgres and checks ordering, pricing, tabs and cross-cafe isolation, including moving a tab to another table and bar/kitchen stations (58 checks).

## Next phase
- PayMongo monthly subscriptions with a free trial (GCash, Maya, cards)
- Sales reports (daily/weekly sales, best sellers, busy hours)
- Super-admin page to manage all cafes

## Continue on another computer
Your keys are not in git (on purpose), so a fresh clone needs them again:

```bash
git clone <this repository's URL> qrave
cd qrave
npm install
npm run setup          # paste the Supabase Project URL, publishable key and secret key
npm run dev            # http://localhost:3000
```

Deploys are automatic: every push to `main` on GitHub builds and goes live on Vercel (other branches get preview deployments).
To deploy by hand from that computer instead: `npx vercel login`, then `npx vercel link --project qrave` (pick the existing project), then `npx vercel deploy --prod`.
The live site's keys are already stored in Vercel, so deploys work without copying `.env.local`.

Database changes live in `supabase/migrations/` (0001 → 0003 are applied to the live project; 0004, moving a tab to another table, and 0005, bar/kitchen stations, are not yet: paste each into the SQL Editor in order and click **Run**).

Stations: each menu category goes to the ☕ Bar or the 🍳 Kitchen (switch it in Menu). On the Orders screen, pick **All** (counter), **Bar** or **Kitchen** per device: the bar and kitchen see only their own items and move them on their own; an order is Ready once every station is done.
