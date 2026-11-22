import { requireOwner } from '@/lib/membership';
import type { Member } from '@/lib/types';
import StaffManager from './StaffManager';

export const metadata = { title: 'Staff · QRave' };

export default async function StaffPage() {
  const { supabase, cafe, user } = await requireOwner();
  const { data } = await supabase.from('cafe_members').select('*').eq('cafe_id', cafe.id).order('created_at');
  return <StaffManager members={(data ?? []) as Member[]} currentUserId={user.id} />;
}
