import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Sheet, Icon, Seg, Banner } from './ui.jsx';
import { formatDate, relativeDay } from '../shared/dates.js';

let rowId = 0;
const toRow = (s) => ({
  key: `r${rowId++}`,
  type: s.type,
  title: s.label || s.title || (s.type === 'run' ? 'Run' : 'Walk'),
  distanceMi: String(s.distanceMi ?? ''),
  time: s.time || '',
  durationMin: s.durationMin || null,
});

/**
 * Adjust one upcoming day's plan: change, add or remove sessions, mark the day unavailable,
 * or log a distance (pre-filled from the plan, editable before saving).
 * Calendar settings (time blocks, day type) are only edited from the calendar.
 */
export function PlanDaySheet({ date, onClose }) {
  const { coaching, data, actions, notify, today } = useStore();
  const { open } = useSheets();
  const planDay = coaching.plan.days.find((d) => d.date === date);
  const day = planDay?.day;
  const locked = !!day?.planLocked;
  const unavailable = day?.status === 'unavailable';
  const [rows, setRows] = useState(() => (planDay?.sessions || []).map(toRow));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const total = useMemo(() => Math.round(rows.reduce((t, r) => t + (Number(r.distanceMi) || 0), 0) * 10) / 10, [rows]);
  const upd = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const clearUserSessions = async () => {
    for (const p of data.plannedSessions.filter((p) => p.date === date)) await actions.remove('plannedSessions', p.id);
  };

  const savePlan = async () => {
    for (const r of rows) if (!(Number(r.distanceMi) > 0)) return notify('Each session needs a distance', 'error');
    setBusy(true);
    try {
      await clearUserSessions();
      for (const r of rows)
        await actions.create('plannedSessions', { date, type: r.type, distanceMi: Math.round(Number(r.distanceMi) * 100) / 100, time: r.time, title: r.title, status: 'planned', source: 'user' });
      await actions.create('dayPlans', { id: date, locked: true });
      notify(`Plan for ${relativeDay(date, today)} saved — the rest of the month has been re-planned`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const resetPlan = async () => {
    setBusy(true);
    await clearUserSessions();
    await actions.remove('dayPlans', date);
    setBusy(false);
    notify('Back to the suggested plan');
    onClose();
  };

  const setUnavailable = async (value) => {
    const ov = data.dayOverrides.find((o) => o.id === date);
    if (value) {
      await actions.create('dayOverrides', { ...(ov || { id: date, date }), status: 'unavailable' });
      notify(`${relativeDay(date, today)} marked unavailable — its mileage has moved to other days`);
    } else if (ov && !ov.blocks && !ov.dayType) {
      await actions.remove('dayOverrides', date); // only existed to mark the day unavailable
      notify(`${relativeDay(date, today)} is available again`);
    } else {
      await actions.update('dayOverrides', date, { status: 'normal' });
      notify(`${relativeDay(date, today)} is available again`);
    }
    onClose();
  };

  const logRow = (r) =>
    open('activity', {
      defaultType: r.type,
      initial: { type: r.type, date, distanceMi: Number(r.distanceMi) || '', durationMin: r.durationMin, startTime: r.time || '' },
    });

  if (!planDay) return null;

  return (
    <Sheet
      title={['Today', 'Tomorrow'].includes(relativeDay(date, today)) ? `${relativeDay(date, today)} · ${formatDate(date, { weekday: false })}` : formatDate(date)}
      onClose={onClose}
      footer={
        unavailable ? null : (
          <>
            <button className="btn danger" onClick={() => setUnavailable(true)} disabled={busy}>
              Make day unavailable
            </button>
            <span className="grow" />
            {locked && (
              <button className="btn" onClick={resetPlan} disabled={busy}>
                Reset to suggested
              </button>
            )}
            <button className="btn primary" onClick={savePlan} disabled={busy || !dirty}>
              Save plan
            </button>
          </>
        )
      }
    >
      <p className="small muted" style={{ marginTop: -8 }}>
        {day.label}
        {locked ? ' · plan set by you' : ' · suggested plan'}
      </p>

      {unavailable ? (
        <div className="stack">
          <Banner kind="warn">This day is marked as no exercise possible, so nothing is planned. Its mileage has been spread across other days.</Banner>
          <div>
            <button className="btn primary" onClick={() => setUnavailable(false)}>
              Make available again
            </button>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          {rows.length === 0 && <p className="small faint">No sessions planned for this day.</p>}
          {rows.map((r) => (
            <div key={r.key} className="plan-row">
              <div className="row between">
                <input className="input plan-title" value={r.title} onChange={(e) => upd(r.key, { title: e.target.value })} aria-label="Session name" />
                <button className="icon-btn" aria-label="Remove session" onClick={() => (setRows((rs) => rs.filter((x) => x.key !== r.key)), setDirty(true))}>
                  <Icon name="trash" />
                </button>
              </div>
              <div className="plan-fields">
                <Seg value={r.type} onChange={(type) => upd(r.key, { type })} options={[{ value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }]} ariaLabel="Type" />
                <label className="plan-field">
                  <input className="input" inputMode="decimal" value={r.distanceMi} onChange={(e) => upd(r.key, { distanceMi: e.target.value.replace(',', '.') })} aria-label="Planned miles" />
                  <span className="tiny faint">mi</span>
                </label>
                <input className="input plan-time" type="time" value={r.time} onChange={(e) => upd(r.key, { time: e.target.value })} aria-label="Time" />
                <button className="btn small" onClick={() => logRow(r)} title="Log this distance — you can change it before saving">
                  <Icon name="check" /> Log
                </button>
              </div>
            </div>
          ))}
          <div className="row between">
            <button
              className="btn small ghost"
              onClick={() => {
                setRows((rs) => [...rs, toRow({ type: 'run', label: 'Run', distanceMi: '' })]);
                setDirty(true);
              }}
            >
              <Icon name="plus" /> Add session
            </button>
            <span className="small muted num">Planned: {total} mi</span>
          </div>
          <p className="tiny faint" style={{ margin: 0 }}>
            “Log” records the distance as done, using the planned figure as a starting point you can change. To change this day’s time blocks or type, use the calendar.
          </p>
        </div>
      )}
    </Sheet>
  );
}
