import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Cafe, Category, Item } from '@/lib/types';
import CustomerMenu from './CustomerMenu';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

async function loadCafe(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('cafes').select('*').eq('slug', slug.toLowerCase()).eq('status', 'active').maybeSingle();
  return { supabase, cafe: data as Cafe | null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cafe } = await loadCafe((await params).slug);
  return { title: cafe ? `${cafe.name} · Menu` : 'Menu' };
}

export default async function CafeMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { t: token } = await searchParams;
  const { supabase, cafe } = await loadCafe(slug);
  if (!cafe) notFound();

  const [{ data: categories }, { data: items }, tableRes] = await Promise.all([
    supabase.from('categories').select('*').eq('cafe_id', cafe.id).order('position'),
    supabase.from('items').select('*').eq('cafe_id', cafe.id).order('position'),
    token ? supabase.rpc('resolve_table', { p_slug: cafe.slug, p_token: token }) : Promise.resolve({ data: null }),
  ]);
  const table = (tableRes.data as { table_number: number; table_label: string | null }[] | null)?.[0] ?? null;

  return (
    <div style={{ ['--brand' as string]: cafe.primary_color }}>
      <CustomerMenu
        cafe={cafe}
        categories={(categories ?? []) as Category[]}
        items={(items ?? []) as Item[]}
        token={table ? token! : null}
        table={table ? { number: table.table_number, label: table.table_label } : null}
      />
    </div>
  );
}
