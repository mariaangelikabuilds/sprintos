import type { Decision, SprintDetail, SprintSummary } from './types.js';

const N8N = 'https://mariaangelika.app.n8n.cloud/webhook';

export async function listSprints(): Promise<SprintSummary[]> {
  const res = await fetch(`${N8N}/sprintos-sprints`);
  if (!res.ok) return [];
  const data = await res.json();
  const sprints: SprintSummary[] = data.sprints ?? [];
  return [...sprints].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getSprint(id: string): Promise<SprintDetail | null> {
  const res = await fetch(`${N8N}/sprintos-sprint?id=${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.error ? null : data;
}

// Fire and forget: the run takes ~5 minutes and the edge cuts the response
// long before that. The workflow persists state to its data table, so the
// sprint appears in the list on the next poll regardless of this response.
export function startSprint(brief: object): string {
  const id = crypto.randomUUID();
  fetch(`${N8N}/sprintos-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...brief, sprint_id: id })
  }).catch(() => {});
  return id;
}

export async function sendDecisions(id: string, reviewKey: string, decisions: Decision[]): Promise<string> {
  const res = await fetch(`${N8N}/sprintos-decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sprint_id: id, review_key: reviewKey, decisions })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return body.error ?? 'decision rejected';
  }
  return '';
}
