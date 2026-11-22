import { notFound } from 'next/navigation';
import menu from '../../../../supabase/seed/fresco/menu.json';
import CustomerMenu from '@/app/c/[slug]/CustomerMenu';
import type { Cafe, Category, Item, ItemOption } from '@/lib/types';

// Development-only preview of the Fre&co seed menu, so it can be checked before Supabase is set up.
export const metadata = { title: 'Fre&co · Menu preview' };

export default async function FrescoPreview({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const demo = (await searchParams).demo !== undefined; // sample badges/kcal/prep + links, to check the design
  if (process.env.NODE_ENV === 'production') notFound();

  const cafe: Cafe = {
    id: 'preview', slug: menu.cafe.slug, name: menu.cafe.name,
    logo_url: `/seed/fresco/${menu.cafe.logo}`, primary_color: menu.cafe.primary_color, currency: 'PHP', status: 'active',
    tagline: demo ? 'Friends and coffee' : menu.cafe.tagline,
    links: demo ? { maps: 'https://maps.google.com', facebook: 'https://facebook.com', instagram: 'https://instagram.com' } : {},
  };
  const categories: Category[] = menu.categories.map((c, i) => ({ id: `c${i}`, cafe_id: 'preview', name: c.name, name_fil: c.name_fil, position: i, layout: c.layout as 'list' | 'grid' }));
  const items: Item[] = menu.categories.flatMap((c, ci) =>
    c.items.map((it, ii) => {
      const x = it as typeof it & { photo?: string; name_fil?: string | null };
      return {
        id: `c${ci}-${ii}`, cafe_id: 'preview', category_id: `c${ci}`, position: ii,
        name: x.name, name_fil: x.name_fil ?? null, description: x.description, description_fil: null,
        price: x.price, photo_url: x.photo ? `/seed/fresco/${x.photo}` : null,
        tags: x.tags, options: x.options as ItemOption[], available: true,
        ...(demo && ii < 2 ? { badge: ii === 0 ? 'Best Seller' : 'Signature', calories: 250 + ii * 90, prep_minutes: 10 + ii * 5 } : {}),
      };
    }));

  return (
    <div style={{ ['--brand' as string]: cafe.primary_color }}>
      <CustomerMenu cafe={cafe} categories={categories} items={items} token={null} table={null} />
    </div>
  );
}
