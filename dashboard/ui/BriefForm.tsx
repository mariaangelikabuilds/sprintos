import { useState } from 'react';

const empty = { brand_name: '', product: '', competitors: '' };

const AUDIENCES = [
  'buying this for the first time',
  'replacing a cheap one',
  'wants it to last for years',
  'serious about the hobby',
  'buying it as a gift',
  'wants the best money can buy'
];

export function BriefForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [brief, setBrief] = useState(empty);
  const [picked, setPicked] = useState<string[]>([]);
  const [customMarket, setCustomMarket] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBrief({ ...brief, [k]: e.target.value });

  const toggle = (a: string) =>
    setPicked((prev) => (prev.includes(a) ? prev.filter((p) => p !== a) : [...prev, a]));

  const targetMarket = [...picked, customMarket.trim()].filter(Boolean).join('; ');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    const res = await fetch('/api/sprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...brief, target_market: targetMarket })
    });
    setSending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'brief rejected');
      return;
    }
    const { id } = await res.json();
    setBrief(empty);
    setPicked([]);
    setCustomMarket('');
    onCreated(id);
  }

  return (
    <form className="brief-form" onSubmit={submit}>
      <h2>New sprint</h2>
      <label>Brand<input value={brief.brand_name} onChange={set('brand_name')} placeholder="Loam & Ember" /></label>
      <label>Product<textarea value={brief.product} onChange={set('product')} rows={2} placeholder="small-batch cast iron skillets, flaxseed pre-season" /></label>
      <fieldset className="audience">
        <legend>Target market</legend>
        <div className="chips">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              type="button"
              className={picked.includes(a) ? 'chip on' : 'chip'}
              onClick={() => toggle(a)}
            >{a}</button>
          ))}
        </div>
        <input
          value={customMarket}
          onChange={(e) => setCustomMarket(e.target.value)}
          placeholder="add your own, e.g. home cooks 28-45 in Metro Manila"
        />
      </fieldset>
      <label>Competitors<input value={brief.competitors} onChange={set('competitors')} placeholder="Lodge, Field Company, Smithey" /></label>
      {error && <p className="err">{error}</p>}
      <button disabled={sending || !targetMarket} type="submit">{sending ? 'Sending brief' : 'Run the sprint'}</button>
      <p className="note">A run takes about five minutes: four web searches and five model stages.</p>
    </form>
  );
}
