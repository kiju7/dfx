'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Board' },
  { href: '/agents', label: 'Agents' },
  { href: '/decisions', label: 'Decisions' },
  { href: '/handover', label: 'Handover' },
  { href: '/new', label: '+ New request' },
] as const;

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav>
      {NAV_ITEMS.map(({ href, label }) => {
        // '/'는 완전 일치, 그 외는 pathname이 해당 prefix로 시작하는지 확인
        const isCurrent =
          href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
