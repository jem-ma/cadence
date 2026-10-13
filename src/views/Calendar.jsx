import { useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Icon, Seg, Banner } from '../components/ui.jsx';
import { BlocksEditor } from '../components/forms.jsx';
import { addDays, dateRange, endOfMonth, formatDate, MONTHS, parseDate, startOfMonth, startOfWeek, DAY_NAMES, toISODate } from '../shared/dates.js';
import { resolveDay, blocksForType, dayTypeOptions, personalOf, effectiveDayTypes, typeDefFor } from '../shared/schedule.js';
import { fmtDist } from '../shared/units.js';
import { ACTIVITY_TYPES } from '../shared/activities.js';
import { DayTypeEditor } from '../components/DayTypeEditor.jsx';
import { sumMiles } from '../shared/calc.js';

export function CalendarSection() {
  const { today } = useStore();
  const { open } = useSheets();
  const [cursor, setCursor] = useState(today);
  const move = (n) => {
    const d = parseDate(cursor);
    setCursor(toISODate(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)));
  };
  return (
    <section className="card">
      <div className="card-head wrap-head">
        <h3>Availability</h3>
        <div className="row wrap" style={{ gap: 6 }}>
          <button className="icon-btn" onClick={() => move(-1)} aria-label="Previous month">
            <Icon name="chevronL" />
          </button>
          <strong style={{ minWidth: 120, textAlign: 'center' }}>
            {MONTHS[parseDate(cursor).getMonth()]} {parseDate(cursor).getFullYear()}
          </strong>
          <button className="icon-btn" onClick={() => move(1)} aria-label="Next month">
            <Icon name="chevronR" />
          </button>
          <button className="btn small" onClick={() => open('pattern')}>
            Weekly pattern
          </button>
        </div>
      </div>
      <MonthView cursor={cursor} onPick={(d) => open('day', { date: d })} />
      <Legend />
    </section>
  );
}

const TYPE_COLOUR = { run: 'var(--run)', walk: 'var(--walk)', cycle: 'var(--cycle)', swim: 'var(--swim)', box: 'var(--box)' };
function typeGradient(byType, total) {
  let at = 0;
  const stops = [];
  for (const [t, mi] of Object.entries(byType)) {
    if (!(mi > 0)) continue;
    const next = at + (mi / total) * 100;
    stops.push(`${TYPE_COLOUR[t]} ${at.toFixed(1)}% ${next.toFixed(1)}%`);
    at = next;
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function useDayInfo() {
  const { cal, data, coaching, today } = useStore();
  return (d) => {
    const day = resolveDay(d, cal);
    const acts = data.activities.filter((a) => a.date === d && !a.deleted && !a.excluded);
    const plan = coaching?.plan.days.find((x) => x.date === d);
    return { day, done: sumMiles(acts), byType: Object.fromEntries(Object.keys(ACTIVITY_TYPES).map((t) => [t, sumMiles(acts, t)])), count: acts.length, plan, past: d < today };
  };
}

function MonthView({ cursor, onPick }) {
  const { today } = useStore();
  const info = useDayInfo();
  const first = startOfWeek(startOfMonth(cursor));
  const last = addDays(startOfWeek(endOfMonth(cursor)), 6);
  const days = dateRange(first, last);
  const month = cursor.slice(0, 7);
  return (
    <div className="cal-month" role="grid" aria-label="Month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <div key={d} className="dow">
          {d}
        </div>
      ))}
      {days.map((d) => {
        const i = info(d);
        const unavailable = i.day.status === 'unavailable';
        return (
          <button
            key={d}
            title={i.day.label}
            className={`cal-cell ${d.slice(0, 7) !== month ? 'out' : ''} ${d === today ? 'today' : ''} ${i.past ? 'past' : ''} ${unavailable ? 'unavailable' : ''}`}
            onClick={() => onPick(d)}
            aria-label={`${formatDate(d)}: ${i.day.label}${i.done ? `, ${fmtDist(i.done)} done` : ''}`}
          >
            <span className="d">
              {Number(d.slice(8))}
              {i.day.period.active && <span className="pdot" title={i.day.period.actual ? 'Period' : 'Period expected'} />}
            </span>
            <span className="tag">
              {i.day.status === 'normal' ? i.day.short : i.day.status === 'busy' ? 'Busy' : i.day.status === 'rest' ? 'Rest' : 'Unavailable'}
              {i.day.isOverride ? ' •' : ''}
            </span>
            {i.day.events.length > 0 && <span className="tag" style={{ color: 'var(--warn)' }}>{i.day.events[0].title}</span>}
            {i.done > 0 ? (
              <>
                <span className="mi num">{fmtDist(i.done)}</span>
                <span className="bar" style={{ background: typeGradient(i.byType, i.done) }} />
              </>
            ) : (
              i.count > 0 && <span className="mi">{i.count} {i.count === 1 ? 'session' : 'sessions'}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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

function Legend() {
  return (
    <div className="legend" style={{ marginTop: 12 }}>
      <span>
        <span className="pdot" style={{ marginRight: 6 }} />
        period
      </span>
      <span>• edited date</span>
      <span>Tap a day to change its availability, commitments, sessions or cycle dates</span>
    </div>
  );
}
