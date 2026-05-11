'use client';

import { useEffect, useRef, useState } from 'react';
import { getAgentMeta } from '../../../lib/agent-meta';

interface ActivityEntry {
  id: string;
  ts: number;
  agentId: string;
  action: string;
  target: string;
  tool?: string;
}

const ACTION_ICON: Record<string, string> = {
  reading: '📂',
  writing: '📝',
  editing: '✏️',
  searching: '🔎',
  running: '🐚',
  fetching: '🌐',
  thinking: '💭',
  other: '·',
};

const MAX_ENTRIES = 40;

function trimTarget(target: string, max = 90): string {
  if (target.length <= max) return target;
  return target.slice(0, max - 1) + '…';
}

export default function LiveActivity({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [live, setLive] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.kind !== 'agent.activity') return;
        if (evt.payload?.taskId !== taskId) return;
        if (seenIds.current.has(evt.id)) return;
        seenIds.current.add(evt.id);
        setEntries((prev) => {
          const next: ActivityEntry = {
            id: evt.id,
            ts: evt.ts,
            agentId: evt.payload.agentId,
            action: evt.payload.action,
            target: evt.payload.target ?? '',
            tool: evt.payload.tool,
          };
          const combined = [next, ...prev];
          return combined.slice(0, MAX_ENTRIES);
        });
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [taskId]);

  if (entries.length === 0) {
    return (
      <div className="empty" style={{ padding: '20px' }}>
        {live ? '활동 대기 중…' : '연결 중…'}
      </div>
    );
  }

  // group consecutive entries by agentId so the visual reads like "X is doing
  // these things" rather than every line repeating the agent header.
  type Group = { agentId: string; items: ActivityEntry[] };
  const groups: Group[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.agentId === e.agentId) {
      last.items.push(e);
    } else {
      groups.push({ agentId: e.agentId, items: [e] });
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map((g, gi) => {
        const meta = getAgentMeta(g.agentId);
        return (
          <div key={`${g.agentId}-${gi}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span className={`avatar sm role-${meta.role}`} title={meta.displayName}>
              {meta.initial}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
                {meta.emoji && <span style={{ marginRight: 4 }}>{meta.emoji}</span>}
                {meta.displayName}
                <span className="role-tag" style={{
                  fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                  marginLeft: 8, background: 'var(--bg-sunken)', color: 'var(--fg-muted)',
                }}>{meta.role}</span>
              </div>
              <div style={{ fontFamily: '"SF Mono", Menlo, monospace', fontSize: 12, color: 'var(--fg-muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {g.items.map((it) => (
                  <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ width: 16 }}>{ACTION_ICON[it.action] ?? '·'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trimTarget(it.target)}
                    </span>
                    <span style={{ color: 'var(--fg-subtle)', marginLeft: 'auto', flexShrink: 0 }}>
                      {new Date(it.ts).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
