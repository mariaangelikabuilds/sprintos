import { useCallback, useEffect, useState } from 'react';
import type { SprintDetail, SprintSummary } from './types.js';
import { listSprints, getSprint } from './api.js';
import { BriefForm } from './BriefForm.js';
import { SprintList } from './SprintList.js';
import { SprintView } from './SprintView.js';

export function App() {
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SprintDetail | null>(null);

  const refresh = useCallback(async () => {
    setSprints(await listSprints());
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const d = await getSprint(id);
    if (d) setDetail(d);
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
    const t = setInterval(() => loadDetail(selectedId), 5000);
    return () => clearInterval(t);
  }, [selectedId, loadDetail]);

  return (
    <div className="shell">
      <header className="masthead">
        <h1>SprintOS</h1>
        <p>Brief in, reviewed ad package out. Nothing ships without a decision recorded here.</p>
      </header>
      <div className="columns">
        <aside className="rail">
          <BriefForm onCreated={(id) => { refresh(); setSelectedId(id); }} />
          <SprintList sprints={sprints} selectedId={selectedId} onSelect={setSelectedId} />
        </aside>
        <main className="stage">
          {detail
            ? <SprintView sprint={detail} onDecided={() => loadDetail(detail.id)} />
            : <p className="empty">Pick a sprint, or send a brief to start one.</p>}
        </main>
      </div>
    </div>
  );
}
