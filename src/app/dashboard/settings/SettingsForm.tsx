'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { uploadCafeImage } from '@/lib/upload';
import type { Cafe, CafeLinks } from '@/lib/types';

const LINK_FIELDS: { key: keyof CafeLinks; label: string; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook page', placeholder: 'https://facebook.com/yourcafe' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourcafe' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourcafe' },
  { key: 'maps', label: 'Google Maps link', placeholder: 'https://maps.app.goo.gl/…' },
  { key: 'phone', label: 'Phone number', placeholder: '+63 917 123 4567' },
];

function cleanLinks(links: CafeLinks) {
  const out: CafeLinks = {};
  for (const { key } of LINK_FIELDS) {
    let v = (links[key] ?? '').trim();
    if (!v) continue;
    if (key !== 'phone' && !/^https?:\/\//i.test(v)) v = `https://${v}`;
    out[key] = v;
  }
  return out;
}

const PRESETS = ['#7a4b2a', '#2f5d50', '#1f3a5f', '#8b2e3f', '#b5651d', '#3d3d3d', '#6b4c9a', '#2f7d4f'];

export default function SettingsForm({ cafe }: { cafe: Cafe }) {
  const router = useRouter();
  const [name, setName] = useState(cafe.name);
  const [tagline, setTagline] = useState(cafe.tagline ?? '');
  const [color, setColor] = useState(cafe.primary_color);
  const [logo, setLogo] = useState(cafe.logo_url);
  const [links, setLinks] = useState<CafeLinks>(cafe.links ?? {});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setLogo(await uploadCafeImage(cafe.id, 'branding', file));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Upload failed' });
    }
    setUploading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().from('cafes')
      .update({ name: name.trim(), tagline: tagline.trim() || null, primary_color: color, logo_url: logo, links: cleanLinks(links) }).eq('id', cafe.id);
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' });
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted">Your branding on the customer menu.</p>
      </div>

      <div className="card space-y-5 p-5">
        <div className="flex items-center gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-2xl bg-soft text-3xl">☕</div>
          )}
          <div className="space-y-1">
            <label className="btn-secondary btn-sm cursor-pointer">
              {uploading ? 'Uploading…' : logo ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
            </label>
            {logo && <button type="button" className="block text-sm text-danger" onClick={() => setLogo(null)}>Remove</button>}
          </div>
        </div>
        <div>
          <label className="label">Cafe name</label>
          <input className="input" required maxLength={80} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Tagline <span className="font-normal text-muted">(optional)</span></label>
          <input className="input" maxLength={140} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Specialty coffee & all-day breakfast" />
        </div>
        <div>
          <label className="label">Brand colour</label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button type="button" key={p} onClick={() => setColor(p)} aria-label={p}
                className={`h-9 w-9 rounded-full border-2 ${color === p ? 'border-ink' : 'border-white'}`} style={{ background: p }} />
            ))}
            <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-line" />
          </div>
          <div className="mt-3 inline-flex rounded-full px-5 py-2.5 font-semibold text-white" style={{ background: color }}>Preview button</div>
        </div>
        <div>
          <div className="label">Menu link</div>
          <p className="text-sm text-muted">/c/{cafe.slug} — fixed, because it’s printed in your QR codes.</p>
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-bold">Social links</h2>
          <p className="text-sm text-muted">Shown as round icons at the top of your customer menu. Leave blank to hide.</p>
        </div>
        {LINK_FIELDS.map(f => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <input className="input" inputMode={f.key === 'phone' ? 'tel' : 'url'} placeholder={f.placeholder} maxLength={300}
              value={links[f.key] ?? ''} onChange={e => setLinks({ ...links, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>

      {msg && <p className={`text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
      <button className="btn w-full" disabled={busy || uploading}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
  );
}
