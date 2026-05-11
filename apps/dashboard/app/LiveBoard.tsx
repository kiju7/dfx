'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LiveBoard() {
  const router = useRouter();
  const [lastEvent, setLastEvent] = useState<string>('');

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        setLastEvent(`${parsed.kind} @ ${new Date(parsed.ts).toLocaleTimeString()}`);
        if (
          parsed.kind === 'task.created' ||
          parsed.kind === 'task.status_changed' ||
          parsed.kind === 'request.received' ||
          parsed.kind === 'request.status_changed'
        ) {
          router.refresh();
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [router]);

  return (
    <div role="status" aria-live="polite" style={{ fontSize: 11, color: '#8b949e', marginBottom: 12 }}>
      live: {lastEvent || 'waiting…'}
    </div>
  );
}
