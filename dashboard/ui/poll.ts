import { useEffect } from 'react';

const EVERY_MS = 30_000;

// Poll only while `active`, and only while the tab is on screen. A tab parked
// on an idle dashboard now makes zero requests: two unconditional 5s intervals
// spent 18,503 failed executions and took every workflow on the n8n instance
// down with them on 2026-08-11.
// ponytail: fixed interval, no backoff. The gate on `active` is what matters.
export function usePoll(tick: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const run = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const timer = setInterval(run, EVERY_MS);
    document.addEventListener('visibilitychange', run);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [tick, active]);
}
