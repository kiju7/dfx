'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

const MAX_ENTRIES = 200;        // memory cap; the panel itself scrolls
const SCROLL_THRESHOLD = 12;   // below this count → natural height, no scroll
const PANEL_MAX_HEIGHT = 360;  // px — used when entries >= SCROLL_THRESHOLD

function trimTarget(target: string, max = 120): string {
  if (target.length <= max) return target;
  return target.slice(0, max - 1) + '…';
}

// Decision: oldest-first + sticky-bottom pattern chosen.
// Rationale: matches chat/terminal UX — new events append at bottom,
// user scrolls up to see history. When stuck to bottom, auto-scroll
// keeps latest visible. When user scrolls up, auto-scroll pauses.
// status='done' → full expand (no maxHeight) + SSE closed.

export default function LiveActivity({
  taskId,
  status,
}: {
  taskId: string;
  status: 'active' | 'done';
}) {
  // Oldest-first list — new entries appended to the end.
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [live, setLive] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // sticky-bottom: true means the viewport is pinned to the bottom.
  const stuckToBottomRef = useRef<boolean>(true);

  useEffect(() => {
    // If task is already done, don't open SSE at all.
    if (status === 'done') return;

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
        const next: ActivityEntry = {
          id: evt.id,
          ts: evt.ts,
          agentId: evt.payload.agentId,
          action: evt.payload.action,
          target: evt.payload.target ?? '',
          tool: evt.payload.tool,
        };
        // oldest-first: append to end
        setEntries((prev) => [...prev, next].slice(-MAX_ENTRIES));
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [taskId, status]);

  // Track whether the user is stuck to the bottom.
  // Fire whenever entries change: if stuck, scroll to bottom.
  const onScroll = (ev: React.UIEvent<HTMLDivElement>) => {
    const el = ev.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stuckToBottomRef.current = distanceFromBottom <= 8;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stuckToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="empty" style={{ padding: '20px' }}>
        {status === 'done' ? '활동 기록 없음.' : live ? '활동 대기 중…' : '연결 중…'}
      </div>
    );
  }

  // 1) Collapse identical consecutive entries (same agent + action + target)
  //    into a single visual row with a ×N badge.
  type CollapsedItem = ActivityEntry & { count: number };
  const collapsed: CollapsedItem[] = [];
  for (const e of entries) {
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      last.agentId === e.agentId &&
      last.action === e.action &&
      last.target === e.target
    ) {
      last.count += 1;
    } else {
      collapsed.push({ ...e, count: 1 });
    }
  }

  // 2) Group consecutive collapsed items by agent.
  type Group = { agentId: string; items: CollapsedItem[] };
  const groups: Group[] = [];
  for (const e of collapsed) {
    const last = groups[groups.length - 1];
    if (last && last.agentId === e.agentId) last.items.push(e);
    else groups.push({ agentId: e.agentId, items: [e] });
  }

  // 3) Compute scroll container style.
  //    - status === 'done' → full expand, no maxHeight
  //    - entries < SCROLL_THRESHOLD → natural height
  //    - entries >= SCROLL_THRESHOLD → constrained height with scroll
  const needsScroll = status !== 'done' && entries.length >= SCROLL_THRESHOLD;
  const scrollStyle: React.CSSProperties = needsScroll
    ? {
        // Mobile: min(360px, 45vh); desktop: 360px via clamp
        maxHeight: `min(${PANEL_MAX_HEIGHT}px, 45vh)`,
        overflowY: 'auto',
      }
    : {
        maxHeight: 'none',
        overflowY: 'visible',
      };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {entries.length} events · oldest first
        </span>
        {status === 'done' ? (
          <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>● done</span>
        ) : (
          <span style={{ fontSize: 11, color: live ? 'var(--st-done)' : 'var(--fg-subtle)' }}>
            {live ? '● live' : '○ offline'}
          </span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          ...scrollStyle,
          paddingRight: 6,
          scrollbarGutter: 'stable',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {groups.map((g, gi) => {
          const meta = getAgentMeta(g.agentId);
          return (
            <div key={`${g.agentId}-${gi}`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className={`avatar sm role-${meta.role}`} title={meta.displayName} role="img" aria-label={meta.displayName}>
                {meta.initial}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>
                  {meta.emoji && <span style={{ marginRight: 4 }}>{meta.emoji}</span>}
                  {meta.displayName}
                  <span
                    className="role-tag"
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      padding: '1px 6px',
                      borderRadius: 4,
                      marginLeft: 8,
                      background: 'var(--bg-sunken)',
                      color: 'var(--fg-muted)',
                    }}
                  >
                    {meta.role}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: '"SF Mono", Menlo, monospace',
                    fontSize: 12,
                    color: 'var(--fg-muted)',
                    marginTop: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {g.items.map((it) => (
                    <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ width: 16, flexShrink: 0 }}>{ACTION_ICON[it.action] ?? '·'}</span>
                      <span
                        title={it.target}
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {trimTarget(it.target)}
                      </span>
                      {it.count > 1 && (
                        <span
                          style={{
                            flexShrink: 0,
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '0 6px',
                            borderRadius: 999,
                            background: 'var(--bg-sunken)',
                            color: 'var(--fg-muted)',
                          }}
                          title={`${it.count}회 연속 반복`}
                        >
                          ×{it.count}
                        </span>
                      )}
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
    </>
  );
}
