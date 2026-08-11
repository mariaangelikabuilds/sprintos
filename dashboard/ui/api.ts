import type { Decision, SprintDetail, SprintSummary } from './types.js';
import { readKey } from './key.js';

const N8N = 'https://mariaangelika.app.n8n.cloud/webhook';

// This page is static and public, so it holds no secret of its own. Every call
// carries the key the operator typed, and n8n's webhook header auth answers a
// wrong or missing one with 403 before it starts an execution.
export class ApiError extends Error {
  constructor(message: string, readonly keyRejected = false) {
    super(message);
  }
}

const authHeader = () => ({ 'x-sprintos-key': readKey() });

function failure(status: number): ApiError {
  if (status === 401 || status === 403) return new ApiError('n8n rejected that key.', true);
  if (status === 404) return new ApiError('That n8n workflow is unpublished, so its webhook does not exist.');
  return new ApiError(`n8n returned HTTP ${status}.`);
}

// n8n answers 200 with an empty body when it accepts the request but runs no
// execution, which is what an exhausted plan allowance looks like from here.
async function readJson(res: Response): Promise<any> {
  if (!res.ok) throw failure(res.status);
  const text = await res.text();
  if (!text) throw new ApiError('n8n accepted the request and ran nothing. Its execution allowance is spent, or the workflow is unpublished.');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError('n8n returned something that is not JSON.');
  }
}

export async function listSprints(): Promise<SprintSummary[]> {
  const res = await fetch(`${N8N}/sprintos-sprints`, { headers: authHeader() });
  const data = await readJson(res);
  const sprints: SprintSummary[] = data.sprints ?? [];
  return [...sprints].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getSprint(id: string): Promise<SprintDetail | null> {
  const res = await fetch(`${N8N}/sprintos-sprint?id=${encodeURIComponent(id)}`, { headers: authHeader() });
  const data = await readJson(res);
  return data.error ? null : data;
}

const EARLY_MS = 15_000;

// Fire and forget: the run takes about five minutes and the edge cuts the
// response at ~100 seconds, so a late failure says nothing. Only a fast one is
// real, and it is the difference between a sprint that is running and a sprint
// that exists nowhere but this list.
export function startSprint(brief: object, onEarlyFailure: (e: ApiError) => void): string {
  const id = crypto.randomUUID();
  const sentAt = Date.now();
  const stillEarly = () => Date.now() - sentAt < EARLY_MS;

  fetch(`${N8N}/sprintos-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ ...brief, sprint_id: id })
  })
    .then((res) => {
      if (!res.ok && stillEarly()) onEarlyFailure(failure(res.status));
    })
    .catch(() => {
      if (stillEarly()) onEarlyFailure(new ApiError('The request never left this browser.'));
    });

  return id;
}

export async function sendDecisions(id: string, decisions: Decision[]): Promise<void> {
  const res = await fetch(`${N8N}/sprintos-decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ sprint_id: id, decisions })
  });
  const data = await readJson(res);
  if (!data.reviewed) throw new ApiError('n8n did not confirm the verdicts were written.');
}

// Rejecting the whole batch is a different verdict from killing four ads one
// by one: it says the direction was wrong, and the reason is what makes the
// rerun different instead of a reroll of the same dice.
export async function rejectBatch(id: string, reason: string): Promise<void> {
  const res = await fetch(`${N8N}/sprintos-decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ sprint_id: id, rejected_all: true, reason, decisions: [] })
  });
  const data = await readJson(res);
  if (!data.reviewed) throw new ApiError('n8n did not confirm the rejection was written.');
}
