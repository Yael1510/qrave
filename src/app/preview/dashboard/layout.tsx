import Link from 'next/link';
import { notFound } from 'next/navigation';
import DemoProvider from '@/lib/demo/DemoProvider';
import { getDemo } from '@/lib/demo/seed';
import NavLinks from '@/app/dashboard/NavLinks';

// Development-only copy of the cafe dashboard running on sample data (see src/lib/demo).
// Add ?reset to any preview URL to reload the sample orders.
export const dynamic = 'force-dynamic';

export default async function PreviewDashboardLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const demo = await getDemo();
  const { cafe } = demo;
  const base = '/preview/dashboard';
  const links = [
    { href: `${base}/orders`, label: 'Orders', emoji: '🧾' },
    { href: `${base}/stock`, label: 'Sold out', emoji: '🚫' },
    { href: `${base}/reports`, label: 'Sales', emoji: '📈' },
    { href: `${base}/menu`, label: 'Menu', emoji: '📋' },
    { href: `${base}/tables`, label: 'Tables & QR', emoji: '🔳' },
    { href: `${base}/staff`, label: 'Staff', emoji: '👥' },
    { href: `${base}/settings`, label: 'Settings', emoji: '⚙️' },
  ];

  return (
    <DemoProvider seed={demo.seed()}>
      <div className="min-h-dvh" style={{ ['--brand' as string]: cafe.primary_color }}>
        <header className="no-print sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cafe.logo_url!} alt="" className="h-9 w-9 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{cafe.name}</div>
              <div className="text-xs text-muted">Owner</div>
            </div>
            <Link href="/preview/table/3" target="_blank" className="btn-secondary btn-sm hidden sm:inline-flex">View menu ↗</Link>
          </div>
          <NavLinks links={links} />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </div>
    </DemoProvider>
  );
}
