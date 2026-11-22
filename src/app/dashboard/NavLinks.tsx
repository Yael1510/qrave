'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ links }: { links: { href: string; label: string; emoji: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
      {links.map(l => {
        const active = path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${active ? 'bg-ink text-cream' : 'text-ink hover:bg-soft'}`}>
            <span className="mr-1">{l.emoji}</span>{l.label}
          </Link>
        );
      })}
    </nav>
  );
}
