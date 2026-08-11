import { useState } from 'react';

export function KeyGate({ note, onKey }: { note: string; onKey: (key: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form className="key-gate" onSubmit={(e) => { e.preventDefault(); onKey(value.trim()); }}>
      <h2>Key required</h2>
      <p>This page is public. The n8n endpoints behind it are not: reading briefs and recording
        verdicts both need the header key. It stays in this browser and is never built into the page.</p>
      {note && <p className="err">{note}</p>}
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="x-sprintos-key"
        autoFocus
      />
      <button type="submit" disabled={!value.trim()}>Open the dashboard</button>
    </form>
  );
}
