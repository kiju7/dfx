import type { ReactNode } from 'react';
import Link from 'next/link';
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
          <nav>
            <Link href="/">Board</Link>
            <Link href="/agents">Agents</Link>
            <Link href="/new">+ New request</Link>
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
