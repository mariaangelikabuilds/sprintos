import { useState } from 'react';
import { ApiError, startSprint } from './api.js';

const empty = { brand_name: '', product: '', competitors: '' };

const AUDIENCES = [
  'buying this for the first time',
  'replacing a cheap one',
  'wants it to last for years',
  'wants it done for them',
  'shopping around for quotes',
  'buying it as a gift',
  'serious about the hobby',
  'wants the best money can buy'
];

export function BriefForm({ onCreated, onApiError }: {
  onCreated: (id: string) => void;
  onApiError: (e: ApiError) => void;
}) {
  const [brief, setBrief] = useState(empty);
  const [picked, setPicked] = useState<string[]>([]);
  const [customMarket, setCustomMarket] = useState('');
  const [error, setError] = useState('');

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setBrief({ ...brief, [k]: e.target.value });

  const toggle = (a: string) =>
    setPicked((prev) => (prev.includes(a) ? prev.filter((p) => p !== a) : [...prev, a]));

  const targetMarket = [...picked, customMarket.trim()].filter(Boolean).join('; ');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!brief.brand_name.trim() || !brief.product.trim()) {
      setError('brand and product are required');
      return;
    }
    const id = startSprint({ ...brief, target_market: targetMarket }, (e) => {
      setError(`That brief never reached the pipeline, so the sprint below is not running. ${e.message}`);
      if (e.keyRejected) onApiError(e);
    });
    setBrief(empty);
    setPicked([]);
    setCustomMarket('');
    onCreated(id);
  }

  return (
    <form className="brief-form" onSubmit={submit}>
      <h2>New sprint</h2>
      <label>Brand or business<input value={brief.brand_name} onChange={set('brand_name')} placeholder="Loam & Ember" /></label>
      <label>What you sell, product or service<textarea value={brief.product} onChange={set('product')} rows={2} placeholder="cast iron skillets / aircon deep-clean service / wedding photography" /></label>
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
      <button disabled={!targetMarket} type="submit">Run the sprint</button>
      <p className="note">A run takes about five minutes: four web searches and five model stages.</p>
    </form>
  );
}
