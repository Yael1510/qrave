import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Cafe, Category, Item } from '@/lib/types';
import { planState } from '@/lib/plan';
import CustomerMenu from './CustomerMenu';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> };

async function loadCafe(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('cafes').select('*').eq('slug', slug.toLowerCase()).eq('status', 'active').maybeSingle();
  // An owner signed in on this phone can still read their own closed cafe; customers get nothing back.
  const cafe = data && planState(data as Cafe).open ? (data as Cafe) : null;
  return { supabase, cafe };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cafe } = await loadCafe((await params).slug);
  return { title: cafe ? `${cafe.name} · Menu` : 'Menu' };
}

export default async function CafeMenuPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { t: token } = await searchParams;
  const { supabase, cafe } = await loadCafe(slug);
  if (!cafe) {
    // The trial or paid month ran out, or QRave paused the cafe: say so instead of a 404.
    const { data: closed } = await supabase.rpc('cafe_closed', { p_slug: slug });
    if (closed) return <Paused />;
    notFound();
  }

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

function Paused() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div className="max-w-sm">
        <div className="text-5xl">☕</div>
        <h1 className="mt-4 text-2xl font-bold">QR ordering is paused</h1>
        <p className="mt-2 text-muted">This cafe isn&apos;t taking orders through QR right now. Please order at the counter or ask a staff member.</p>
        <p className="mt-6 text-sm text-muted">Hindi muna available ang QR ordering. Mag-order po sa counter o magtanong sa staff.</p>
      </div>
    </main>
  );
}
