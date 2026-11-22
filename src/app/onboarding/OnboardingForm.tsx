'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { slugify } from '@/lib/format';

export default function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [tables, setTables] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugEdited ? slug : slugify(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (effectiveSlug.length < 3) return setError('The link needs at least 3 letters or numbers.');
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('create_cafe', { p_name: name, p_slug: effectiveSlug, p_tables: tables });
    if (error) {
      setError(error.message.includes('cafes_slug_check') ? 'Use only lowercase letters, numbers and dashes.' : error.message);
      setBusy(false);
      return;
    }
    router.push('/dashboard/menu');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <div className="text-4xl">☕</div>
        <h1 className="mt-3 text-2xl font-bold">Set up your cafe</h1>
        <p className="mt-1 text-muted">You can change the name, logo and colours later.</p>
      </div>
      <div>
        <label className="label" htmlFor="name">Cafe name</label>
        <input id="name" className="input" required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Kape Uno" />
      </div>
      <div>
        <label className="label" htmlFor="slug">Menu link</label>
        <div className="flex items-center rounded-xl border border-line bg-white focus-within:border-brand">
          <span className="pl-4 text-sm text-muted">/c/</span>
          <input id="slug" className="w-full rounded-xl bg-transparent px-1 py-3 outline-none" required value={effectiveSlug}
            onChange={e => { setSlugEdited(true); setSlug(slugify(e.target.value)); }} placeholder="kape-uno" />
        </div>
        <p className="mt-1 text-xs text-muted">This goes into your QR codes, so pick it carefully.</p>
      </div>
      <div>
        <label className="label" htmlFor="tables">Number of tables</label>
        <input id="tables" className="input" type="number" min={1} max={200} required value={tables} onChange={e => setTables(Number(e.target.value))} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn w-full" disabled={busy || !name}>{busy ? 'Creating…' : 'Create cafe'}</button>
    </form>
  );
}
