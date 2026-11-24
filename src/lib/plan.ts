import type { Cafe, Plan } from '@/lib/types';

export const PLAN_LABEL: Record<Plan, string> = {
  trial: 'Free trial',
  monthly: 'Monthly',
  one_time: 'One-time build',
  comp: 'Free (by QRave)',
};

/** Where an owner whose trial ended can reach QRave (e.g. an m.me or wa.me link). Optional. */
export const CONTACT_URL = process.env.NEXT_PUBLIC_QRAVE_CONTACT_URL || '';

const DAY = 86_400_000;

export interface PlanState {
  open: boolean;
  /** When access ends for a trial or monthly plan, else null. */
  endsAt: Date | null;
  /** Whole days left before access ends (0 on the last day), else null. */
  daysLeft: number | null;
  reason: 'suspended' | 'trial_over' | 'unpaid' | null;
}

/**
 * Mirrors public.cafe_open_at in the database (0006_plans.sql), which is what actually decides access.
 * A cafe row without plan columns (database not migrated yet) counts as open.
 */
export function planState(cafe: Pick<Cafe, 'status' | 'plan' | 'trial_ends_at' | 'paid_until'>, now = Date.now()): PlanState {
  if (cafe.status === 'suspended') return { open: false, endsAt: null, daysLeft: null, reason: 'suspended' };
  const plan = cafe.plan;
  if (plan !== 'trial' && plan !== 'monthly') return { open: true, endsAt: null, daysLeft: null, reason: null };
  const end = plan === 'monthly' ? cafe.paid_until ?? cafe.trial_ends_at : cafe.trial_ends_at;
  if (!end) return { open: true, endsAt: null, daysLeft: null, reason: null };
  const endsAt = new Date(end);
  const left = endsAt.getTime() - now;
  if (left <= 0) {
    return { open: false, endsAt, daysLeft: 0, reason: plan === 'monthly' && cafe.paid_until ? 'unpaid' : 'trial_over' };
  }
  return { open: true, endsAt, daysLeft: Math.floor(left / DAY), reason: null };
}

export const shortDate = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
