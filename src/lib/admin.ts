import 'server-only';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** QRave staff who can open /admin: comma-separated emails in ADMIN_EMAILS (server-only, set in Vercel). */
export function isPlatformAdmin(email: string | null | undefined) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** The signed-in QRave admin, or a 404 for everyone else (so the page doesn't advertise itself). */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) notFound();
  return user;
}
