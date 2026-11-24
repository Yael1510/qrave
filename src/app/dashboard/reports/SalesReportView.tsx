import Link from 'next/link';
import { money } from '@/lib/format';
import { RANGES, dayLabel, hourLabel, num, type RangeKey, type SalesReport } from '@/lib/report';

type Props = { report: SalesReport; range: RangeKey; prevLabel: string; basePath: string; currency: string };

/** The owner's sales report. Plain markup (no client JS): hover and keyboard focus show each bar's numbers. */
export default function SalesReportView({ report, range, prevLabel, basePath, currency }: Props) {
  const sales = num(report.sales);
  const orders = report.orders;
  const avg = orders ? sales / orders : 0;
  const peso = (v: number) => money(v, currency);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold">Sales</h1>
        {RANGES.map(r => (
          <Link key={r.key} href={`${basePath}?range=${r.key}`} scroll={false}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${r.key === range ? 'bg-ink text-cream' : 'bg-white text-ink ring-1 ring-line hover:bg-soft'}`}>
            {r.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Sales" value={peso(sales)} change={change(sales, num(report.prev_sales))} prevLabel={prevLabel} />
        <Tile label="Orders" value={String(orders)} change={change(orders, report.prev_orders)} prevLabel={prevLabel} />
        <Tile label="Average order" value={peso(avg)} />
        <Tile label="Items sold" value={String(num(report.items))} />
      </div>

      {orders === 0 ? (
        <div className="card p-8 text-center text-muted">No orders in this period yet.</div>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {report.days.length > 1 && <DailyChart days={report.days} peso={peso} />}
            <HoursChart hours={report.hours} peso={peso} wide={report.days.length <= 1} />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <BestSellers best={report.best} peso={peso} />
            <Stations stations={report.stations} peso={peso} />
          </div>
          <p className="text-xs text-muted">Every order except cancelled ones, including tabs that aren&apos;t paid yet. Times are Philippine time.</p>
        </>
      )}
    </div>
  );
}

function change(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

function Tile({ label, value, change, prevLabel }: { label: string; value: string; change?: number | null; prevLabel?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {change !== undefined && change !== null && (
        <div className="mt-1 text-xs text-muted">
          <span className={`font-semibold ${change >= 0 ? 'text-ok' : 'text-danger'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change)}%</span> vs {prevLabel}
        </div>
      )}
    </div>
  );
}

/** Round a maximum up to a tidy axis top (1, 2 or 5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(n => n >= v)!;
}

function Bars({ items, height = 180, label, fmt }: {
  items: { key: string; value: number; axis: string; tip: string; strong?: boolean }[]; height?: number; label: string;
  fmt: (v: number) => string;
}) {
  const top = niceMax(Math.max(...items.map(i => i.value)));
  const every = Math.ceil(items.length / 10); // at most ~10 axis labels
  return (
    <div role="img" aria-label={label}>
      <div className="relative" style={{ height }}>
        {[1, 0.5, 0].map(f => (
          <div key={f} className="absolute inset-x-0 border-t border-line" style={{ top: `${(1 - f) * 100}%` }}>
            {f > 0 && <span className="absolute right-0 -top-4 text-[11px] text-muted tabular-nums">{fmt(top * f)}</span>}
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {items.map(i => (
            <div key={i.key} tabIndex={0} aria-label={i.tip}
              className="group relative flex h-full min-w-0 flex-1 items-end outline-none">
              <div className={`w-full rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80 group-focus:opacity-80 ${i.strong === false ? 'opacity-35' : ''}`}
                style={{ height: `${(i.value / top) * 100}%`, minHeight: i.value > 0 ? 3 : 0 }} />
              <div aria-hidden className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-cream shadow-lg group-hover:block group-focus:block">
                {i.tip}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[11px] text-muted">
        {items.map((i, n) => (
          <div key={i.key} className="min-w-0 flex-1 overflow-visible text-center whitespace-nowrap">{n % every === 0 ? i.axis : ''}</div>
        ))}
      </div>
    </div>
  );
}

function DailyChart({ days, peso }: { days: SalesReport['days']; peso: (v: number) => string }) {
  const best = days.reduce((a, b) => (num(b.sales) > num(a.sales) ? b : a));
  return (
    <section className="card p-4">
      <h2 className="font-semibold">Sales per day</h2>
      <p className="mb-4 text-sm text-muted">Best day: {dayLabel(best.day, true)}, {peso(num(best.sales))}</p>
      <Bars label="Sales per day" fmt={v => `₱${v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v}`}
        items={days.map(d => ({
          key: d.day, value: num(d.sales), axis: days.length <= 7 ? dayLabel(d.day, true).slice(0, 3) : String(Number(d.day.slice(8))),
          tip: `${dayLabel(d.day, true)} · ${peso(num(d.sales))} · ${d.orders} order${d.orders === 1 ? '' : 's'}`,
        }))} />
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <tbody>
            {days.map(d => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{dayLabel(d.day, true)}</td>
                <td className="py-1 text-right">{d.orders}</td>
                <td className="py-1 text-right">{peso(num(d.sales))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function HoursChart({ hours, peso, wide }: { hours: SalesReport['hours']; peso: (v: number) => string; wide: boolean }) {
  const busy = hours.filter(h => h.orders > 0);
  // Show the hours the cafe actually had orders, padded by one; default to 7 AM - 10 PM.
  const first = busy.length ? Math.max(0, busy[0].hour - 1) : 7;
  const last = busy.length ? Math.min(23, busy[busy.length - 1].hour + 1) : 22;
  const shown = hours.filter(h => h.hour >= first && h.hour <= last);
  const peak = busy.length ? busy.reduce((a, b) => (b.orders > a.orders ? b : a)) : null;
  return (
    <section className={`card p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="font-semibold">Busy hours</h2>
      <p className="mb-4 text-sm text-muted">
        {peak ? `Busiest: ${hourLabel(peak.hour)} to ${hourLabel((peak.hour + 1) % 24)}, ${peak.orders} order${peak.orders === 1 ? '' : 's'}` : 'Orders by hour'}
      </p>
      <Bars label="Orders by hour of the day" fmt={v => `${+v.toFixed(1)} orders`}
        items={shown.map(h => ({
          key: String(h.hour), value: h.orders, axis: hourLabel(h.hour).replace(' ', ''),
          tip: `${hourLabel(h.hour)} · ${h.orders} order${h.orders === 1 ? '' : 's'} · ${peso(num(h.sales))}`,
          strong: !peak || h.hour === peak.hour ? undefined : false,
        }))} />
    </section>
  );
}

function BestSellers({ best, peso }: { best: SalesReport['best']; peso: (v: number) => string }) {
  const top = Math.max(1, ...best.map(b => num(b.qty)));
  return (
    <section className="card p-4 lg:col-span-2">
      <h2 className="mb-3 font-semibold">Best sellers</h2>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-medium">#</th>
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 text-right font-medium">Sold</th>
            <th className="pb-2 text-right font-medium">Sales</th>
          </tr>
        </thead>
        <tbody>
          {best.map((b, i) => (
            <tr key={b.name} className="border-t border-line">
              <td className="w-6 py-2 text-muted">{i + 1}</td>
              <td className="py-2 pr-3">
                <div className="font-medium">{b.name}</div>
                <div className="mt-1 h-1.5 rounded-full bg-soft">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(num(b.qty) / top) * 100}%` }} />
                </div>
              </td>
              <td className="py-2 text-right">{num(b.qty)}</td>
              <td className="py-2 pl-3 text-right">{peso(num(b.sales))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Stations({ stations, peso }: { stations: SalesReport['stations']; peso: (v: number) => string }) {
  const total = stations.reduce((s, x) => s + num(x.sales), 0) || 1;
  const rows = (['bar', 'kitchen'] as const).map(k => stations.find(s => s.station === k) ?? { station: k, qty: 0, sales: 0 });
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">Bar and kitchen</h2>
      <div className="space-y-4">
        {rows.map(s => (
          <div key={s.station}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{s.station === 'bar' ? '☕ Bar' : '🍳 Kitchen'}</span>
              <span className="tabular-nums text-muted">{Math.round((num(s.sales) / total) * 100)}%</span>
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">{peso(num(s.sales))}</div>
            <div className="text-xs text-muted">{num(s.qty)} items</div>
          </div>
        ))}
      </div>
    </section>
  );
}
