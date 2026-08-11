import { useEffect } from 'react';

const EVERY_MS = 300_000;

// Poll only while `active`, and only while the tab is on screen. A tab parked
// on an idle dashboard now makes zero requests: two unconditional 5s intervals
// spent 18,503 failed executions and took every workflow on the n8n instance
// down with them on 2026-08-11.
//
// The interval is sized against the n8n plan, not against how fresh the data
// feels: 10,000 executions/month is ~333/day for the whole instance, and a
// visible tab at 30s alone spends 2,880/day. At 5min a window left open all
// day costs ~288. Refocusing the tab ticks immediately via visibilitychange,
// so the interval only governs the idle-but-visible case.
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
