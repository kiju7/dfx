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
    <span className="live-pill" role="status" aria-live="polite">
      live · {lastEvent || 'waiting'}
    </span>
  );
}
