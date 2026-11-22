'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import { TAGS, errorText, t as strings, type Lang } from '@/lib/i18n';
import type { Cafe, Category, Item, OrderStatus } from '@/lib/types';
import { ChevronDownIcon, ClockIcon, FacebookIcon, FlameIcon, InstagramIcon, MapPinIcon, MenuIcon, PhoneIcon, TiktokIcon } from '@/components/Icons';

function Meta({ item, inline }: { item: Item; inline?: boolean }) {
  if (!item.calories && !item.prep_minutes) return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted ${inline ? 'flex-none' : 'mt-1'}`}>
      {item.calories ? <span className="flex items-center gap-0.5"><FlameIcon />{item.calories} kcal</span> : null}
      {item.calories && item.prep_minutes ? <span className="h-3 w-px bg-line" /> : null}
      {item.prep_minutes ? <span className="flex items-center gap-0.5"><ClockIcon />{item.prep_minutes} min</span> : null}
    </div>
  );
}

type CartLine = { key: string; item_id: string; qty: number; options: string[] };
type TabOrder = { id: string; number: number; status: OrderStatus; total: number; created_at: string;
  items: { name: string; qty: number; unit_price: number; options: { name: string }[] }[] };
type TableStatus = { session: { id: string; status: 'open' | 'paid' } | null; orders: TabOrder[]; requests: { kind: 'waiter' | 'bill' }[] };

const STEP: Record<OrderStatus, number> = { new: 1, preparing: 2, ready: 3, served: 4, cancelled: 0 };
const PILL: Record<OrderStatus, string> = {
  new: 'bg-amber-100 text-amber-800', preparing: 'bg-blue-100 text-blue-800', ready: 'bg-green-100 text-green-800',
  served: 'bg-soft text-muted', cancelled: 'bg-red-100 text-danger',
};

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setValue(JSON.parse(raw)); } catch {}
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

export default function CustomerMenu({ cafe, categories, items, token, table }: {
  cafe: Cafe; categories: Category[]; items: Item[]; token: string | null; table: { number: number; label: string | null } | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lang, setLang] = useStored<Lang>('lang', 'en');
  const s = strings(lang);
  const [cart, setCart] = useStored<CartLine[]>(`cart:${cafe.slug}:${token ?? 'none'}`, []);
  const [filters, setFilters] = useState<string[]>([]);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [status, setStatus] = useState<TableStatus | null>(null);
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const [catsOpen, setCatsOpen] = useState(false);

  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const nameOf = (x: { name: string; name_fil?: string | null }) => (lang === 'fil' && x.name_fil ? x.name_fil : x.name);
  const descOf = (i: Item) => (lang === 'fil' && i.description_fil ? i.description_fil : i.description);
  const linePrice = (l: CartLine) => {
    const it = itemById.get(l.item_id);
    if (!it) return 0;
    return (Number(it.price) + l.options.reduce((sum, o) => sum + Number(it.options.find(x => x.name === o)?.price ?? 0), 0)) * l.qty;
  };
  const validCart = cart.filter(l => itemById.get(l.item_id)?.available);
  const cartCount = validCart.reduce((n, l) => n + l.qty, 0);
  const cartTotal = validCart.reduce((n, l) => n + linePrice(l), 0);

  const visible = (i: Item) => filters.every(f => {
    const tag = TAGS.find(t => t.id === f);
    return tag?.filter === 'not' ? !i.tags.includes(f) : i.tags.includes(f);
  });
  const usedTags = TAGS.filter(t => t.filter && items.some(i => i.tags.includes(t.id)));

  // Poll the table's tab so customers see status changes without refreshing.
  const refresh = useCallback(async () => {
    if (!token) return;
    const { data } = await supabase.rpc('table_status', { p_slug: cafe.slug, p_token: token });
    if (data) setStatus(data as TableStatus);
  }, [supabase, cafe.slug, token]);
  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', refresh); };
  }, [refresh]);

  // Highlight the category tab for the section in view.
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActiveCat(e.target.id.replace('cat-', ''));
    }, { rootMargin: '-90px 0px -70% 0px' });
    document.querySelectorAll('[id^="cat-"]').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [filters]);

  function addToCart(item: Item, qty: number, options: string[]) {
    const key = `${item.id}|${[...options].sort().join(',')}`;
    setCart(prev => {
      const existing = prev.find(l => l.key === key);
      if (existing) return prev.map(l => (l.key === key ? { ...l, qty: Math.min(50, l.qty + qty) } : l));
      return [...prev, { key, item_id: item.id, qty, options }];
    });
    setOpenItem(null);
  }

  async function callService(kind: 'waiter' | 'bill') {
    if (!token) return;
    await supabase.rpc('request_service', { p_slug: cafe.slug, p_token: token, p_kind: kind });
    refresh();
  }

  const tabOrders = status?.orders ?? [];
  const tabTotal = tabOrders.filter(o => o.status !== 'cancelled').reduce((n, o) => n + Number(o.total), 0);
  const requested = (k: 'waiter' | 'bill') => status?.requests.some(r => r.kind === k);

  const links = cafe.links ?? {};
  const social = [
    links.maps && { href: links.maps, label: 'Location', icon: <MapPinIcon /> },
    links.phone && { href: `tel:${links.phone.replace(/[^\d+]/g, '')}`, label: 'Call', icon: <PhoneIcon /> },
    links.facebook && { href: links.facebook, label: 'Facebook', icon: <FacebookIcon /> },
    links.instagram && { href: links.instagram, label: 'Instagram', icon: <InstagramIcon /> },
    links.tiktok && { href: links.tiktok, label: 'TikTok', icon: <TiktokIcon /> },
  ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode }[];
  const jump = (id: string) => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-dvh pb-32" style={{ background: 'color-mix(in srgb, var(--brand) 7%, #f6f0e9)' }}>
      <div className="mx-auto max-w-2xl">
      {/* Hero */}
      <header className="px-4 pt-4 pb-5" style={{ background: 'color-mix(in srgb, var(--brand) 14%, #efe6dc)' }}>
        <div className="flex items-center justify-end gap-2">
          {social.map(x => (
            <a key={x.label} href={x.href} target={x.href.startsWith('tel:') ? undefined : '_blank'} rel="noreferrer" aria-label={x.label}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink shadow-sm">{x.icon}</a>
          ))}
        </div>
        {cafe.tagline && <p className="mt-3 text-center text-[11px] font-medium tracking-[0.18em] text-ink/70 uppercase">{cafe.tagline}</p>}
        <div className={`flex items-center gap-3 ${cafe.tagline ? 'mt-3' : 'mt-4'}`}>
          {cafe.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logo_url} alt="" className="h-16 w-16 rounded-2xl object-cover shadow-sm" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-2xl">☕</div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl leading-tight font-bold tracking-tight">{cafe.name}</h1>
            {!cafe.tagline && <p className="mt-0.5 text-xs text-ink/70">{s.tagline}</p>}
          </div>
          <label className="relative flex-none">
            <span className="sr-only">Language</span>
            <select value={lang} onChange={e => setLang(e.target.value as Lang)}
              className="appearance-none rounded-full bg-white py-2 pr-8 pl-4 text-sm font-semibold shadow-sm outline-none">
              <option value="en">English</option>
              <option value="fil">Filipino</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
          </label>
        </div>

        {table ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-cream">🪑 {table.label || `${s.table} ${table.number}`}</span>
            <button onClick={() => callService('waiter')} disabled={requested('waiter')} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">🙋 {s.callWaiter}</button>
            <button onClick={() => callService('bill')} disabled={requested('bill')} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">🧾 {s.askBill}</button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-white/80 p-4 text-sm">
            <strong>{s.scanTitle}</strong>
            <div className="mt-1 text-muted">{s.scanBody}</div>
          </div>
        )}
        {(requested('waiter') || requested('bill')) && (
          <div className="mt-3 rounded-2xl bg-green-50 p-3 text-sm text-green-900">
            {requested('waiter') && <div>🙋 {s.waiterComing}</div>}
            {requested('bill') && <div>🧾 {s.billComing}</div>}
          </div>
        )}
      </header>

      {/* Category tabs */}
      <nav className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="flex items-center">
          <button onClick={() => setCatsOpen(true)} className="grid h-12 w-12 flex-none place-items-center text-ink" aria-label="All categories">
            <MenuIcon />
          </button>
          <div className="flex gap-5 overflow-x-auto pr-4 [scrollbar-width:none]">
            {categories.map(c => (
              <button key={c.id} onClick={() => jump(c.id)}
                className={`border-b-2 py-3 text-[15px] font-semibold whitespace-nowrap transition ${activeCat === c.id ? 'border-brand text-brand' : 'border-transparent text-ink/80'}`}>
                {nameOf(c)}
              </button>
            ))}
          </div>
        </div>
        {usedTags.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2 [scrollbar-width:none]">
            {usedTags.map(tag => {
              const on = filters.includes(tag.id);
              const label = tag.filter === 'not' ? s.nutFree : tag[lang];
              return (
                <button key={tag.id} onClick={() => setFilters(on ? filters.filter(f => f !== tag.id) : [...filters, tag.id])}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white'}`}>
                  {tag.filter === 'not' ? '🚫🥜' : tag.emoji} {label}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Running tab */}
      {tabOrders.length > 0 && (
        <section className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{s.tableTab}</h2>
            <span className="text-sm font-semibold">{s.tabTotal}: {money(tabTotal, cafe.currency)}</span>
          </div>
          {status?.session?.status === 'paid' && <p className="mt-2 text-sm font-semibold text-ok">✅ {s.paid}</p>}
          <div className="mt-2 divide-y divide-line">
            {tabOrders.map(o => (
              <div key={o.id} className="py-3">
                <div className="flex items-center justify-between">
                  <strong>#{o.number}</strong>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${PILL[o.status]}`}>{s.status[o.status]}</span>
                </div>
                {o.status !== 'cancelled' && (
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4].map(n => <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= STEP[o.status] ? 'bg-brand' : 'bg-line'}`} />)}
                  </div>
                )}
                <div className="mt-1.5 text-xs text-muted">{o.items.map(i => `${i.qty}× ${i.name}`).join(', ')} · {money(o.total, cafe.currency)}</div>
              </div>
            ))}
          </div>
          {status?.session?.status === 'open' && <p className="mt-1 text-xs text-muted">{s.orderMore}</p>}
        </section>
      )}

      {/* Menu */}
      {categories.map(c => {
        const list = items.filter(i => i.category_id === c.id && visible(i));
        if (!list.length) return null;
        const grid = c.layout === 'grid';
        return (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-28 px-4">
            <h2 className="mt-7 mb-3 text-2xl font-bold tracking-tight">{nameOf(c)}</h2>
            <div className={grid ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
              {list.map(item => {
                const inCart = validCart.filter(l => l.item_id === item.id).reduce((n, l) => n + l.qty, 0);
                const plus = item.available && token && (
                  <span className={`absolute grid h-8 min-w-8 place-items-center rounded-full px-1 text-sm font-bold text-white shadow ${grid ? 'top-2 right-2' : '-right-1 -bottom-1'} ${inCart ? 'bg-ink' : 'bg-brand'}`}>
                    {inCart || '+'}
                  </span>
                );
                const photo = (cls: string) => item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" loading="lazy" className={`${cls} object-cover`} />
                ) : (
                  <div className={`${cls} grid place-items-center bg-soft text-3xl`}>🍽️</div>
                );
                const ribbon = item.badge && (
                  <span className="absolute right-0 rounded-l-md bg-[#c8372d] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-sm">{item.badge}</span>
                );
                const soldOut = !item.available && (
                  <span className="absolute inset-0 grid place-items-center bg-white/60 text-sm font-bold text-danger">{s.soldOut}</span>
                );
                const dietIcons = item.tags.map(tg => {
                  const tag = TAGS.find(x => x.id === tg);
                  return tag ? <span key={tg} title={tag[lang]} className="text-xs">{tag.emoji}</span> : null;
                });

                return grid ? (
                  <button key={item.id} disabled={!item.available} onClick={() => setOpenItem(item)}
                    className="flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm disabled:cursor-default">
                    <div className="relative">
                      {photo('aspect-[4/3] w-full')}
                      {ribbon && <div className="absolute right-0 bottom-2">{ribbon}</div>}
                      {plus}
                      {soldOut}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <div className="leading-snug font-semibold">{nameOf(item)}</div>
                      <Meta item={item} />
                      <div className="mt-auto flex items-center gap-1 pt-1.5">
                        <span className="font-bold">{money(item.price, cafe.currency)}</span>
                        {dietIcons}
                      </div>
                    </div>
                  </button>
                ) : (
                  <button key={item.id} disabled={!item.available} onClick={() => setOpenItem(item)}
                    className="relative flex w-full gap-3 overflow-hidden rounded-2xl bg-white p-2.5 text-left shadow-sm disabled:cursor-default">
                    {ribbon && <div className="absolute top-0 right-0 [&>span]:rounded-l-none [&>span]:rounded-bl-md">{ribbon}</div>}
                    <div className="relative flex-none">
                      {photo('h-[92px] w-[92px] rounded-xl')}
                      {plus}
                      {soldOut && <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/60 text-xs font-bold text-danger">{s.soldOut}</span>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col py-0.5 pr-1">
                      <div className={`leading-snug font-semibold ${item.badge ? 'pr-20' : ''}`}>{nameOf(item)}</div>
                      {descOf(item) && <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{descOf(item)}</div>}
                      <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                        <span className="flex items-center gap-1"><span className="font-bold">{money(item.price, cafe.currency)}</span>{dietIcons}</span>
                        <Meta item={item} inline />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {filters.length > 0 && !items.some(visible) && <p className="px-4 py-10 text-center text-muted">{s.noMatches}</p>}
      </div>

      {catsOpen && (
        <Sheet onClose={() => setCatsOpen(false)}>
          <h3 className="text-xl font-bold">{s.menu}</h3>
          <div className="mt-3 divide-y divide-line">
            {categories.map(c => {
              const n = items.filter(i => i.category_id === c.id).length;
              return (
                <button key={c.id} onClick={() => { setCatsOpen(false); setTimeout(() => jump(c.id), 50); }}
                  className="flex w-full items-center justify-between py-3 text-left">
                  <span className={`font-semibold ${activeCat === c.id ? 'text-brand' : ''}`}>{nameOf(c)}</span>
                  <span className="text-sm text-muted">{n}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {/* Cart bar */}
      {token && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-cream via-cream/90 to-transparent px-4 pt-6 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button onClick={() => setCartOpen(true)} className="btn mx-auto flex w-full max-w-2xl justify-between shadow-lg">
            <span className="rounded-full bg-white/20 px-2.5 py-0.5">{cartCount}</span>
            <span>{s.viewOrder}</span>
            <span>{money(cartTotal, cafe.currency)}</span>
          </button>
        </div>
      )}

      {openItem && (
        <ItemSheet item={openItem} lang={lang} currency={cafe.currency} canOrder={!!token}
          onClose={() => setOpenItem(null)} onAdd={addToCart} />
      )}
      {cartOpen && token && (
        <CartSheet cafe={cafe} token={token} lines={validCart} itemById={itemById} lang={lang} linePrice={linePrice} total={cartTotal}
          setCart={setCart} onClose={() => setCartOpen(false)}
          onSent={n => { setCart([]); setCartOpen(false); setSent(n); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
      )}
      {sent !== null && (
        <Sheet onClose={() => setSent(null)}>
          <div className="py-4 text-center">
            <div className="text-5xl">🎉</div>
            <h3 className="mt-3 text-xl font-bold">{s.sent} #{sent}</h3>
            <p className="mt-1 text-muted">{s.sentBody}</p>
            <button className="btn mt-5 w-full" onClick={() => setSent(null)}>{s.backToMenu}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="animate-sheet relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))]">
        <button onClick={onClose} className="absolute top-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-soft" aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}

function ItemSheet({ item, lang, currency, canOrder, onClose, onAdd }: {
  item: Item; lang: Lang; currency: string; canOrder: boolean; onClose: () => void; onAdd: (i: Item, qty: number, opts: string[]) => void;
}) {
  const s = strings(lang);
  const [qty, setQty] = useState(1);
  const [opts, setOpts] = useState<string[]>([]);
  const unit = Number(item.price) + opts.reduce((n, o) => n + Number(item.options.find(x => x.name === o)?.price ?? 0), 0);
  const name = lang === 'fil' && item.name_fil ? item.name_fil : item.name;
  const desc = lang === 'fil' && item.description_fil ? item.description_fil : item.description;

  return (
    <Sheet onClose={onClose}>
      {item.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photo_url} alt="" className="-mx-5 -mt-5 mb-4 aspect-[4/3] w-[calc(100%+40px)] max-w-none rounded-t-3xl object-cover" />
      )}
      <h3 className="pr-10 text-2xl font-bold">{name}</h3>
      {desc && <p className="mt-1 text-muted">{desc}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="font-bold">{money(item.price, currency)}</span>
        {item.badge && <span className="rounded-md bg-[#c8372d] px-2 py-0.5 text-xs font-semibold text-white">{item.badge}</span>}
        <Meta item={item} inline />
      </div>
      {item.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.map(tg => {
            const tag = TAGS.find(x => x.id === tg);
            return tag ? <span key={tg} className="rounded-full bg-soft px-2.5 py-1 text-xs font-semibold">{tag.emoji} {tag[lang]}</span> : null;
          })}
        </div>
      )}
      {item.options.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-semibold text-muted">{s.options}</div>
          {item.options.map(o => (
            <label key={o.name} className="flex items-center gap-3 border-b border-line py-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={opts.includes(o.name)}
                onChange={e => setOpts(e.target.checked ? [...opts, o.name] : opts.filter(x => x !== o.name))} />
              <span className="flex-1">{lang === 'fil' && o.name_fil ? o.name_fil : o.name}</span>
              {Number(o.price) > 0 && <span className="text-sm text-muted">+{money(o.price, currency)}</span>}
            </label>
          ))}
        </div>
      )}
      {canOrder && (
        <div className="mt-5 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-soft p-1">
            <button className="h-9 w-9 rounded-full bg-white text-lg font-bold" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">−</button>
            <span className="w-7 text-center font-bold">{qty}</span>
            <button className="h-9 w-9 rounded-full bg-white text-lg font-bold" onClick={() => setQty(Math.min(50, qty + 1))} aria-label="More">+</button>
          </div>
          <button className="btn flex-1" onClick={() => onAdd(item, qty, opts)}>{s.add} · {money(unit * qty, currency)}</button>
        </div>
      )}
    </Sheet>
  );
}

function CartSheet({ cafe, token, lines, itemById, lang, linePrice, total, setCart, onClose, onSent }: {
  cafe: Cafe; token: string; lines: CartLine[]; itemById: Map<string, Item>; lang: Lang; linePrice: (l: CartLine) => number; total: number;
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>; onClose: () => void; onSent: (orderNumber: number) => void;
}) {
  const s = strings(lang);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!lines.length) onClose(); }, [lines.length, onClose]);

  const changeQty = (key: string, d: number) =>
    setCart(prev => prev.flatMap(l => (l.key !== key ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: Math.min(50, l.qty + d) }])));

  async function place() {
    setBusy(true);
    setError(null);
    const { data, error } = await createClient().rpc('place_order', {
      p_slug: cafe.slug, p_token: token, p_note: note,
      p_items: lines.map(l => ({ item_id: l.item_id, qty: l.qty, options: l.options })),
    });
    setBusy(false);
    if (error) return setError(errorText(s, error.message));
    onSent((data as { number: number }).number);
  }

  return (
    <Sheet onClose={onClose}>
      <h3 className="text-2xl font-bold">{s.yourOrder}</h3>
      <div className="mt-3 divide-y divide-line">
        {lines.map(l => {
          const it = itemById.get(l.item_id)!;
          return (
            <div key={l.key} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{lang === 'fil' && it.name_fil ? it.name_fil : it.name}</div>
                {l.options.length > 0 && <div className="text-xs text-muted">{l.options.join(', ')}</div>}
                <div className="text-sm text-muted">{money(linePrice(l), cafe.currency)}</div>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-soft p-1">
                <button className="h-8 w-8 rounded-full bg-white font-bold" onClick={() => changeQty(l.key, -1)} aria-label="Less">−</button>
                <span className="w-6 text-center font-bold">{l.qty}</span>
                <button className="h-8 w-8 rounded-full bg-white font-bold" onClick={() => changeQty(l.key, 1)} aria-label="More">+</button>
              </div>
            </div>
          );
        })}
      </div>
      <textarea className="input mt-3" rows={2} maxLength={300} placeholder={s.notePlaceholder} value={note} onChange={e => setNote(e.target.value)} />
      <div className="mt-4 flex justify-between text-lg font-bold"><span>{s.total}</span><span>{money(total, cafe.currency)}</span></div>
      <p className="mt-1 text-xs text-muted">{s.payNote}</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button className="btn mt-4 w-full" onClick={place} disabled={busy}>{busy ? s.sending : s.placeOrder}</button>
    </Sheet>
  );
}
