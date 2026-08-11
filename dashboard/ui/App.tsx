import { useCallback, useEffect, useState } from 'react';
import type { SprintDetail, SprintSummary } from './types.js';
import { ApiError, listSprints, getSprint } from './api.js';
import { clearKey, readKey, saveKey } from './key.js';
import { BriefForm } from './BriefForm.js';
import { KeyGate } from './KeyGate.js';
import { SprintList } from './SprintList.js';
import { SprintView } from './SprintView.js';
import { usePoll } from './poll.js';

// A brief needs a few seconds to land as a row, so a submit opens a window
// where polling is allowed even though nothing in the list is running yet.
const PENDING_MS = 3 * 60 * 1000;

export function App() {
  const [sprints, setSprints] = useState<SprintSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SprintDetail | null>(null);
  const [key, setKey] = useState(readKey());
  const [error, setError] = useState('');
  const [pendingUntil, setPendingUntil] = useState(0);

  const fail = useCallback((e: unknown) => {
    const err = e instanceof ApiError ? e : new ApiError('The request failed before n8n answered.');
    setError(err.message);
    if (err.keyRejected) {
      clearKey();
      setKey('');
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setSprints(await listSprints());
      setError('');
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const loadDetail = useCallback(async () => {
    if (!selectedId) return;
    try {
      const found = await getSprint(selectedId);
      if (found) setDetail(found);
      setError('');
    } catch (e) {
      fail(e);
    }
  }, [selectedId, fail]);

  useEffect(() => {
    if (key) refresh();
  }, [key, refresh]);

  useEffect(() => {
    setDetail(null);
    loadDetail();
  }, [loadDetail]);

  // Both gates close on their own: nothing is running, so there is nothing to
  // wait for. Re-evaluated on every render, and every poll causes one.
  const pending = Date.now() < pendingUntil;
  usePoll(refresh, !!key && (pending || sprints.some((s) => s.status === 'running')));
  usePoll(loadDetail, !!key && !!selectedId && (detail?.status === 'running' || (!detail && pending)));

  function created(id: string) {
    setPendingUntil(Date.now() + PENDING_MS);
    setSelectedId(id);
    refresh();
  }

  return (
    <div className="shell">
      <header className="masthead">
        <h1>SprintOS</h1>
        <p>Brief in, reviewed ad package out. Nothing ships without a decision recorded here.</p>
        {key && <button className="forget" onClick={() => { clearKey(); setKey(''); }}>forget key</button>}
      </header>

      {!key ? (
        <KeyGate note={error} onKey={(entered) => { saveKey(entered); setKey(entered); setError(''); }} />
      ) : (
        <>
          {error && <p className="err banner">{error}</p>}
          <div className="columns">
            <aside className="rail">
              <BriefForm onCreated={created} onApiError={fail} />
              <SprintList sprints={sprints} selectedId={selectedId} onSelect={setSelectedId} />
            </aside>
            <main className="stage">
              {detail
                ? <SprintView sprint={detail} onDecided={loadDetail} onApiError={fail} />
                : <p className="empty">Pick a sprint, or send a brief to start one.</p>}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
