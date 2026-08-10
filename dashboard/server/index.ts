import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { randomUUID } from 'node:crypto';
import { deliverPackage, getSprint, insertSprint, listSprints, markFailed, recordDecisions } from './db.js';

const webhookUrl = process.env.N8N_WEBHOOK_URL ?? 'https://mariaangelika.app.n8n.cloud/webhook/sprintos-research';
const callbackSecret = process.env.CALLBACK_SECRET ?? '';
const reviewKey = process.env.REVIEW_KEY ?? '';
const port = Number(process.env.PORT ?? 8792);

const app = new Hono();

type Brief = { brand_name: string; product: string; target_market: string; competitors?: string };

function validBrief(b: unknown): b is Brief {
  if (typeof b !== 'object' || b === null) return false;
  const o = b as Record<string, unknown>;
  return ['brand_name', 'product', 'target_market'].every(
    (k) => typeof o[k] === 'string' && (o[k] as string).trim().length > 0
  );
}

// The n8n run takes ~5 minutes; the sprint webhook call is delivery, not a
// conversation. n8n has the job once the request lands; results arrive on
// the callback route. A timeout abort here is expected, only a connection
// refusal means the brief never arrived.
function fireWebhook(id: string, brief: Brief): void {
  const body = JSON.stringify({ ...brief, sprint_id: id });
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000)
  }).catch((err: Error) => {
    if (err.name !== 'TimeoutError' && err.name !== 'AbortError') markFailed(id);
  });
}

app.post('/api/sprints', async (c) => {
  const brief = await c.req.json().catch(() => null);
  if (!validBrief(brief)) return c.json({ error: 'brand_name, product, target_market are required' }, 400);
  const id = randomUUID();
  insertSprint(id, brief, new Date().toISOString());
  fireWebhook(id, brief);
  return c.json({ id }, 202);
});

app.post('/api/callback/:secret', async (c) => {
  if (!callbackSecret || c.req.param('secret') !== callbackSecret) return c.json({ error: 'bad secret' }, 403);
  const body = await c.req.json().catch(() => null);
  const id = body?.sprint_id;
  const pkg = body?.package;
  if (typeof id !== 'string' || typeof pkg !== 'object' || pkg === null) {
    return c.json({ error: 'sprint_id and package are required' }, 400);
  }
  const ok = deliverPackage(id, pkg, new Date().toISOString());
  return ok ? c.json({ delivered: true }) : c.json({ error: 'unknown sprint or already reviewed' }, 409);
});

app.get('/api/sprints', (c) => {
  const rows = listSprints().map((r) => ({
    id: r.id,
    brief: JSON.parse(r.brief),
    status: r.status,
    created_at: r.created_at,
    delivered_at: r.delivered_at,
    reviewed_at: r.reviewed_at
  }));
  return c.json({ sprints: rows });
});

app.get('/api/sprints/:id', (c) => {
  const row = getSprint(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({
    id: row.id,
    brief: JSON.parse(row.brief),
    status: row.status,
    package: row.package ? JSON.parse(row.package) : null,
    decisions: row.decisions ? JSON.parse(row.decisions) : null,
    created_at: row.created_at,
    delivered_at: row.delivered_at,
    reviewed_at: row.reviewed_at
  });
});

app.post('/api/sprints/:id/decisions', async (c) => {
  if (!reviewKey || c.req.header('x-review-key') !== reviewKey) return c.json({ error: 'bad review key' }, 403);
  const body = await c.req.json().catch(() => null);
  const decisions = body?.decisions;
  if (!Array.isArray(decisions) || decisions.length === 0) return c.json({ error: 'decisions[] required' }, 400);
  const clean = decisions.map((d) => ({
    angle_id: d.angle_id,
    verdict: d.verdict === 'approved' ? 'approved' : 'killed',
    note: typeof d.note === 'string' ? d.note : ''
  }));
  const ok = recordDecisions(c.req.param('id'), clean, new Date().toISOString());
  return ok ? c.json({ reviewed: true }) : c.json({ error: 'sprint is not awaiting review' }, 409);
});

app.use('/*', serveStatic({ root: './dist-ui' }));
app.use('/*', serveStatic({ root: './dist-ui', rewriteRequestPath: () => '/index.html' }));

serve({ fetch: app.fetch, port }, () => {
  console.log(`sprintos dashboard on :${port}`);
});
