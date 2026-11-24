/** Shape returned by public.sales_report (0007_sales_report.sql). Money comes back as numbers or numeric strings. */
export interface SalesReport {
  sales: number | string;
  orders: number;
  items: number | string;
  prev_sales: number | string;
  prev_orders: number;
  days: { day: string; sales: number | string; orders: number }[];
  hours: { hour: number; orders: number; sales: number | string }[];
  best: { name: string; qty: number | string; sales: number | string }[];
  stations: { station: 'bar' | 'kitchen'; qty: number | string; sales: number | string }[];
}

export const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

const MANILA = 8 * 3_600_000; // UTC+8, no daylight saving
const DAY = 86_400_000;

/** Start (UTC instant) of a Philippine calendar day given as y/m/d (month 0-based; overflow is fine). */
const dayStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - MANILA);

/** The UTC instants for a range in Philippine time, plus how to name the period before it. */
export function rangeBounds(key: RangeKey, now = Date.now()) {
  const local = new Date(now + MANILA);
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate();
  const tomorrow = dayStart(y, m, d + 1);
  switch (key) {
    case 'today': return { from: dayStart(y, m, d), to: tomorrow, prev: 'yesterday' };
    case 'yesterday': return { from: dayStart(y, m, d - 1), to: dayStart(y, m, d), prev: 'the day before' };
    case '7d': return { from: dayStart(y, m, d - 6), to: tomorrow, prev: 'the 7 days before' };
    case '30d': return { from: dayStart(y, m, d - 29), to: tomorrow, prev: 'the 30 days before' };
    case 'month': return { from: dayStart(y, m, 1), to: tomorrow, prev: 'the same number of days before' };
    case 'last_month': return { from: dayStart(y, m - 1, 1), to: dayStart(y, m, 1), prev: 'the month before' };
  }
}

export const isRangeKey = (v: unknown): v is RangeKey => RANGES.some(r => r.key === v);

export const num = (v: number | string | null | undefined) => Number(v ?? 0);

/** "12 PM", "1 AM" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/** "Mon 24" for a yyyy-mm-dd day. */
export const dayLabel = (day: string, long = false) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-PH', long
    ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

export { DAY };
