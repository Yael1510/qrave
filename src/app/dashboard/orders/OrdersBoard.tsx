'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money, tableName, timeAgo } from '@/lib/format';
import type { Order, OrderStatus, ServiceRequest, TableSession } from '@/lib/types';

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'new', title: '🆕 New' },
  { status: 'preparing', title: '👩‍🍳 Preparing' },
  { status: 'ready', title: '✅ Ready to serve' },
  { status: 'served', title: '🍽️ Served' },
];
const NEXT: Partial<Record<OrderStatus, [OrderStatus, string][]>> = {
  new: [['preparing', 'Start'], ['cancelled', 'Cancel']],
  preparing: [['ready', 'Mark ready']],
  ready: [['served', 'Served']],
};

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.2].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    });
  } catch {}
}

export default function OrdersBoard({ cafeId, currency }: { cafeId: string; currency: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [view, setView] = useState<'orders' | 'tables'>('orders');
  const [live, setLive] = useState(false);
  const [sound, setSound] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [, tick] = useState(0);
  const known = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 12 * 3600e3).toISOString();
    const { data: sess } = await supabase.from('table_sessions').select('*, cafe_tables(number,label)')
      .eq('cafe_id', cafeId).eq('status', 'open').order('opened_at');
    const openIds = (sess ?? []).map(s => s.id);
    const filter = openIds.length ? `created_at.gte.${since},session_id.in.(${openIds.join(',')})` : `created_at.gte.${since}`;
    const [{ data: ords }, { data: reqs }] = await Promise.all([
      supabase.from('orders').select('*, order_items(*), cafe_tables(number,label)').eq('cafe_id', cafeId).or(filter).order('created_at'),
      supabase.from('service_requests').select('*, cafe_tables(number,label)').eq('cafe_id', cafeId).eq('status', 'open').order('created_at'),
    ]);
    const nextOrders = (ords ?? []) as Order[];
    const nextReqs = (reqs ?? []) as ServiceRequest[];

    // Sound + highlight for anything that wasn't there on the previous load.
    const ids = new Set([...nextOrders.map(o => o.id), ...nextReqs.map(r => r.id)]);
    if (known.current) {
      const added = [...ids].filter(id => !known.current!.has(id));
      if (added.length) {
        if (soundRef.current) beep();
        setFresh(prev => new Set([...prev, ...added]));
        setTimeout(() => setFresh(prev => new Set([...prev].filter(id => !added.includes(id)))), 4000);
      }
    }
    known.current = ids;
    setOrders(nextOrders);
    setRequests(nextReqs);
    setSessions((sess ?? []) as TableSession[]);
  }, [supabase, cafeId]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
    const channel = supabase.channel(`cafe-${cafeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `cafe_id=eq.${cafeId}` }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `cafe_id=eq.${cafeId}` }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions', filter: `cafe_id=eq.${cafeId}` }, debounced)
      .subscribe(status => setLive(status === 'SUBSCRIBED'));
    const poll = setInterval(load, 30000); // safety net if the live connection drops
    const clock = setInterval(() => tick(n => n + 1), 30000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); clearInterval(clock); clearTimeout(timer); };
  }, [supabase, cafeId, load]);

  async function setStatus(order: Order, status: OrderStatus) {
    if (status === 'cancelled' && !confirm(`Cancel order #${order.number}?`)) return;
    setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status } : o)));
    const { error } = await supabase.from('orders').update({ status }).eq('id', order.id);
    if (error) { alert(error.message); load(); }
  }

  async function resolveRequest(r: ServiceRequest) {
    setRequests(prev => prev.filter(x => x.id !== r.id));
    await supabase.from('service_requests').update({ status: 'done', resolved_at: new Date().toISOString() }).eq('id', r.id);
  }

  async function closeTab(s: TableSession, total: number) {
    if (!confirm(`Mark ${tableName(s.cafe_tables)} as paid (${money(total, currency)}) and close the tab?`)) return;
    const { error } = await supabase.rpc('close_session', { p_session: s.id });
    if (error) alert(error.message);
    load();
  }

  const newCount = orders.filter(o => o.status === 'new').length;
  useEffect(() => {
    const n = newCount + requests.length;
    document.title = n ? `(${n}) Orders · QRave` : 'Orders · QRave';
  }, [newCount, requests.length]);

  const servedCutoff = Date.now() - 2 * 3600e3;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full bg-soft p-1">
          {(['orders', 'tables'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? 'bg-white shadow-sm' : 'text-muted'}`}>
              {v === 'orders' ? `Orders${newCount ? ` (${newCount})` : ''}` : `Open tabs (${sessions.length})`}
            </button>
          ))}
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${live ? 'bg-green-100 text-ok' : 'bg-red-100 text-danger'}`}>
          {live ? '● Live' : '○ Connecting…'}
        </span>
        <button className="btn-secondary btn-sm ml-auto" onClick={() => { setSound(!sound); if (!sound) beep(); }}>
          {sound ? '🔔 Sound on' : '🔕 Sound off'}
        </button>
      </div>

      {requests.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {requests.map(r => (
            <div key={r.id} className={`flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-4 py-2 ${fresh.has(r.id) ? 'animate-flash' : ''}`}>
              <span className="font-bold">{r.kind === 'bill' ? '🧾 Bill' : '🙋 Waiter'} · {tableName(r.cafe_tables)}</span>
              <span className="text-xs text-muted">{timeAgo(r.created_at)}</span>
              <button className="btn btn-sm" onClick={() => resolveRequest(r)}>Done</button>
            </div>
          ))}
        </div>
      )}

      {view === 'orders' ? (
        <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map(col => {
            const list = orders
              .filter(o => o.status === col.status && (col.status !== 'served' || new Date(o.updated_at).getTime() > servedCutoff))
              .sort((a, b) => (col.status === 'served' ? b.number - a.number : a.number - b.number));
            return (
              <div key={col.status} className="min-h-40 rounded-2xl bg-soft p-3">
                <h2 className="mb-3 flex justify-between px-1 font-bold">{col.title}<span>{list.length || ''}</span></h2>
                {list.length === 0 && <p className="px-1 text-sm text-muted">Nothing here</p>}
                <div className="space-y-3">
                  {list.map(o => (
                    <div key={o.id} className={`rounded-xl bg-white p-4 shadow-sm ${fresh.has(o.id) ? 'animate-flash' : ''}`}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-extrabold">{tableName(o.cafe_tables)}</span>
                        <span className="text-xs text-muted">#{o.number} · {timeAgo(o.created_at)}</span>
                      </div>
                      <ul className="my-3 space-y-1">
                        {o.order_items.map(i => (
                          <li key={i.id}>
                            <strong>{i.qty}×</strong> {i.name}
                            {i.options.length > 0 && <div className="pl-6 text-sm text-muted">{i.options.map(x => x.name).join(', ')}</div>}
                          </li>
                        ))}
                      </ul>
                      {o.note && <div className="mb-3 rounded-lg bg-amber-50 p-2 text-sm">📝 {o.note}</div>}
                      <div className="mb-3 text-xs text-muted">Total {money(o.total, currency)}</div>
                      {NEXT[o.status] && (
                        <div className="flex gap-2">
                          {NEXT[o.status]!.map(([s, label]) => (
                            <button key={s} onClick={() => setStatus(o, s)}
                              className={`${s === 'cancelled' ? 'btn-secondary' : 'btn'} btn-sm flex-1`}>{label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.length === 0 && <p className="text-muted">No open tabs right now.</p>}
          {sessions.map(s => {
            const tabOrders = orders.filter(o => o.session_id === s.id && o.status !== 'cancelled');
            const total = tabOrders.reduce((n, o) => n + Number(o.total), 0);
            const unserved = tabOrders.filter(o => o.status !== 'served').length;
            const wantsBill = requests.some(r => r.table_id === s.table_id && r.kind === 'bill');
            return (
              <div key={s.id} className={`card p-4 ${wantsBill ? 'border-2 border-amber-400' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-extrabold">{tableName(s.cafe_tables)}</span>
                  <span className="text-xs text-muted">opened {timeAgo(s.opened_at)}</span>
                </div>
                <ul className="my-3 space-y-0.5 text-sm">
                  {tabOrders.flatMap(o => o.order_items).map(i => (
                    <li key={i.id} className="flex justify-between"><span>{i.qty}× {i.name}</span><span>{money(i.unit_price * i.qty, currency)}</span></li>
                  ))}
                </ul>
                <div className="flex justify-between border-t border-line pt-2 font-bold"><span>Total</span><span>{money(total, currency)}</span></div>
                {unserved > 0 && <p className="mt-1 text-xs text-amber-700">{unserved} order(s) not served yet</p>}
                {wantsBill && <p className="mt-1 text-xs font-semibold text-amber-700">🧾 Asked for the bill</p>}
                <button className="btn mt-3 w-full" onClick={() => closeTab(s, total)}>Mark paid & close tab</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
