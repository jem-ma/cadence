import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { Banner } from '../components/ui.jsx';
import { BlocksEditor } from '../components/forms.jsx';
import { DAY_NAMES } from '../shared/dates.js';
import { blocksForType, dayTypeOptions, personalOf, effectiveDayTypes, typeDefFor } from '../shared/schedule.js';
import { fmtDist } from '../shared/units.js';
import { DayTypeEditor } from '../components/DayTypeEditor.jsx';

export function PatternEditor({ onClose }) {
  const { cal, data, actions, notify, profile, units } = useStore();
  const P = personalOf(cal);
  const [types, setTypes] = useState(() => effectiveDayTypes(cal));
  const [tpl, setTpl] = useState(() => JSON.parse(JSON.stringify(cal.weekTemplate || {})));
  const [dirty, setDirty] = useState(false);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const src = { personal: cal.personal, dayTypes: types };
  const update = (wd, patch) => {
    setTpl((t) => ({ ...t, [wd]: { ...t[wd], ...patch } }));
    setDirty(true);
  };
  const changeTypes = (next) => {
    setTypes(next);
    setDirty(true);
    if (!next.length) return;
    // days that used a removed type move to the first remaining one, with that type's usual time blocks
    setTpl((t) =>
      Object.fromEntries(
        Object.entries(t).map(([wd, d]) => (next.some((x) => x.id === d.dayType) ? [wd, d] : [wd, { ...d, dayType: next[0].id, blocks: blocksForType(next[0].id, { personal: cal.personal, dayTypes: next }) }]))
      )
    );
  };
  const save = async () => {
    if (!types.length) return notify('Keep at least one day type', 'error');
    for (const wd of order) for (const b of tpl[wd]?.blocks || []) if (b.end <= b.start) return notify(`${DAY_NAMES[wd]}: each block needs an end after its start`, 'error');
    await actions.update('profile', profile.id, { dayTypes: types });
    const existing = data.calendar.find((c) => c.id === 'weekTemplate');
    if (existing) await actions.update('calendar', 'weekTemplate', { template: tpl });
    else await actions.create('calendar', { id: 'weekTemplate', template: tpl });
    setDirty(false);
    notify('Weekly pattern saved — future days and your plan are updated');
    onClose?.();
  };
  return (
    <div className="stack">
      <Banner>Your default week. Specific dates you’ve edited keep their own settings. Changing the pattern re-plans all future days that follow it.</Banner>
      <div className="card stack" style={{ gap: 8 }}>
        <h3>Day types</h3>
        <p className="small muted" style={{ margin: 0 }}>
          The kinds of day you have. Add your own or remove any you don’t use, then choose one for each day below. A new type starts as a flexible day — adjust its time blocks under the day.
        </p>
        <DayTypeEditor types={types} onChange={changeTypes} />
      </div>
      {order.map((wd) => {
        const d = tpl[wd] || { dayType: types[0]?.id || 'free', blocks: [] };
        const def = typeDefFor(d.dayType, src);
        return (
          <div className="card" key={wd}>
            <div className="card-head">
              <h3>{DAY_NAMES[wd]}</h3>
              <select
                className="input"
                style={{ maxWidth: 240 }}
                value={d.dayType}
                onChange={(e) => update(wd, { dayType: e.target.value, blocks: blocksForType(e.target.value, src) })}
                aria-label={`${DAY_NAMES[wd]} type`}
              >
                {dayTypeOptions(src).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <BlocksEditor blocks={d.blocks || []} onChange={(blocks) => update(wd, { blocks })} />
            {def.features?.commute && P.commuteWalkMi > 0 && (
              <p className="tiny faint" style={{ marginTop: 8 }}>
                Counts ~{fmtDist(P.commuteWalkMi)} of commute walking{P.extraWalk.enabled ? `; “${P.extraWalk.label}” adds ~${fmtDist(P.extraWalk.mi)}` : ''}. Change these in Settings.
              </p>
            )}
          </div>
        );
      })}
      <div className="row" style={{ position: 'sticky', bottom: 0, justifyContent: 'flex-end', padding: '10px 0', background: 'var(--bg)' }}>
        <button className="btn primary" disabled={!dirty} onClick={save}>
          Save weekly pattern
        </button>
      </div>
    </div>
  );
}
