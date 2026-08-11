import type { SprintSummary } from './types.js';

const STALE_MS = 10 * 60 * 1000;

// A run that died mid-flight leaves its row saying 'running' forever, because
// the only thing that would have changed it is the step that never happened.
// Anything asking "is work still in flight?" has to exclude those, or it waits
// on them for the life of the tab.
export function isStale(s: SprintSummary): boolean {
  return s.status === 'running' && Date.now() - Date.parse(s.created_at) > STALE_MS;
}

export function isLive(s: SprintSummary): boolean {
  return s.status === 'running' && !isStale(s);
}

export function statusLabel(s: SprintSummary): string {
  if (isStale(s)) return 'stale';
  if (s.status === 'review') return 'awaiting review';
  return s.status;
}

export function SprintList({ sprints, selectedId, onSelect }: {
  sprints: SprintSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (sprints.length === 0) return <p className="note">No sprints yet.</p>;
  return (
    <ul className="sprint-list">
      {sprints.map((s) => (
        <li key={s.id}>
          <button
            className={s.id === selectedId ? 'row current' : 'row'}
            onClick={() => onSelect(s.id)}
          >
            <span className="brand">{s.brief.brand_name}</span>
            <span className={`status s-${statusLabel(s).replace(' ', '-')}`}>{statusLabel(s)}</span>
            <span className="when">{new Date(s.created_at).toLocaleString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
