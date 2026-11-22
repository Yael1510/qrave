import Link from 'next/link';
import { getMembership } from '@/lib/membership';
import NavLinks from './NavLinks';
import SignOutButton from './SignOutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { cafe, role } = await getMembership();
  const links = [
    { href: '/dashboard/orders', label: 'Orders', emoji: '🧾' },
    { href: '/dashboard/stock', label: 'Sold out', emoji: '🚫' },
    ...(role === 'owner'
      ? [
          { href: '/dashboard/menu', label: 'Menu', emoji: '📋' },
          { href: '/dashboard/tables', label: 'Tables & QR', emoji: '🔳' },
          { href: '/dashboard/staff', label: 'Staff', emoji: '👥' },
          { href: '/dashboard/settings', label: 'Settings', emoji: '⚙️' },
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh" style={{ ['--brand' as string]: cafe.primary_color }}>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          {cafe.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cafe.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-soft">☕</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{cafe.name}</div>
            <div className="text-xs text-muted capitalize">{role}</div>
          </div>
          <Link href={`/c/${cafe.slug}`} target="_blank" className="btn-secondary btn-sm hidden sm:inline-flex">View menu ↗</Link>
          <SignOutButton />
        </div>
        <NavLinks links={links} />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
