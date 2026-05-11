import type { ReactNode } from 'react';
import Link from 'next/link';
import NavLinks from './NavLinks';
import './globals.css';

export const metadata = {
  title: 'agent-forge',
  description: 'Multi-agent engineering dashboard',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">agent-forge</Link>
          <NavLinks />
        </header>
        <main className="main">{children}</main>
        <footer className="footer">agent-forge v0.1.0</footer>
      </body>
    </html>
  );
}
