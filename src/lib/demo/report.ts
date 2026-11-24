import type { Category, Item } from '@/lib/types';
import type { SalesReport } from '@/lib/report';

// Made-up sales history for the development-only preview, shaped like public.sales_report.
// Deterministic: the same day always gets the same orders, so the numbers don't jump on reload.

const MANILA = 8 * 3_600_000;
const HOUR = 3_600_000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Rough cafe traffic by hour (7 AM - 9 PM): morning coffee, lunch, afternoon merienda.
const HOURLY = [0, 0, 0, 0, 0, 0, 0, 3, 6, 5, 3, 4, 7, 6, 3, 4, 5, 4, 3, 2, 1, 0, 0, 0];

type Sale = { at: number; total: number; lines: { name: string; qty: number; sales: number; station: 'bar' | 'kitchen' }[] };

function ordersFor(dayStartUtc: number, items: Item[], categories: Category[]): Sale[] {
  const dayIndex = Math.floor((dayStartUtc + MANILA) / 86_400_000);
  const r = rng(dayIndex * 7919);
  const weekday = new Date(dayStartUtc + MANILA).getUTCDay();
  const busy = weekday === 0 || weekday === 6 ? 1.35 : weekday === 5 ? 1.15 : 1;
  const station = (it: Item) => categories.find(c => c.id === it.category_id)?.station ?? 'kitchen';
  // Earlier items in each category sell more (they're the signature drinks and dishes).
  const weighted = items.flatMap(it => Array(Math.max(1, 6 - it.position)).fill(it) as Item[]);
  const out: Sale[] = [];
  HOURLY.forEach((w, h) => {
    const n = Math.round(w * busy * (0.7 + r() * 0.6));
    for (let k = 0; k < n; k++) {
      const count = 1 + Math.floor(r() * 3);
      const lines = Array.from({ length: count }, () => {
        const it = weighted[Math.floor(r() * weighted.length)];
        const qty = r() < 0.2 ? 2 : 1;
        return { name: it.name, qty, sales: Number(it.price) * qty, station: station(it) };
      });
      out.push({ at: dayStartUtc + h * HOUR + Math.floor(r() * HOUR), total: lines.reduce((s, l) => s + l.sales, 0), lines });
    }
  });
  return out;
}

export function demoReport(items: Item[], categories: Category[], from: Date, to: Date, now = Date.now()): SalesReport {
  const len = to.getTime() - from.getTime();
  const collect = (a: number, b: number) => {
    const sales: Sale[] = [];
    for (let d = a; d < b; d += 86_400_000) sales.push(...ordersFor(d, items, categories).filter(s => s.at >= a && s.at < b && s.at <= now));
    return sales;
  };
  const cur = collect(from.getTime(), to.getTime());
  // Same elapsed time as the database: today until now is compared with yesterday until the same hour.
  const prev = collect(from.getTime() - len, Math.min(to.getTime(), Math.max(now, from.getTime())) - len);
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const lines = cur.flatMap(s => s.lines);
  const day = (t: number) => new Date(t + MANILA).toISOString().slice(0, 10);

  const days: SalesReport['days'] = [];
  for (let d = from.getTime(); d < to.getTime(); d += 86_400_000) {
    const these = cur.filter(s => day(s.at) === day(d));
    days.push({ day: day(d), sales: sum(these.map(s => s.total)), orders: these.length });
  }
  const hours = Array.from({ length: 24 }, (_, h) => {
    const these = cur.filter(s => new Date(s.at + MANILA).getUTCHours() === h);
    return { hour: h, orders: these.length, sales: sum(these.map(s => s.total)) };
  });
  const byName = new Map<string, { name: string; qty: number; sales: number }>();
  lines.forEach(l => {
    const b = byName.get(l.name) ?? { name: l.name, qty: 0, sales: 0 };
    b.qty += l.qty; b.sales += l.sales; byName.set(l.name, b);
  });
  const stations = (['bar', 'kitchen'] as const).map(st => {
    const these = lines.filter(l => l.station === st);
    return { station: st, qty: sum(these.map(l => l.qty)), sales: sum(these.map(l => l.sales)) };
  });

  return {
    sales: sum(cur.map(s => s.total)), orders: cur.length, items: sum(lines.map(l => l.qty)),
    prev_sales: sum(prev.map(s => s.total)), prev_orders: prev.length,
    days, hours,
    best: [...byName.values()].sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 10),
    stations,
  };
}
