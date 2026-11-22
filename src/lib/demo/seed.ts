import 'server-only';
import { cookies } from 'next/headers';
import fresco from '../../../supabase/seed/fresco/menu.json';
import cozycup from '../../../supabase/seed/demo/menu.json';
import type { Cafe, CafeTable, Category, Item, ItemOption, ItemStatus, Member, Station } from '@/lib/types';
import type { DemoDB, DemoOrder } from './store';

// Sample data for the development-only previews (/preview/dashboard, /preview/table/N):
// a cafe's menu plus made-up tables, staff and a few orders in progress.
// Two sample cafes: Fre&co (default) and Cozy Cup Cafe (set the cookie qrave-demo=cozycup).
type MenuFile = {
  cafe: { name: string; slug: string; tagline?: string | null; primary_color: string; logo: string };
  categories: { name: string; name_fil?: string | null; layout: string; station?: Station; items: { name: string; name_fil?: string | null; price: number; description: string; photo?: string; tags: string[]; options: unknown[] }[] }[];
};
type Variant = {
  id: string; menu: MenuFile; photos: string; tagline: string;
  // Seeded orders: [table, minutes ago, status, [item name, qty, line status?][], note]
  // A line's status defaults to the order's (e.g. drinks already ready while the food is still cooking).
  orders: [number, number, DemoOrder['status'], [string, number, ItemStatus?][], string | null][];
};

const VARIANTS: Record<string, Variant> = {
  fresco: {
    id: 'demo-cafe', menu: fresco as MenuFile, photos: '/seed/fresco', tagline: 'Friends and coffee',
    orders: [
      [2, 34, 'served', [['Brunch Tapa', 1], ['Americano', 2]], null],
      [4, 18, 'preparing', [['Crispy Kare-Kare', 1], ['Lychee', 1, 'ready']], null],
      [5, 12, 'ready', [['Creamy Carbonara', 2]], 'One without parmesan, please'],
      [7, 3, 'new', [['Latte', 1], ['Loaded Nachos', 1], ['Ube Cloud', 2]], null],
    ],
  },
  cozycup: {
    id: 'demo-cozycup', menu: cozycup as MenuFile, photos: '/seed/demo', tagline: 'Slow coffee. Warm welcome.',
    orders: [
      [2, 34, 'served', [['Americano', 1], ['Ensaymada', 2]], null],
      [4, 18, 'preparing', [['Oat Flat White', 1, 'ready'], ['Sourdough Toastie', 1]], null],
      [5, 12, 'ready', [['Iced Ube Latte', 2]], 'One with oat milk, please'],
      [7, 3, 'new', [['Café Latte', 1], ['Butter Croissant', 1]], null],
    ],
  },
};

function build(v: Variant) {
  const { menu, id: cafeId } = v;
  const cafe: Cafe = {
    id: cafeId, slug: menu.cafe.slug, name: menu.cafe.name, tagline: v.tagline,
    logo_url: `${v.photos}/${menu.cafe.logo}`, primary_color: menu.cafe.primary_color, currency: 'PHP', status: 'active',
    links: { maps: 'https://maps.google.com', facebook: 'https://facebook.com', instagram: 'https://instagram.com' },
  };
  const categories: Category[] = menu.categories.map((c, i) => ({
    id: `cat-${i}`, cafe_id: cafeId, name: c.name, name_fil: c.name_fil ?? null, position: i, layout: c.layout as 'list' | 'grid',
    station: c.station ?? 'kitchen',
  }));
  const items: Item[] = menu.categories.flatMap((c, ci) => c.items.map((x, ii) => ({
    id: `item-${ci}-${ii}`, cafe_id: cafeId, category_id: `cat-${ci}`, position: ii,
    name: x.name, name_fil: x.name_fil ?? null, description: x.description, description_fil: null,
    price: x.price, photo_url: x.photo ? `${v.photos}/${x.photo}` : null,
    tags: x.tags, options: x.options as ItemOption[], available: true,
    ...(ii < 2 ? { badge: ii === 0 ? 'Best Seller' : 'Signature', calories: 250 + ii * 90, prep_minutes: 10 + ii * 5 } : {}),
  })));
  const tables: CafeTable[] = Array.from({ length: 8 }, (_, i) => ({
    id: `table-${i + 1}`, cafe_id: cafeId, number: i + 1, label: i === 7 ? 'Patio' : null, token: `demo-t${i + 1}`, active: true,
  }));
  const joined = new Date(Date.now() - 30 * 86400e3).toISOString();
  const domain = `${menu.cafe.slug}.demo`;
  const members: Member[] = [
    { cafe_id: cafeId, user_id: 'demo-owner', role: 'owner', display_name: 'Owner', email: `owner@${domain}`, created_at: joined },
    { cafe_id: cafeId, user_id: 'demo-staff-1', role: 'staff', display_name: 'Jessa', email: `jessa@${domain}`, created_at: joined },
    { cafe_id: cafeId, user_id: 'demo-staff-2', role: 'staff', display_name: 'Paolo', email: `paolo@${domain}`, created_at: joined },
  ];

  /** The whole demo database, with orders timed relative to now. */
  const seed = (): DemoDB => {
    const now = Date.now();
    const ago = (min: number) => new Date(now - min * 60000).toISOString();
    const byName = (n: string) => items.find(i => i.name === n) ?? items[0];
    const sessions = v.orders.map(([n, min]) => ({ id: `sess-${n}`, cafe_id: cafeId, table_id: `table-${n}`, status: 'open' as const, opened_at: ago(min + 6), closed_at: null }));
    let number = 40;
    const orders: DemoOrder[] = v.orders.map(([table, min, status, lines, note]) => {
      number += 1;
      const fromOrder: ItemStatus = status === 'preparing' ? 'preparing' : status === 'ready' || status === 'served' ? 'ready' : 'new';
      const order_items = lines.map(([name, qty, lineStatus], k) => {
        const it = byName(name);
        const station = categories.find(c => c.id === it.category_id)?.station ?? 'kitchen';
        return { id: `oi-${number}-${k}`, name: it.name, unit_price: Number(it.price), qty, options: [], station, status: lineStatus ?? fromOrder };
      });
      return {
        id: `order-${number}`, cafe_id: cafeId, table_id: `table-${table}`, session_id: `sess-${table}`, number, status, note,
        total: order_items.reduce((s, l) => s + l.unit_price * l.qty, 0), created_at: ago(min), updated_at: ago(min), order_items,
      };
    });
    return {
      seededAt: now, nextOrder: number + 1, cafes: [cafe], categories, items, cafe_tables: tables, cafe_members: members,
      table_sessions: sessions, orders,
      service_requests: [{ id: 'req-1', cafe_id: cafeId, table_id: 'table-5', kind: 'waiter', status: 'open', created_at: ago(2) }],
    };
  };
  return { cafeId, cafe, categories, items, tables, members, seed };
}

/** The sample cafe for this request: Cozy Cup Cafe when the qrave-demo cookie says so, otherwise Fre&co. */
export async function getDemo() {
  const pick = (await cookies()).get('qrave-demo')?.value;
  return build(VARIANTS[pick ?? ''] ?? VARIANTS.fresco);
}
