import Link from 'next/link';
import { queries } from '@agent-forge/db';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string;
}

export default async function HandoverPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const hits = q ? queries.handover.search(q) : [];
  const recent = !q ? queries.handover.listRecent(30) : [];

  return (
    <>
      <h1>Handover</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        매 태스크 완료 시 자동 생성되는 인수인계 문서. 전문 검색은 FTS5 BM25 랭킹 사용.
      </p>

      <form method="get" style={{ display: 'flex', gap: 8, maxWidth: 540, marginBottom: 18 }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="검색어 (예: ralph frontend rename)"
          aria-label="search query"
          style={{
            flex: 1,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            color: 'var(--fg)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
        <button type="submit" style={{
          background: 'var(--accent)',
          color: 'white',
          border: 0,
          padding: '10px 18px',
          borderRadius: 8,
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
        }}>Search</button>
      </form>

      {q && (
        <>
          <h2>
            Search results — “{q}” ({hits.length})
          </h2>
          {hits.length === 0 ? (
            <p style={{ color: 'var(--fg-muted)' }}>일치하는 문서가 없습니다.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>title</th>
                  <th>snippet</th>
                  <th>updated</th>
                  <th>rank</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.id}>
                    <td>
                      <Link href={`/handover/${hit.id}`}>{hit.title}</Link>
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{hit.file_path}</div>
                    </td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{hit.snippet}</td>
                    <td>{new Date(hit.updated_at).toLocaleString()}</td>
                    <td>{hit.rank.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {!q && (
        <>
          <h2>Recent handovers ({recent.length})</h2>
          {recent.length === 0 ? (
            <p style={{ color: 'var(--fg-muted)' }}>아직 작성된 문서가 없습니다.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>title</th>
                  <th>file</th>
                  <th>updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/handover/${row.id}`}>{row.title}</Link>
                    </td>
                    <td>
                      <code style={{ fontSize: 11 }}>{row.file_path}</code>
                    </td>
                    <td>{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
