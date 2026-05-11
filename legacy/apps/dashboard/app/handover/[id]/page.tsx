import { notFound } from 'next/navigation';
import Link from 'next/link';
import { queries } from '@agent-forge/db';

export const dynamic = 'force-dynamic';

export default async function HandoverDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = queries.handover.getById(id);
  if (!doc) notFound();

  return (
    <>
      <p>
        <Link href="/handover">← back to handover</Link>
      </p>
      <h1>{doc.title}</h1>
      <p style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
        <code>{doc.file_path}</code> · updated {new Date(doc.updated_at).toLocaleString()}
        {doc.task_id && (
          <>
            {' '}
            ·{' '}
            <Link href={`/tasks/${doc.task_id}`}>task {doc.task_id.slice(-8)}</Link>
          </>
        )}
      </p>
      <pre
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 16,
          whiteSpace: 'pre-wrap',
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        {doc.content_md}
      </pre>
    </>
  );
}
