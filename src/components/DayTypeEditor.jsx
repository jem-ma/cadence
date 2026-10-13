import { useState } from 'react';
import { Icon } from './ui.jsx';
import { CUSTOM_BASE } from '../shared/schedule.js';

/**
 * A person's list of day types ("Office day", "Too busy", "Morning movement"…).
 * Shown as removable chips with a text field to add more. New types start as a flexible day.
 */
export function DayTypeEditor({ types, onChange, label = 'Day types' }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    const name = text.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!name) return;
    if (types.some((t) => t.label.toLowerCase() === name.toLowerCase())) return setError('You already have a day type with that name.');
    onChange([...types, { id: `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, label: name, base: CUSTOM_BASE }]);
    setText('');
    setError('');
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="pills" role="list" aria-label={label}>
        {types.map((t) => (
          <span key={t.id} role="listitem" className="pill type-chip">
            {t.label}
            <button type="button" aria-label={`Remove ${t.label}`} onClick={() => onChange(types.filter((x) => x.id !== t.id))}>
              <Icon name="x" width="13" height="13" />
            </button>
          </span>
        ))}
        {types.length === 0 && <span className="small faint">No day types yet — add one below.</span>}
      </div>
      <div className="field-row">
        <input
          className="input"
          value={text}
          placeholder="Add your own, e.g. Long-run day"
          onChange={(e) => (setText(e.target.value), setError(''))}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          aria-label="New day type"
        />
        <button type="button" className="btn" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
      {error && <span className="tiny" style={{ color: 'var(--warn)' }}>{error}</span>}
    </div>
  );
}
