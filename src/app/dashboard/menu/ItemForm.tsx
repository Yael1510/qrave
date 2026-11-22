'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TAGS } from '@/lib/i18n';
import { uploadCafeImage } from '@/lib/upload';
import type { Cafe, Category, Item, ItemOption } from '@/lib/types';

export const BADGES = ['Best Seller', 'Signature', 'New', 'Must Try'];

export default function ItemForm({ cafe, categories, item, nextPosition, onClose, onSaved }: {
  cafe: Cafe; categories: Category[]; item: Partial<Item>; nextPosition: number;
  onClose: () => void; onSaved: (item: Item) => void;
}) {
  const [f, setF] = useState({
    name: item.name ?? '',
    name_fil: item.name_fil ?? '',
    description: item.description ?? '',
    description_fil: item.description_fil ?? '',
    price: item.price != null ? String(item.price) : '',
    category_id: item.category_id ?? categories[0]?.id ?? '',
    photo_url: item.photo_url ?? null,
    tags: item.tags ?? [],
    options: (item.options ?? []).map(o => ({ ...o, price: String(o.price ?? 0) })),
    available: item.available ?? true,
    badge: item.badge ?? '',
    prep_minutes: item.prep_minutes != null ? String(item.prep_minutes) : '',
    calories: item.calories != null ? String(item.calories) : '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      set('photo_url', await uploadCafeImage(cafe.id, 'items', file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(f.price);
    if (!Number.isFinite(price) || price < 0) return setError('Enter a valid price.');
    const options: ItemOption[] = f.options
      .filter(o => o.name.trim())
      .map(o => ({ name: o.name.trim(), name_fil: o.name_fil?.trim() || null, price: Number(o.price) || 0 }));
    const row = {
      cafe_id: cafe.id,
      category_id: f.category_id,
      name: f.name.trim(),
      name_fil: f.name_fil.trim() || null,
      description: f.description.trim() || null,
      description_fil: f.description_fil.trim() || null,
      price,
      photo_url: f.photo_url,
      tags: f.tags,
      options,
      available: f.available,
      badge: f.badge.trim() || null,
      prep_minutes: Number(f.prep_minutes) || null,
      calories: Number(f.calories) || null,
      ...(item.id ? {} : { position: nextPosition }),
    };
    setBusy(true);
    const supabase = createClient();
    const q = item.id ? supabase.from('items').update(row).eq('id', item.id) : supabase.from('items').insert(row);
    const { data, error } = await q.select().single();
    setBusy(false);
    if (error) return setError(error.message);
    onSaved(data as Item);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="animate-sheet max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{item.id ? 'Edit item' : 'New item'}</h2>
          <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-soft" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mt-4 flex items-center gap-4">
          {f.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.photo_url} alt="" className="h-24 w-24 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-2xl bg-soft text-3xl">📷</div>
          )}
          <div className="space-y-2">
            <label className="btn-secondary btn-sm cursor-pointer">
              {uploading ? 'Uploading…' : f.photo_url ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading} />
            </label>
            {f.photo_url && <button type="button" className="block text-sm text-danger" onClick={() => set('photo_url', null)}>Remove photo</button>}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" required maxLength={80} value={f.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label">Filipino name <span className="font-normal text-muted">(optional)</span></label>
            <input className="input" maxLength={80} value={f.name_fil} onChange={e => set('name_fil', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea className="input" rows={2} maxLength={300} value={f.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Filipino description <span className="font-normal text-muted">(optional)</span></label>
            <textarea className="input" rows={2} maxLength={300} value={f.description_fil} onChange={e => set('description_fil', e.target.value)} />
          </div>
          <div>
            <label className="label">Price (₱)</label>
            <input className="input" required inputMode="decimal" value={f.price} onChange={e => set('price', e.target.value.replace(/[^0-9.]/g, ''))} placeholder="150" />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={f.category_id} onChange={e => set('category_id', e.target.value)}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="label">Badge <span className="font-normal text-muted">(shown on the photo)</span></div>
          <div className="flex flex-wrap items-center gap-2">
            {['', ...BADGES].map(b => (
              <button type="button" key={b || 'none'} onClick={() => set('badge', b)}
                className={`chip ${f.badge === b ? 'border-ink bg-ink text-cream' : ''}`}>{b || 'None'}</button>
            ))}
            <input className="input w-40 py-1.5 text-sm" maxLength={24} placeholder="Custom…"
              value={BADGES.includes(f.badge) ? '' : f.badge} onChange={e => set('badge', e.target.value)} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <label className="label">Prep time <span className="font-normal text-muted">(minutes)</span></label>
            <input className="input" inputMode="numeric" placeholder="15" value={f.prep_minutes}
              onChange={e => set('prep_minutes', e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </div>
          <div>
            <label className="label">Calories <span className="font-normal text-muted">(kcal)</span></label>
            <input className="input" inputMode="numeric" placeholder="250" value={f.calories}
              onChange={e => set('calories', e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
        </div>

        <div className="mt-5">
          <div className="label">Diet & allergen tags</div>
          <div className="flex flex-wrap gap-2">
            {TAGS.map(t => {
              const on = f.tags.includes(t.id);
              return (
                <button type="button" key={t.id} onClick={() => set('tags', on ? f.tags.filter(x => x !== t.id) : [...f.tags, t.id])}
                  className={`chip ${on ? 'border-ink bg-ink text-cream' : ''}`}>{t.emoji} {t.en}</button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="label">Options <span className="font-normal text-muted">(e.g. Oat milk +₱30, Extra shot +₱40)</span></div>
          <div className="space-y-2">
            {f.options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input className="input flex-[2] py-2" placeholder="Option" value={o.name}
                  onChange={e => set('options', f.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input flex-[2] py-2" placeholder="Filipino (optional)" value={o.name_fil ?? ''}
                  onChange={e => set('options', f.options.map((x, j) => (j === i ? { ...x, name_fil: e.target.value } : x)))} />
                <input className="input flex-1 py-2" placeholder="+₱" inputMode="decimal" value={o.price}
                  onChange={e => set('options', f.options.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^0-9.]/g, '') } : x)))} />
                <button type="button" className="px-2 text-danger" onClick={() => set('options', f.options.filter((_, j) => j !== i))} aria-label="Remove option">✕</button>
              </div>
            ))}
            <button type="button" className="btn-secondary btn-sm" onClick={() => set('options', [...f.options, { name: '', name_fil: '', price: '0' }])}>+ Add option</button>
          </div>
        </div>

        <label className="mt-5 flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={f.available} onChange={e => set('available', e.target.checked)} />
          Available to order
        </label>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          <button className="btn flex-1" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save item'}</button>
        </div>
      </form>
    </div>
  );
}
