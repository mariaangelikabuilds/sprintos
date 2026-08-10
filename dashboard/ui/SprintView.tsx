import { useState } from 'react';
import type { Ad, Decision, SprintDetail } from './types.js';
import { statusLabel } from './SprintList.js';

export function SprintView({ sprint, onDecided }: { sprint: SprintDetail; onDecided: () => void }) {
  const pkg = sprint.package;
  return (
    <article className="sprint-view">
      <header>
        <h2>{sprint.brief.brand_name}</h2>
        <span className={`status s-${statusLabel(sprint).replace(' ', '-')}`}>{statusLabel(sprint)}</span>
      </header>
      <p className="brief-line">{sprint.brief.product}. For {sprint.brief.target_market}.
        {sprint.brief.competitors ? ` Against ${sprint.brief.competitors}.` : ''}</p>

      {!pkg && sprint.status === 'running' && (
        <p className="note">The pipeline is working: query planning, four web searches, research, angles, critique, copy. This page refreshes itself.</p>
      )}
      {!pkg && sprint.status === 'failed' && (
        <p className="err">The brief never reached the pipeline. Check that the n8n workflow is published, then send it again.</p>
      )}

      {pkg && (
        <>
          <ResearchBlock pkg={pkg} />
          <AnglesBlock pkg={pkg} />
          <AdsBlock sprint={sprint} onDecided={onDecided} />
        </>
      )}
    </article>
  );
}

function ResearchBlock({ pkg }: { pkg: NonNullable<SprintDetail['package']> }) {
  const r = pkg.research;
  return (
    <section>
      <h3>Research</h3>
      <p>{r.product_summary}</p>
      <h4>Findings, each from a real search result</h4>
      <ul className="findings">
        {r.competitor_findings.map((f, i) => (
          <li key={i}>
            <strong>{f.competitor}</strong>: {f.observed}{' '}
            <a href={f.source} target="_blank" rel="noreferrer">source</a>
          </li>
        ))}
      </ul>
      <h4>What search did not cover</h4>
      <ul className="gaps">{r.research_gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
    </section>
  );
}

function AnglesBlock({ pkg }: { pkg: NonNullable<SprintDetail['package']> }) {
  const byId = new Map(pkg.critique.scores.map((s) => [s.id, s]));
  const selected = new Set(pkg.critique.selected_ids);
  return (
    <section>
      <h3>Angles, {pkg.angles.length} generated, {selected.size} survived the critic</h3>
      <table className="angles">
        <thead><tr><th>score</th><th>angle</th><th>maps to</th><th>critic</th></tr></thead>
        <tbody>
          {[...pkg.angles].sort((a, b) => (byId.get(b.id)?.score ?? 0) - (byId.get(a.id)?.score ?? 0)).map((a) => (
            <tr key={a.id} className={selected.has(a.id) ? 'kept' : 'cut'}>
              <td className="score">{byId.get(a.id)?.score ?? '?'}</td>
              <td>{a.angle}</td>
              <td>{a.maps_to}</td>
              <td>{selected.has(a.id) ? byId.get(a.id)?.strongest : byId.get(a.id)?.weakest}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">{pkg.critique.selection_reasoning}</p>
    </section>
  );
}

function AdsBlock({ sprint, onDecided }: { sprint: SprintDetail; onDecided: () => void }) {
  const pkg = sprint.package!;
  const done = sprint.status === 'reviewed';
  const prior = new Map((sprint.decisions ?? []).map((d) => [d.angle_id, d.verdict]));
  const [verdicts, setVerdicts] = useState<Map<number, 'approved' | 'killed'>>(new Map(prior));
  const [key, setKey] = useState(localStorage.getItem('review_key') ?? '');
  const [error, setError] = useState('');

  const decide = (id: number, v: 'approved' | 'killed') =>
    setVerdicts((prev) => new Map(prev).set(id, v));

  async function submit() {
    localStorage.setItem('review_key', key);
    const decisions: Decision[] = pkg.ads.map((a) => ({
      angle_id: a.angle_id,
      verdict: verdicts.get(a.angle_id) ?? 'killed',
      note: ''
    }));
    const res = await fetch(`/api/sprints/${sprint.id}/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-review-key': key },
      body: JSON.stringify({ decisions })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'decision rejected');
      return;
    }
    setError('');
    onDecided();
  }

  return (
    <section>
      <h3>Ads{done ? ', reviewed' : ', awaiting your verdict'}</h3>
      {pkg.ads.map((ad) => (
        <AdCard key={ad.angle_id} ad={ad} verdict={verdicts.get(ad.angle_id)} done={done}
          onDecide={(v) => decide(ad.angle_id, v)} />
      ))}
      {!done && (
        <div className="verdict-bar">
          <input type="password" placeholder="review key" value={key} onChange={(e) => setKey(e.target.value)} />
          <button onClick={submit} disabled={verdicts.size < pkg.ads.length || !key}>
            Record {verdicts.size}/{pkg.ads.length} verdicts
          </button>
          {error && <span className="err">{error}</span>}
        </div>
      )}
    </section>
  );
}

function AdCard({ ad, verdict, done, onDecide }: {
  ad: Ad;
  verdict?: 'approved' | 'killed';
  done: boolean;
  onDecide: (v: 'approved' | 'killed') => void;
}) {
  return (
    <div className={`ad ${verdict ?? ''}`}>
      <div className="ad-head">
        <strong>{ad.headline}</strong>
        {!done ? (
          <span className="verdict-buttons">
            <button className={verdict === 'approved' ? 'on' : ''} onClick={() => onDecide('approved')}>approve</button>
            <button className={verdict === 'killed' ? 'on' : ''} onClick={() => onDecide('killed')}>kill</button>
          </span>
        ) : (
          <span className={`status s-${verdict}`}>{verdict}</span>
        )}
      </div>
      <p>{ad.primary_text}</p>
      <ul className="hooks">{ad.hook_variants.map((h, i) => <li key={i}>{h}</li>)}</ul>
      <p className="cta">CTA: {ad.cta}</p>
    </div>
  );
}
