'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/membership';
import { createAdminClient } from '@/lib/supabase/server';

export type ActionResult = { ok: boolean; message: string };

export async function addStaff(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { cafe } = await requireOwner();
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: 'Enter a name and a valid email.' };
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) {
    const taken = error?.message.toLowerCase().includes('already');
    return { ok: false, message: taken ? 'That email already has an account.' : error?.message ?? 'Could not create the account.' };
  }
  const { error: memberError } = await admin.from('cafe_members')
    .insert({ cafe_id: cafe.id, user_id: data.user.id, role: 'staff', display_name: name, email });
  if (memberError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, message: memberError.message };
  }
  revalidatePath('/dashboard/staff');
  return { ok: true, message: `${name} can now log in with ${email}.` };
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const { cafe, user } = await requireOwner();
  if (userId === user.id) return { ok: false, message: 'You can’t remove yourself.' };
  const admin = createAdminClient();
  // Only staff of *this* cafe can be removed.
  const { data: member } = await admin.from('cafe_members').select('role')
    .eq('cafe_id', cafe.id).eq('user_id', userId).maybeSingle();
  if (!member || member.role !== 'staff') return { ok: false, message: 'Staff member not found.' };
  await admin.auth.admin.deleteUser(userId); // also removes the membership (cascade)
  revalidatePath('/dashboard/staff');
  return { ok: true, message: 'Staff account removed.' };
}

export async function resetStaffPassword(userId: string, password: string): Promise<ActionResult> {
  const { cafe } = await requireOwner();
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  const admin = createAdminClient();
  const { data: member } = await admin.from('cafe_members').select('role')
    .eq('cafe_id', cafe.id).eq('user_id', userId).maybeSingle();
  if (!member || member.role !== 'staff') return { ok: false, message: 'Staff member not found.' };
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Password updated.' };
}
