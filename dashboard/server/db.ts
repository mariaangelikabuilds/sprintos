import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'sprintos.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sprints (
    id TEXT PRIMARY KEY,
    brief TEXT NOT NULL,
    status TEXT NOT NULL,
    package TEXT,
    decisions TEXT,
    created_at TEXT NOT NULL,
    delivered_at TEXT,
    reviewed_at TEXT
  )
`);

export type SprintRow = {
  id: string;
  brief: string;
  status: 'running' | 'failed' | 'review' | 'reviewed';
  package: string | null;
  decisions: string | null;
  created_at: string;
  delivered_at: string | null;
  reviewed_at: string | null;
};

export function insertSprint(id: string, brief: object, createdAt: string): void {
  db.prepare('INSERT INTO sprints (id, brief, status, created_at) VALUES (?, ?, ?, ?)')
    .run(id, JSON.stringify(brief), 'running', createdAt);
}

export function markFailed(id: string): void {
  db.prepare("UPDATE sprints SET status = 'failed' WHERE id = ? AND status = 'running'").run(id);
}

export function deliverPackage(id: string, pkg: object, deliveredAt: string): boolean {
  const info = db
    .prepare("UPDATE sprints SET status = 'review', package = ?, delivered_at = ? WHERE id = ? AND status IN ('running', 'failed')")
    .run(JSON.stringify(pkg), deliveredAt, id);
  return info.changes === 1;
}

export function recordDecisions(id: string, decisions: object, reviewedAt: string): boolean {
  const info = db
    .prepare("UPDATE sprints SET status = 'reviewed', decisions = ?, reviewed_at = ? WHERE id = ? AND status = 'review'")
    .run(JSON.stringify(decisions), reviewedAt, id);
  return info.changes === 1;
}

export function listSprints(): SprintRow[] {
  return db.prepare('SELECT id, brief, status, created_at, delivered_at, reviewed_at, NULL AS package, NULL AS decisions FROM sprints ORDER BY created_at DESC').all() as SprintRow[];
}

export function getSprint(id: string): SprintRow | undefined {
  return db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as SprintRow | undefined;
}
