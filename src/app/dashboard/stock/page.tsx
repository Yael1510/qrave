import { getMembership } from '@/lib/membership';
import type { Category, Item } from '@/lib/types';
import StockList from './StockList';

export const metadata = { title: 'Sold out · QRave' };

export default async function StockPage() {
  const { supabase, cafe } = await getMembership();
  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase.from('categories').select('*').eq('cafe_id', cafe.id).order('position'),
    supabase.from('items').select('*').eq('cafe_id', cafe.id).order('position'),
  ]);
  return <StockList categories={(categories ?? []) as Category[]} initialItems={(items ?? []) as Item[]} />;
}
