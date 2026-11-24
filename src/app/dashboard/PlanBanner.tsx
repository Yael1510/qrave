import type { Cafe, Role } from '@/lib/types';
import { CONTACT_URL, planState, shortDate } from '@/lib/plan';

function Contact({ children }: { children: React.ReactNode }) {
  return CONTACT_URL ? (
    <a href={CONTACT_URL} target="_blank" rel="noreferrer" className="font-semibold underline">{children}</a>
  ) : (
    <span className="font-semibold">{children}</span>
  );
}

const days = (n: number) => (n === 0 ? 'ends today' : n === 1 ? '1 day left' : `${n} days left`);

/** Trial countdown for owners, and a clear notice for everyone once the cafe is closed to customers. */
export default function PlanBanner({ cafe, role }: { cafe: Cafe; role: Role }) {
  const s = planState(cafe);

  if (!s.open) {
    const why =
      s.reason === 'suspended' ? 'Your cafe is paused.'
      : s.reason === 'unpaid' ? 'Your monthly plan has ended.'
      : 'Your free trial has ended.';
    return (
      <div className="no-print border-b border-red-200 bg-red-50 text-red-900">
        <div className="mx-auto max-w-7xl px-4 py-3 text-sm">
          <b>{why}</b> Customers can&apos;t open your menu or order right now. Your menu, tables and staff are all saved.{' '}
          {role === 'owner' ? <>To continue, <Contact>message QRave</Contact>: monthly or a one-time build, no setup fees.</> : 'Please let the owner know.'}
        </div>
      </div>
    );
  }

  if (role !== 'owner' || s.daysLeft === null || !s.endsAt) return null;
  if (cafe.plan === 'trial') {
    return (
      <div className="no-print border-b border-line bg-soft">
        <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm">
          🎁 <b>Free trial: {days(s.daysLeft)}</b> (until {shortDate(s.endsAt)}). To keep going after that,{' '}
          <Contact>message QRave</Contact>: monthly or a one-time build, no setup fees.
        </div>
      </div>
    );
  }
  if (s.daysLeft <= 3) {
    return (
      <div className="no-print border-b border-amber-200 bg-amber-50 text-amber-900">
        <div className="mx-auto max-w-7xl px-4 py-2.5 text-sm">
          Your monthly plan {s.daysLeft === 0 ? 'ends today' : `ends on ${shortDate(s.endsAt)}`}. <Contact>Message QRave</Contact> to renew.
        </div>
      </div>
    );
  }
  return null;
}
