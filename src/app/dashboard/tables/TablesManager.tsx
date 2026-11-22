'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Cafe, CafeTable } from '@/lib/types';

export default function TablesManager({ cafe, initialTables, siteUrl }: { cafe: Cafe; initialTables: CafeTable[]; siteUrl: string }) {
  const supabase = createClient();
  const [tables, setTables] = useState(initialTables);
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [base, setBase] = useState(siteUrl);
  const [addCount, setAddCount] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!siteUrl) setBase(window.location.origin); }, [siteUrl]);

  const linkFor = (t: CafeTable) => `${base.replace(/\/$/, '')}/c/${cafe.slug}?t=${t.token}`;

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    Promise.all(tables.map(async t => [t.id, await QRCode.toString(linkFor(t), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })] as const))
      .then(entries => { if (!cancelled) setSvgs(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, base]);

  async function addTables() {
    const start = tables.reduce((m, t) => Math.max(m, t.number), 0) + 1;
    const rows = Array.from({ length: addCount }, (_, i) => ({ cafe_id: cafe.id, number: start + i }));
    const { data, error } = await supabase.from('cafe_tables').insert(rows).select();
    if (error) return setError(error.message);
    setTables([...tables, ...(data as CafeTable[])]);
  }

  async function rename(t: CafeTable) {
    const label = prompt('Label for this table (optional, e.g. "Patio 1")', t.label ?? '');
    if (label === null) return;
    const { error } = await supabase.from('cafe_tables').update({ label: label.trim() || null }).eq('id', t.id);
    if (error) return setError(error.message);
    setTables(tables.map(x => (x.id === t.id ? { ...x, label: label.trim() || null } : x)));
  }

  async function regenerate(t: CafeTable) {
    if (!confirm(`Make a new QR code for Table ${t.number}? The old printed code will stop working.`)) return;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('cafe_tables').update({ token }).eq('id', t.id);
    if (error) return setError(error.message);
    setTables(tables.map(x => (x.id === t.id ? { ...x, token } : x)));
  }

  async function remove(t: CafeTable) {
    if (!confirm(`Remove Table ${t.number}? Its QR code will stop working and its order history is deleted.`)) return;
    const { error } = await supabase.from('cafe_tables').delete().eq('id', t.id);
    if (error) return setError(error.message);
    setTables(tables.filter(x => x.id !== t.id));
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tables & QR codes</h1>
          <p className="text-muted">Print these and place one on each table. Each code only works for its own table.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="number" min={1} max={50} className="input w-20 py-2" value={addCount} onChange={e => setAddCount(Math.max(1, Math.min(50, Number(e.target.value))))} />
          <button className="btn-secondary btn-sm" onClick={addTables}>Add tables</button>
          <button className="btn btn-sm" onClick={() => window.print()}>🖨️ Print QR codes</button>
        </div>
      </div>
      {error && <p className="no-print mt-3 rounded-xl bg-red-50 p-3 text-sm text-danger">{error}</p>}
      {/localhost|127\.0\.0\.1/.test(base) && (
        <p className="no-print mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          These codes point to <strong>{base}</strong>, which phones can’t open. Print them from your live site address instead.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {tables.map(t => (
          <div key={t.id} className="card break-inside-avoid p-4 text-center print:border-dashed">
            <div className="mx-auto aspect-square w-full max-w-[200px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs[t.id] ?? '' }} />
            <div className="mt-2 text-2xl font-extrabold">Table {t.number}</div>
            {t.label && <div className="text-sm font-medium">{t.label}</div>}
            <div className="text-sm text-muted">Scan to see the menu & order</div>
            <div className="mt-1 text-xs text-muted">{cafe.name}</div>
            <div className="no-print mt-3 flex flex-wrap justify-center gap-1">
              <a className="btn-secondary btn-sm" href={linkFor(t)} target="_blank" rel="noreferrer">Open</a>
              <button className="btn-secondary btn-sm" onClick={() => rename(t)}>Label</button>
              <button className="btn-secondary btn-sm" onClick={() => regenerate(t)} title="New code">↻</button>
              <button className="btn-secondary btn-sm text-danger" onClick={() => remove(t)} aria-label="Remove">✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
