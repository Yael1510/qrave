import { requireOwner } from '@/lib/membership';
import type { Category, Item } from '@/lib/types';
import MenuEditor from './MenuEditor';

export const metadata = { title: 'Menu · QRave' };

export default async function MenuPage() {
  const { supabase, cafe } = await requireOwner();
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('cafe_id', cafe.id).order('position'),
    supabase.from('items').select('*').eq('cafe_id', cafe.id).order('position'),
  ]);
  return <MenuEditor cafe={cafe} initialCategories={(categories ?? []) as Category[]} initialItems={(items ?? []) as Item[]} />;
}
