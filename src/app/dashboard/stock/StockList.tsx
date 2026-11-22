'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Category, Item } from '@/lib/types';

export default function StockList({ categories, initialItems }: { categories: Category[]; initialItems: Item[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  async function toggle(item: Item) {
    const available = !item.available;
    setItems(items.map(i => (i.id === item.id ? { ...i, available } : i)));
    const { error } = await createClient().rpc('set_item_available', { p_item: item.id, p_available: available });
    if (error) {
      setError(error.message);
      setItems(items);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Sold out</h1>
      <p className="text-muted">Tap an item to mark it sold out. Customers can’t order it until you turn it back on.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {categories.map(c => {
        const list = items.filter(i => i.category_id === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id} className="mt-6">
            <h2 className="mb-2 font-bold">{c.name}</h2>
            <div className="card divide-y divide-line">
              {list.map(i => (
                <button key={i.id} onClick={() => toggle(i)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <span className={i.available ? '' : 'text-muted line-through'}>{i.name}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${i.available ? 'bg-green-100 text-ok' : 'bg-red-100 text-danger'}`}>
                    {i.available ? 'Available' : 'Sold out'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
