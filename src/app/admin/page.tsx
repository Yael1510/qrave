import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/admin';
import { PLAN_LABEL, planState, shortDate } from '@/lib/plan';
import { createAdminClient } from '@/lib/supabase/server';
import type { Cafe } from '@/lib/types';
import { changePlan, type PlanAction } from './actions';

export const metadata: Metadata = { title: 'QRave admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const WEEK = 7 * 86_400_000;

type Row = Cafe & { created_at: string };

export default async function AdminPage() {
  await requirePlatformAdmin();
  const db = createAdminClient();
  const since = new Date(Date.now() - WEEK).toISOString();
  const [cafesRes, ownersRes, tablesRes, ordersRes] = await Promise.all([
    db.from('cafes').select('*').order('created_at', { ascending: false }),
    db.from('cafe_members').select('cafe_id, email').eq('role', 'owner'),
    db.from('cafe_tables').select('cafe_id').eq('active', true),
    db.from('orders').select('cafe_id').gte('created_at', since).neq('status', 'cancelled'),
  ]);
  if (cafesRes.error) {
    return (
      <Shell>
        <div className="card p-6 text-sm">Couldn&apos;t load cafes: {cafesRes.error.message}</div>
      </Shell>
    );
  }
  const cafes = (cafesRes.data ?? []) as Row[];
  if (cafes.length && !('plan' in cafes[0])) {
    return (
      <Shell>
        <div className="card p-6 text-sm">
          The live database doesn&apos;t have plans yet. In Supabase, open the SQL Editor, paste{' '}
          <code>supabase/migrations/0006_plans.sql</code> and click <b>Run</b>, then reload this page.
        </div>
      </Shell>
    );
  }

  const count = (rows: { cafe_id: string }[] | null) =>
    (rows ?? []).reduce<Record<string, number>>((m, r) => ((m[r.cafe_id] = (m[r.cafe_id] ?? 0) + 1), m), {});
  const owners = Object.fromEntries((ownersRes.data ?? []).map(o => [o.cafe_id, o.email as string | null]));
  const tables = count(tablesRes.data);
  const orders = count(ordersRes.data);

  const rows = cafes.map(c => ({ c, s: planState(c) }));
  // Needs attention first: closed, then running out soonest.
  const rank = (r: (typeof rows)[number]) => (!r.s.open ? -1 : r.s.daysLeft ?? 999);
  rows.sort((a, b) => rank(a) - rank(b));

  const stats = [
    { label: 'Cafes', value: cafes.length },
    { label: 'On trial', value: rows.filter(r => r.c.plan === 'trial' && r.s.open).length },
    { label: 'Ending in 2 days', value: rows.filter(r => r.s.open && r.s.daysLeft !== null && r.s.daysLeft <= 2).length },
    { label: 'Closed', value: rows.filter(r => !r.s.open).length },
    { label: 'Monthly', value: rows.filter(r => r.c.plan === 'monthly' && r.s.open).length },
    { label: 'One-time', value: rows.filter(r => r.c.plan === 'one_time').length },
  ];

  return (
    <Shell>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {stats.map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {rows.map(({ c, s }) => (
          <div key={c.id} className="card p-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{c.name}</span>
                  <Status open={s.open} paused={c.status === 'suspended'} />
                  <span className="rounded-full bg-soft px-2.5 py-0.5 text-xs font-semibold">{PLAN_LABEL[c.plan ?? 'comp']}</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  <Link href={`/c/${c.slug}`} target="_blank" className="underline">/c/{c.slug}</Link>
                  {' · '}{owners[c.id] ?? 'no owner email'}
                  {' · '}{tables[c.id] ?? 0} tables · {orders[c.id] ?? 0} orders this week
                  {' · '}joined {shortDate(new Date(c.created_at))}
                </div>
                <div className="mt-1 text-sm">{describe(c, s)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn cafe={c.id} action="trial7">+7 trial days</Btn>
                <Btn cafe={c.id} action="paid_month" primary>Paid 1 month</Btn>
                {c.plan !== 'one_time' && <Btn cafe={c.id} action="one_time">One-time build</Btn>}
                {c.plan !== 'comp' && <Btn cafe={c.id} action="comp">Free</Btn>}
                {c.status === 'suspended' ? <Btn cafe={c.id} action="unpause">Unpause</Btn> : <Btn cafe={c.id} action="pause">Pause</Btn>}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="card p-6 text-sm text-muted">No cafes yet.</div>}
      </div>
    </Shell>
  );
}

function describe(c: Cafe, s: ReturnType<typeof planState>) {
  if (c.status === 'suspended') return 'Paused by QRave. Customers see "QR ordering is paused".';
  if (!s.endsAt) return c.plan === 'one_time' ? 'Paid once. Never expires.' : 'Free. Never expires.';
  const when = shortDate(s.endsAt);
  if (!s.open) return c.plan === 'trial' ? `Trial ended ${when}.` : `Paid month ended ${when}.`;
  const left = s.daysLeft === 0 ? 'ends today' : `${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`;
  return c.plan === 'trial' ? `Trial until ${when} (${left}).` : `Paid until ${when} (${left}).`;
}

function Status({ open, paused }: { open: boolean; paused: boolean }) {
  return open ? (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">Open</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">{paused ? 'Paused' : 'Closed'}</span>
  );
}

function Btn({ cafe, action, primary, children }: { cafe: string; action: PlanAction; primary?: boolean; children: React.ReactNode }) {
  return (
    <form action={changePlan}>
      <input type="hidden" name="cafe" value={cafe} />
      <input type="hidden" name="action" value={action} />
      <button className={primary ? 'btn btn-sm' : 'btn-secondary btn-sm'}>{children}</button>
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="text-xl font-bold">☕ QRave admin</span>
        <span className="text-sm text-muted">All cafes, trials and plans</span>
      </div>
      {children}
    </main>
  );
}
