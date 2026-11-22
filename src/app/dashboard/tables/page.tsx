import { requireOwner } from '@/lib/membership';
import type { CafeTable } from '@/lib/types';
import TablesManager from './TablesManager';

export const metadata = { title: 'Tables & QR · QRave' };

export default async function TablesPage() {
  const { supabase, cafe } = await requireOwner();
  const { data } = await supabase.from('cafe_tables').select('*').eq('cafe_id', cafe.id).order('number');
  return <TablesManager cafe={cafe} initialTables={(data ?? []) as CafeTable[]} siteUrl={process.env.NEXT_PUBLIC_SITE_URL || ''} />;
}
