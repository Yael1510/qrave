'use client';

// In-memory stand-in for Supabase, used only by the development previews under /preview.
// Data lives in localStorage, so the customer menu and the staff screen (open in different tabs or frames)
// see each other's changes live. Nothing is sent to Supabase.
import type { Cafe, CafeTable, Category, Item, Member, Order, OrderItem, ServiceRequest, TableSession } from '@/lib/types';

export type DemoOrder = Omit<Order, 'cafe_tables' | 'order_items'> & { order_items: OrderItem[] };
export interface DemoDB {
  seededAt: number;
  nextOrder: number;
  cafes: Cafe[];
  categories: Category[];
  items: Item[];
  cafe_tables: CafeTable[];
  cafe_members: Member[];
  table_sessions: (Omit<TableSession, 'cafe_tables' | 'status'> & { status: 'open' | 'paid' | 'moved'; cafe_id: string; closed_at: string | null; moved_to?: string | null })[];
  orders: DemoOrder[];
  service_requests: (Omit<ServiceRequest, 'cafe_tables'> & { cafe_id: string; resolved_at?: string })[];
}
type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

const KEY = 'qrave-demo-v1';
const listeners = new Set<() => void>();
let mem: DemoDB | null = null;

function read(): DemoDB {
  try { const raw = localStorage.getItem(KEY); if (raw) return (mem = JSON.parse(raw)); } catch {}
  if (!mem) throw new Error('Demo data is not loaded');
  return mem;
}
function write(db: DemoDB) {
  mem = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  listeners.forEach(f => f());
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) listeners.forEach(f => f()); });
}

/** Loads the sample data unless this browser already has it for the same cafe (add ?reset to the URL to start over). */
export function ensureDemoSeed(seed: DemoDB) {
  if (typeof window === 'undefined') return;
  const reset = new URLSearchParams(window.location.search).has('reset');
  let current: DemoDB | null = null;
  try { const raw = localStorage.getItem(KEY); if (raw) current = JSON.parse(raw); } catch {}
  if (current && !reset && current.cafes[0]?.id === seed.cafes[0]?.id && Date.now() - current.seededAt < 6 * 3600e3) { mem = current; return; }
  try { Object.keys(localStorage).filter(k => k.startsWith('cart:')).forEach(k => localStorage.removeItem(k)); } catch {}
  write(seed);
}

const uid = () => (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
const nowIso = () => new Date().toISOString();
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const tableRef = (db: DemoDB, id: unknown) => {
  const t = db.cafe_tables.find(x => x.id === id);
  return t ? { number: t.number, label: t.label } : null;
};

const DEFAULTS: Record<string, () => Row> = {
  categories: () => ({ name_fil: null, layout: 'list' }),
  items: () => ({ name_fil: null, description: null, description_fil: null, photo_url: null, tags: [], options: [], available: true }),
  cafe_tables: () => ({ label: null, token: uid().replace(/-/g, ''), active: true }),
};

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private sort: [string, boolean] | null = null;
  private payload: Row | Row[] | null = null;
  private cols = '*';
  private returning = false;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  constructor(private table: keyof DemoDB) {}

  select(cols = '*') { if (this.op !== 'select') this.returning = true; this.cols = cols; return this; }
  eq(col: string, v: unknown) { this.filters.push(r => r[col] === v); return this; }
  in(col: string, v: unknown[]) { this.filters.push(r => v.includes(r[col])); return this; }
  or() { return this; }
  order(col: string, o?: { ascending?: boolean }) { this.sort = [col, o?.ascending !== false]; return this; }
  limit() { return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return new Promise<Result>(r => setTimeout(() => r(this.run()), 60)).then(ok, bad);
  }

  private run(): Result {
    const db = read();
    const rows = db[this.table] as unknown as Row[];
    if (!Array.isArray(rows)) return { data: null, error: { message: `Unknown table ${String(this.table)}` } };
    const match = (r: Row) => this.filters.every(f => f(r));
    let out: Row[] = [];

    if (this.op === 'select') out = rows.filter(match);
    if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(r => ({ id: uid(), created_at: nowIso(), ...DEFAULTS[this.table]?.(), ...r }));
      rows.push(...list);
      out = list;
      write(db);
    }
    if (this.op === 'update') {
      out = rows.filter(match);
      out.forEach(r => Object.assign(r, this.payload, this.table === 'orders' ? { updated_at: nowIso() } : {}));
      write(db);
    }
    if (this.op === 'delete') {
      out = rows.filter(match);
      (db[this.table] as unknown as Row[]) = rows.filter(r => !match(r));
      if (this.table === 'categories') db.items = db.items.filter(i => !out.some(c => c.id === i.category_id));
      write(db);
    }
    if (this.op !== 'select' && !this.returning) return { data: null, error: null };

    if (this.sort) {
      const [col, asc] = this.sort;
      out = [...out].sort((a, b) => (a[col]! > b[col]! ? 1 : a[col]! < b[col]! ? -1 : 0) * (asc ? 1 : -1));
    }
    out = copy(out);
    if (this.cols.includes('cafe_tables(')) out.forEach(r => { r.cafe_tables = tableRef(db, r.table_id); });
    if (this.mode === 'many') return { data: out, error: null };
    if (!out[0] && this.mode === 'single') return { data: null, error: { message: 'Row not found' } };
    return { data: out[0] ?? null, error: null };
  }
}

function rpc(name: string, a: Record<string, unknown>): Promise<Result> {
  const db = read();
  const ok = (data: unknown = null): Result => ({ data, error: null });
  const fail = (message: string): Result => ({ data: null, error: { message } });
  const table = db.cafe_tables.find(t => t.token === a.p_token && t.active);
  const run = (): Result => {
    switch (name) {
      case 'resolve_table':
        return ok(table ? [{ cafe_id: table.cafe_id, table_id: table.id, table_number: table.number, table_label: table.label }] : []);
      case 'table_status': {
        if (!table) return fail('INVALID_TABLE');
        const recent = (s: DemoDB['table_sessions'][number]) => s.id === a.p_session && s.status === 'paid' && s.closed_at && Date.now() - Date.parse(s.closed_at) < 3600e3;
        const session = db.table_sessions.filter(s => s.table_id === table.id && (s.status === 'open' || recent(s)))
          .sort((x, y) => Number(y.status === 'open') - Number(x.status === 'open'))[0];
        const requests = db.service_requests.filter(r => r.table_id === table.id && r.status === 'open').map(r => ({ kind: r.kind, created_at: r.created_at }));
        // The phone's own tab now lives at another table (staff moved it): say where.
        let moved_to: { number: number; label: string | null } | null = null;
        if (a.p_session && session?.id !== a.p_session) {
          let mine = db.table_sessions.find(x => x.id === a.p_session);
          for (let hops = 0; mine?.status === 'moved' && mine.moved_to && hops < 5; hops++) mine = db.table_sessions.find(x => x.id === mine!.moved_to);
          if (mine?.status === 'open' && mine.table_id !== table.id) moved_to = tableRef(db, mine.table_id);
        }
        if (!session) return ok({ session: null, orders: [], requests, moved_to });
        const orders = db.orders.filter(o => o.session_id === session.id).map(o => ({
          id: o.id, number: o.number, status: o.status, total: o.total, created_at: o.created_at,
          items: o.order_items.map(i => ({ name: i.name, qty: i.qty, unit_price: i.unit_price, options: i.options })),
        }));
        return ok({ session: { id: session.id, status: session.status }, orders, requests, moved_to });
      }
      case 'place_order': {
        if (!table) return fail('INVALID_TABLE');
        const lines = a.p_items as { item_id: string; qty: number; options: string[] }[];
        if (!lines?.length) return fail('EMPTY_ORDER');
        const order_items: OrderItem[] = [];
        for (const l of lines) {
          const it = db.items.find(i => i.id === l.item_id);
          if (!it || !it.available) return fail('ITEM_UNAVAILABLE');
          const opts = it.options.filter(o => l.options.includes(o.name));
          order_items.push({ id: uid(), name: it.name, qty: l.qty, options: opts, unit_price: Number(it.price) + opts.reduce((s, o) => s + Number(o.price), 0) });
        }
        let session = db.table_sessions.find(s => s.table_id === table.id && s.status === 'open');
        if (!session) {
          session = { id: uid(), cafe_id: table.cafe_id, table_id: table.id, status: 'open', opened_at: nowIso(), closed_at: null };
          db.table_sessions.push(session);
        }
        const number = db.nextOrder++;
        db.orders.push({
          id: uid(), cafe_id: table.cafe_id, table_id: table.id, session_id: session.id, number, status: 'new',
          note: (a.p_note as string)?.trim() || null, total: order_items.reduce((s, i) => s + i.unit_price * i.qty, 0),
          created_at: nowIso(), updated_at: nowIso(), order_items,
        });
        write(db);
        return ok({ number });
      }
      case 'request_service': {
        if (!table) return fail('INVALID_TABLE');
        if (!db.service_requests.some(r => r.table_id === table.id && r.kind === a.p_kind && r.status === 'open')) {
          db.service_requests.push({ id: uid(), cafe_id: table.cafe_id, table_id: table.id, kind: a.p_kind as 'waiter' | 'bill', status: 'open', created_at: nowIso() });
          write(db);
        }
        return ok();
      }
      case 'close_session': {
        const s = db.table_sessions.find(x => x.id === a.p_session);
        if (!s) return fail('Not allowed');
        if (s.status === 'open') Object.assign(s, { status: 'paid', closed_at: nowIso() });
        db.service_requests.filter(r => r.table_id === s.table_id && r.status === 'open').forEach(r => Object.assign(r, { status: 'done', resolved_at: nowIso() }));
        write(db);
        return ok();
      }
      case 'move_session': {
        const s = db.table_sessions.find(x => x.id === a.p_session);
        if (!s) return fail('Not allowed');
        if (s.status !== 'open') return fail('TAB_CLOSED');
        const to = db.cafe_tables.find(t => t.id === a.p_table && t.cafe_id === s.cafe_id && t.active);
        if (!to) return fail('BAD_TABLE');
        if (to.id === s.table_id) return fail('SAME_TABLE');
        const from = s.table_id;
        const dest = db.table_sessions.find(x => x.table_id === to.id && x.status === 'open');
        if (dest) {
          db.orders.filter(o => o.session_id === s.id).forEach(o => { o.session_id = dest.id; });
          Object.assign(s, { status: 'moved', closed_at: nowIso(), moved_to: dest.id });
        } else s.table_id = to.id;
        const destId = dest?.id ?? s.id;
        db.orders.filter(o => o.session_id === destId).forEach(o => { o.table_id = to.id; });
        db.service_requests.filter(r => r.table_id === from && r.status === 'open').forEach(r => {
          if (db.service_requests.some(x => x.table_id === to.id && x.kind === r.kind && x.status === 'open')) Object.assign(r, { status: 'done', resolved_at: nowIso() });
          else r.table_id = to.id;
        });
        write(db);
        return ok({ session: destId, merged: Boolean(dest), table_number: to.number, table_label: to.label });
      }
      case 'set_item_available': {
        const it = db.items.find(i => i.id === a.p_item);
        if (it) { it.available = Boolean(a.p_available); write(db); }
        return ok();
      }
      default:
        return fail(`${name} is not available in the demo`);
    }
  };
  return new Promise(r => setTimeout(() => r(run()), 120));
}

export function createDemoClient() {
  return {
    from: (table: string) => new Query(table as keyof DemoDB),
    rpc,
    channel() {
      const handlers: (() => void)[] = [];
      const ch = {
        fire: () => handlers.forEach(h => h()),
        on(_event: string, _filter: unknown, cb: () => void) { handlers.push(cb); return ch; },
        subscribe(cb?: (status: string) => void) { listeners.add(ch.fire); setTimeout(() => cb?.('SUBSCRIBED'), 300); return ch; },
      };
      return ch;
    },
    removeChannel(ch: { fire: () => void }) { listeners.delete(ch.fire); },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: 'Photo uploads are off in the demo.' } }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    auth: {
      signOut: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'demo-owner' } }, error: null }),
    },
  };
}

/** True on the development previews, where the app runs against the demo data. */
export function isDemoPage() {
  return process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && window.location.pathname.startsWith('/preview/');
}
