import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Cafe, Role } from '@/lib/types';

/** The signed-in user's cafe and role. Redirects to login/onboarding when missing. */
export const getMembership = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('cafe_members')
    .select('role, display_name, cafes(*)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data?.cafes) redirect('/onboarding');
  return { supabase, user, role: data.role as Role, cafe: data.cafes as unknown as Cafe };
});

export async function requireOwner() {
  const m = await getMembership();
  if (m.role !== 'owner') redirect('/dashboard/orders');
  return m;
}
