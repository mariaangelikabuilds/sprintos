import type { SprintSummary } from './types.js';

const STALE_MS = 10 * 60 * 1000;

export function statusLabel(s: SprintSummary): string {
  if (s.status === 'running' && Date.now() - Date.parse(s.created_at) > STALE_MS) return 'stale';
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
