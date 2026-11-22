const formatters = new Map<string, Intl.NumberFormat>();

export function money(amount: number | string, currency = 'PHP') {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f.format(Number(amount));
}

export function timeAgo(iso: string, now = Date.now()) {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export const tableName = (t: { number: number; label: string | null } | null | undefined) =>
  t ? (t.label ? `${t.label} (T${t.number})` : `Table ${t.number}`) : 'Table ?';
