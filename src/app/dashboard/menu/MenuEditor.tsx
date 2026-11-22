'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import { TAGS } from '@/lib/i18n';
import { STATION_ICON, STATION_NAME, guessStation } from '@/lib/stations';
import type { Cafe, Category, Item } from '@/lib/types';
import ItemForm from './ItemForm';

export default function MenuEditor({ cafe, initialCategories, initialItems }: {
  cafe: Cafe; initialCategories: Category[]; initialItems: Item[];
}) {
  const supabase = createClient();
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [newCat, setNewCat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fail = (e: { message: string } | null) => { if (e) setError(e.message); return !!e; };

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    const station = guessStation(newCat);
    const row = { cafe_id: cafe.id, name: newCat.trim(), position: categories.length };
    let { data, error } = await supabase.from('categories').insert({ ...row, ...(station === 'bar' ? { station } : {}) }).select().single();
    if (error && /station/i.test(error.message)) {
      ({ data, error } = await supabase.from('categories').insert(row).select().single()); // database without stations yet (0005 not run)
    }
    if (fail(error)) return;
    setCategories([...categories, data as Category]);
    setNewCat('');
  }

  async function renameCategory(c: Category) {
    const name = prompt('Category name', c.name)?.trim();
    if (!name) return;
    const name_fil = prompt('Filipino name (optional)', c.name_fil ?? '')?.trim() || null;
    const { error } = await supabase.from('categories').update({ name, name_fil }).eq('id', c.id);
    if (!fail(error)) setCategories(categories.map(x => (x.id === c.id ? { ...x, name, name_fil } : x)));
  }

  async function toggleLayout(c: Category) {
    const layout = c.layout === 'grid' ? 'list' : 'grid';
    const { error } = await supabase.from('categories').update({ layout }).eq('id', c.id);
    if (!fail(error)) setCategories(categories.map(x => (x.id === c.id ? { ...x, layout } : x)));
  }

  async function toggleStation(c: Category) {
    const station = (c.station ?? 'kitchen') === 'kitchen' ? 'bar' : 'kitchen';
    const { error } = await supabase.from('categories').update({ station }).eq('id', c.id);
    if (!fail(error)) setCategories(categories.map(x => (x.id === c.id ? { ...x, station } : x)));
  }

  async function deleteCategory(c: Category) {
    const count = items.filter(i => i.category_id === c.id).length;
    if (!confirm(count ? `Delete "${c.name}" and its ${count} item(s)?` : `Delete "${c.name}"?`)) return;
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    if (fail(error)) return;
    setCategories(categories.filter(x => x.id !== c.id));
    setItems(items.filter(i => i.category_id !== c.id));
  }

  async function moveCategory(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[index], next[j]] = [next[j], next[index]];
    const withPos = next.map((c, i) => ({ ...c, position: i }));
    setCategories(withPos);
    await Promise.all([withPos[index], withPos[j]].map(c => supabase.from('categories').update({ position: c.position }).eq('id', c.id)));
  }

  async function moveItem(item: Item, dir: -1 | 1) {
    const list = items.filter(i => i.category_id === item.category_id).sort((a, b) => a.position - b.position);
    const idx = list.findIndex(i => i.id === item.id);
    const other = list[idx + dir];
    if (!other) return;
    const a = { ...item, position: other.position === item.position ? item.position + dir : other.position };
    const b = { ...other, position: item.position };
    setItems(items.map(i => (i.id === a.id ? a : i.id === b.id ? b : i)));
    await Promise.all([a, b].map(x => supabase.from('items').update({ position: x.position }).eq('id', x.id)));
  }

  async function toggleAvailable(item: Item) {
    const { error } = await supabase.from('items').update({ available: !item.available }).eq('id', item.id);
    if (!fail(error)) setItems(items.map(i => (i.id === item.id ? { ...i, available: !i.available } : i)));
  }

  async function deleteItem(item: Item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (!fail(error)) setItems(items.filter(i => i.id !== item.id));
  }

  function onSaved(item: Item) {
    setItems(prev => (prev.some(i => i.id === item.id) ? prev.map(i => (i.id === item.id ? item : i)) : [...prev, item]));
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-muted">Changes show on your customers’ menu right away.</p>
        </div>
        <form onSubmit={addCategory} className="flex gap-2">
          <input className="input py-2" placeholder="New category, e.g. Coffee" value={newCat} onChange={e => setNewCat(e.target.value)} maxLength={60} />
          <button className="btn btn-sm whitespace-nowrap">Add category</button>
        </form>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-danger" onClick={() => setError(null)}>{error}</p>}

      {categories.length === 0 && (
        <div className="card p-10 text-center">
          <div className="text-4xl">📋</div>
          <h2 className="mt-3 text-lg font-semibold">Start with a category</h2>
          <p className="text-muted">For example “Coffee”, “Pastries” or “All-day breakfast”, then add items to it.</p>
        </div>
      )}

      {categories.map((c, ci) => {
        const list = items.filter(i => i.category_id === c.id).sort((a, b) => a.position - b.position);
        return (
          <section key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-lg font-bold">
                {c.name} {c.name_fil && <span className="text-sm font-normal text-muted">· {c.name_fil}</span>}
              </h2>
              <button className="btn-secondary btn-sm" onClick={() => moveCategory(ci, -1)} disabled={ci === 0} aria-label="Move up">↑</button>
              <button className="btn-secondary btn-sm" onClick={() => moveCategory(ci, 1)} disabled={ci === categories.length - 1} aria-label="Move down">↓</button>
              <button className="btn-secondary btn-sm" onClick={() => toggleLayout(c)} title="How this section looks on the customer menu">
                {c.layout === 'grid' ? '▦ Cards' : '☰ List'}
              </button>
              <button className="btn-secondary btn-sm" onClick={() => toggleStation(c)}
                title="Which screen gets this category's orders: drinks at the bar, food in the kitchen. Click to switch.">
                {STATION_ICON[c.station ?? 'kitchen']} {STATION_NAME[c.station ?? 'kitchen']}
              </button>
              <button className="btn-secondary btn-sm" onClick={() => renameCategory(c)}>Rename</button>
              <button className="btn-secondary btn-sm text-danger" onClick={() => deleteCategory(c)}>Delete</button>
              <button className="btn btn-sm" onClick={() => setEditing({ category_id: c.id })}>+ Add item</button>
            </div>
            <div className="mt-3 divide-y divide-line">
              {list.length === 0 && <p className="py-4 text-sm text-muted">No items yet.</p>}
              {list.map((item, ii) => (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  {item.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo_url} alt="" className="h-14 w-14 flex-none rounded-xl object-cover" />
                  ) : (
                    <div className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-soft text-xl">🍽️</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`font-semibold ${item.available ? '' : 'text-muted line-through'}`}>{item.name}</div>
                    <div className="text-sm text-muted">
                      {money(item.price, cafe.currency)}
                      {item.options.length > 0 && ` · ${item.options.length} option${item.options.length > 1 ? 's' : ''}`}
                      {item.tags.length > 0 && ` · ${item.tags.map(t => TAGS.find(x => x.id === t)?.emoji ?? '').join(' ')}`}
                      {item.badge && <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={item.available} onChange={() => toggleAvailable(item)} />
                    <span className="hidden sm:inline">Available</span>
                  </label>
                  <button className="btn-secondary btn-sm hidden sm:inline-flex" onClick={() => moveItem(item, -1)} disabled={ii === 0} aria-label="Move up">↑</button>
                  <button className="btn-secondary btn-sm hidden sm:inline-flex" onClick={() => moveItem(item, 1)} disabled={ii === list.length - 1} aria-label="Move down">↓</button>
                  <button className="btn-secondary btn-sm" onClick={() => setEditing(item)}>Edit</button>
                  <button className="btn-secondary btn-sm text-danger" onClick={() => deleteItem(item)} aria-label="Delete">✕</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {editing && (
        <ItemForm cafe={cafe} categories={categories} item={editing}
          nextPosition={items.filter(i => i.category_id === editing.category_id).length}
          onClose={() => setEditing(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
