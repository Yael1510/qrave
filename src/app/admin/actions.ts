'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

const DAY = 86_400_000;

function addMonth(from: Date) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}

export type PlanAction = 'trial7' | 'paid_month' | 'one_time' | 'comp' | 'pause' | 'unpause';

/** One button on /admin. Runs with the secret key, which is the only way to change a plan (see 0006_plans.sql). */
export async function changePlan(formData: FormData) {
  await requirePlatformAdmin();
  const id = String(formData.get('cafe') || '');
  const action = String(formData.get('action') || '') as PlanAction;
  const db = createAdminClient();
  const { data: cafe, error } = await db.from('cafes').select('plan, trial_ends_at, paid_until').eq('id', id).single();
  if (error || !cafe) throw new Error('Cafe not found');

  const now = Date.now();
  let patch: Record<string, unknown>;
  switch (action) {
    case 'trial7': {
      // Seven more days from whichever is later: today or the current trial end.
      const base = Math.max(now, new Date(cafe.trial_ends_at).getTime());
      patch = { plan: 'trial', trial_ends_at: new Date(base + 7 * DAY).toISOString() };
      break;
    }
    case 'paid_month': {
      // A payment adds a month after whatever they already have (unused trial days or a paid month).
      const current = cafe.plan === 'monthly' ? cafe.paid_until ?? cafe.trial_ends_at : cafe.plan === 'trial' ? cafe.trial_ends_at : null;
      const base = new Date(Math.max(now, current ? new Date(current).getTime() : 0));
      patch = { plan: 'monthly', paid_until: addMonth(base).toISOString() };
      break;
    }
    case 'one_time': patch = { plan: 'one_time' }; break;
    case 'comp': patch = { plan: 'comp' }; break;
    case 'pause': patch = { status: 'suspended' }; break;
    case 'unpause': patch = { status: 'active' }; break;
    default: throw new Error('Unknown action');
  }
  const { error: upErr } = await db.from('cafes').update(patch).eq('id', id);
  if (upErr) throw new Error(upErr.message);
  revalidatePath('/admin');
}
