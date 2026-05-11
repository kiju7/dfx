import { redirect } from 'next/navigation';
import { REQUEST_TYPES } from '@agent-forge/shared';

async function submit(formData: FormData) {
  'use server';
  const type = String(formData.get('type') ?? 'bug');
  const title = String(formData.get('title') ?? '').trim();
  const body_md = String(formData.get('body') ?? '');
  if (!title) return;
  const orchestrator = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:4317';
  const res = await fetch(`${orchestrator}/requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, title, body_md }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`orchestrator rejected: ${res.status} ${t}`);
  }
  const { id } = (await res.json()) as { id: string };
  redirect(`/requests/${id}`);
}

export default function NewRequest() {
  return (
    <>
      <h1>New request</h1>
      <form action={submit} className="form">
        <label htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue="bug">
          {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" required maxLength={200} />
        <label htmlFor="body">Body (markdown)</label>
        <textarea id="body" name="body" placeholder="repro steps, expected vs actual, etc." />
        <button type="submit">Submit</button>
      </form>
    </>
  );
}
