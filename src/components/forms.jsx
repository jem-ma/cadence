import { useMemo, useState } from 'react';
import { useStore, api } from '../lib/store.jsx';
import { Field, Seg, Scale, Sheet, Icon, Confirm, Banner, ActivityPills, UnitSeg } from './ui.jsx';
import { formatDate, minToTime, nowMinutes, toISODate, timeToMin, addDays, endOfMonth } from '../shared/dates.js';
import { round2, validateActivity, countsToward } from '../shared/calc.js';
import { toUnit, toMiles, fmtDist, wordDist } from '../shared/units.js';
import { ACTIVITY_ORDER, isDistanceType, typeNoun } from '../shared/activities.js';
import { BLOCK_KINDS, DAY_STATUSES, DAY_TYPES, blocksForType, dayTypeOptions, resolveDay } from '../shared/schedule.js';

const nowTime = (now) => minToTime(nowMinutes(now));

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */
function parseDuration(v) {
  if (v === '' || v == null) return null;
  const s = String(v).trim();
  if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(s)) {
    const p = s.split(':').map(Number);
    return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60; // h:mm:ss or mm:ss
  }
  const n = Number(s);
  return isNaN(n) ? NaN : n;
}

const PRESETS = {
  mi: { run: [2, 3.1, 4, 5, 6.2, 8], walk: [1, 2, 3, 5], cycle: [10, 20, 30, 50], swim: [0.5, 1, 1.5] },
  km: { run: [3, 5, 8, 10, 15, 21.1], walk: [2, 3, 5, 8], cycle: [15, 30, 50, 80], swim: [0.5, 1, 1.5, 2] },
};
const presetLabel = (unit, p) => (unit === 'mi' ? (p === 3.1 ? '5K' : p === 6.2 ? '10K' : `${p} mi`) : p === 5 ? '5K' : p === 10 ? '10K' : p === 21.1 ? 'Half' : `${p} km`);

export function ActivityForm({ initial, defaultType = 'run', onClose }) {
  const { today, now, actions, notify, challenge, coaching, units } = useStore();
  const editing = !!initial?.id;
  const counted = ACTIVITY_ORDER.filter((t) => (challenge?.activityTypes || ['run', 'walk']).includes(t));
  const allowed = initial?.type && !counted.includes(initial.type) ? [...counted, initial.type] : counted;
  const firstType = initial?.type || (allowed.includes(defaultType) ? defaultType : allowed[0] || 'run');
  const [type, setType] = useState(firstType);
  const [unit, setUnit] = useState(units);
  const [dist, setDist] = useState(initial?.distanceMi > 0 ? String(Math.round(toUnit(initial.distanceMi, units) * 100) / 100) : '');
  const [dur, setDur] = useState(initial?.durationMin != null ? String(initial.durationMin) : '');
  const [date, setDate] = useState(initial?.date || today);
  const [time, setTime] = useState(initial?.startTime || (editing ? '' : nowTime(now)));
  const [effort, setEffort] = useState(initial?.effort ?? null);
  const [notes, setNotes] = useState(initial?.notes || '');
  const [errors, setErrors] = useState({});
  const [dup, setDup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const hasDistance = isDistanceType(type);
  const distanceMi = hasDistance ? toMiles(Number(dist), unit) : 0;
  const presets = PRESETS[unit][type] || [];
  const changeUnit = (u) => {
    if (u === unit) return;
    if (dist !== '' && !isNaN(Number(dist))) setDist(String(Math.round(toUnit(toMiles(Number(dist), unit), u) * 100) / 100));
    setUnit(u);
  };

  const save = async (force = false) => {
    const durationMin = parseDuration(dur);
    const doc = { ...(initial || {}), type, date, startTime: time || null, distanceMi: round2(distanceMi), durationMin: durationMin == null ? null : Math.round(durationMin), effort, notes };
    const errs = validateActivity(doc);
    if (isNaN(durationMin)) errs.durationMin = 'Use minutes (35) or h:mm (1:05)';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (editing) await actions.update('activities', initial.id, doc);
      else await actions.create('activities', { ...doc, force });
      await actions.reload();
      const counts = challenge && countsToward({ ...doc, excluded: initial?.excluded }, challenge);
      const left = coaching ? Math.max(0, coaching.status.remainingMi - (counts ? doc.distanceMi - (initial?.distanceMi || 0) : 0)) : null;
      const what = hasDistance ? `${fmtDist(doc.distanceMi)} ${typeNoun(type).toLowerCase()}` : `${doc.durationMin} min ${typeNoun(type).toLowerCase()}`;
      notify(`${editing ? 'Updated' : 'Logged'} ${what}${counts && hasDistance && left != null ? ` — ${wordDist(left)} to go` : ''}`);
      onClose();
    } catch (e) {
      if (e.status === 409 && e.body?.duplicate) setDup(e.body.duplicate);
      else if (e.body?.fields) setErrors(e.body.fields);
      else notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleExclude = async () => {
    await actions.update('activities', initial.id, { excluded: !initial.excluded });
    await actions.reload();
    notify(initial.excluded ? 'Included in the challenge again' : 'Excluded from the challenge');
    onClose();
  };

  if (confirmDelete)
    return (
      <Confirm
        title="Delete this activity?"
        message="This permanently removes the activity and recalculates your totals."
        onConfirm={async () => {
          await actions.remove('activities', initial.id);
          notify('Activity deleted');
          onClose();
        }}
        onClose={() => setConfirmDelete(false)}
      />
    );

  return (
    <Sheet
      title={editing ? 'Edit activity' : type === 'box' ? 'Log boxing' : `Log a ${typeNoun(type).toLowerCase()}`}
      onClose={onClose}
      footer={
        <>
          {editing && (
            <>
              <button className="btn danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" /> Delete
              </button>
              <button className="btn" onClick={toggleExclude}>
                {initial.excluded ? 'Include in challenge' : 'Exclude from challenge'}
              </button>
            </>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {initial?.reviewNote && (
        <div style={{ marginBottom: 12 }}>
          <Banner kind="warn">{initial.reviewNote}</Banner>
        </div>
      )}
      {initial?.isBaseline && (
        <div style={{ marginBottom: 12 }}>
          <Banner>This is an opening-balance entry for distance done before you started using Cadence. Edit it if the starting figure was wrong.</Banner>
        </div>
      )}
      {dup && (
        <div style={{ marginBottom: 12 }}>
          <Banner kind="warn">
            This looks like something you’ve already logged: {typeNoun(dup.type).toLowerCase()}
            {isDistanceType(dup.type) ? ` of ${fmtDist(dup.distanceMi)}` : ''} on {formatDate(dup.date, { short: true })}. Save anyway only if it’s a separate activity.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" onClick={() => setDup(null)}>
                Don’t save
              </button>
              <button className="btn small primary" onClick={() => save(true)}>
                Save anyway
              </button>
            </div>
          </Banner>
        </div>
      )}
      <div className="stack">
        {allowed.length > 1 && (
          <Seg full value={type} onChange={setType} ariaLabel="Activity type" options={allowed.map((t) => ({ value: t, label: typeNoun(t) }))} />
        )}
        {hasDistance && (
          <Field label="Distance" error={errors.distanceMi} hint={dist && unit !== units ? `= ${fmtDist(distanceMi)}` : null}>
            <div className="row">
              <input className={`input grow ${errors.distanceMi ? 'invalid' : ''}`} inputMode="decimal" placeholder="0.0" value={dist} onChange={(e) => setDist(e.target.value.replace(',', '.'))} aria-label="Distance" />
              <Seg value={unit} onChange={changeUnit} ariaLabel="Units" options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]} />
            </div>
            {!editing && presets.length > 0 && (
              <div className="row wrap" style={{ marginTop: 4 }}>
                {presets.map((p) => (
                  <button key={p} type="button" className="chip" style={{ cursor: 'pointer', border: 'none' }} onClick={() => setDist(String(p))}>
                    {presetLabel(unit, p)}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        <div className="form-grid">
          <Field label="Duration" hint={hasDistance ? 'Minutes, or h:mm' : 'How long it lasted — minutes, or h:mm'} error={errors.durationMin}>
            <input className="input" inputMode="numeric" placeholder="e.g. 35" value={dur} onChange={(e) => setDur(e.target.value)} />
          </Field>
          <Field label="Date" error={errors.date}>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        {!hasDistance && <p className="tiny faint" style={{ margin: 0 }}>Boxing is tracked by time. It counts as an active day but doesn’t add to your distance target.</p>}
        <details className="more" open={editing && (effort || notes || time)}>
          <summary>Time, effort and notes</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <Field label="Start time (optional)" error={errors.startTime}>
              <input className="input" type="time" value={time || ''} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="How hard did it feel?">
              <Scale value={effort} onChange={setEffort} low="Very easy" high="Max effort" ariaLabel="Perceived effort" />
            </Field>
            <Field label="Notes">
              <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Route, how it felt, anything useful" />
            </Field>
          </div>
        </details>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Energy & wellbeing                                                  */
/* ------------------------------------------------------------------ */
export function EnergyForm({ initial, onClose }) {
  const { today, now, actions, notify } = useStore();
  const [v, setV] = useState({
    energy: initial?.energy ?? null,
    sleepHours: initial?.sleepHours ?? '',
    sleepQuality: initial?.sleepQuality ?? null,
    mood: initial?.mood ?? null,
    soreness: initial?.soreness ?? null,
    fatigue: initial?.fatigue ?? null,
    motivation: initial?.motivation ?? null,
    recovery: initial?.recovery ?? null,
    cycle: initial?.cycle || '',
    notes: initial?.notes || '',
  });
  const set = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const save = async () => {
    if (v.energy == null && !v.notes && !v.cycle) return notify('Pick an energy level or add a note', 'error');
    const doc = { ...(initial || {}), ...v, sleepHours: v.sleepHours === '' ? null : Number(v.sleepHours), date: initial?.date || today, time: initial?.time || nowTime(now) };
    if (initial?.id) await actions.update('energyLogs', initial.id, doc);
    else await actions.create('energyLogs', doc);
    notify('Wellbeing saved — today’s plan has been updated');
    onClose();
  };
  return (
    <Sheet
      title="How are you feeling?"
      onClose={onClose}
      footer={
        <>
          {initial?.id && (
            <button
              className="btn danger"
              onClick={async () => {
                await actions.remove('energyLogs', initial.id);
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Energy">
          <Scale value={v.energy} onChange={set('energy')} low="Exhausted" high="Full of energy" ariaLabel="Energy" />
        </Field>
        <details className="more" open={!!initial && Object.entries(v).some(([k, x]) => k !== 'energy' && x !== null && x !== '')}>
          <summary>Sleep, soreness, cycle and more (optional)</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="form-grid">
              <Field label="Sleep (hours)">
                <input className="input" inputMode="decimal" value={v.sleepHours} onChange={(e) => set('sleepHours')(e.target.value)} placeholder="7.5" />
              </Field>
              <Field label="Cycle / symptoms">
                <input className="input" value={v.cycle} onChange={(e) => set('cycle')(e.target.value)} placeholder="e.g. period day 2, cramps" />
              </Field>
            </div>
            <Field label="Sleep quality">
              <Scale value={v.sleepQuality} onChange={set('sleepQuality')} low="Poor" high="Great" />
            </Field>
            <Field label="Muscle soreness">
              <Scale value={v.soreness} onChange={set('soreness')} low="None" high="Very sore" />
            </Field>
            <Field label="General fatigue">
              <Scale value={v.fatigue} onChange={set('fatigue')} low="Fresh" high="Wiped out" />
            </Field>
            <Field label="Mood">
              <Scale value={v.mood} onChange={set('mood')} low="Low" high="Great" />
            </Field>
            <Field label="Motivation">
              <Scale value={v.motivation} onChange={set('motivation')} low="None" high="Raring to go" />
            </Field>
            <Field label="Recovery">
              <Scale value={v.recovery} onChange={set('recovery')} low="Not recovered" high="Fully recovered" />
            </Field>
            <Field label="Notes">
              <textarea className="input" value={v.notes} onChange={(e) => set('notes')(e.target.value)} />
            </Field>
          </div>
        </details>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Food                                                                */
/* ------------------------------------------------------------------ */
export function mealForTime(min) {
  if (min < 10.5 * 60) return 'breakfast';
  if (min < 12 * 60) return 'snack';
  if (min < 14.5 * 60) return 'lunch';
  if (min < 17.5 * 60) return 'snack';
  return 'dinner';
}

export async function resizeImage(file, max = 900) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function FoodForm({ initial, onClose }) {
  const { today, now, actions, notify, integrations } = useStore();
  const [text, setText] = useState(initial?.text || '');
  const [meal, setMeal] = useState(initial?.meal || mealForTime(nowMinutes(now)));
  const [time, setTime] = useState(initial?.time || nowTime(now));
  const [date, setDate] = useState(initial?.date || today);
  const [portion, setPortion] = useState(initial?.portion || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [photo, setPhoto] = useState(initial?.photo || null);
  const [estimate, setEstimate] = useState(initial?.estimate || null);
  const [busy, setBusy] = useState(false);
  const aiOn = integrations?.ai?.enabled;

  const runEstimate = async () => {
    setBusy(true);
    try {
      const r = await api('/food/estimate', { method: 'POST', body: { text, portion, notes, photo } });
      setEstimate(r);
      if (r.aiError) notify(`AI unavailable (${r.aiError}) — used the built-in food list`, 'error');
      return r;
    } catch (e) {
      notify(e.message, 'error');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!text.trim() && !photo) return notify('Describe what you ate', 'error');
    setBusy(true);
    let est = estimate;
    if (!est || (initial && initial.text !== text && est.source !== 'you')) est = await runEstimate();
    const doc = { ...(initial || {}), text: text.trim(), meal, time, date, portion, notes, photo, estimate: est };
    try {
      if (initial?.id) await actions.update('foods', initial.id, doc);
      else await actions.create('foods', doc);
      notify(`${meal[0].toUpperCase() + meal.slice(1)} logged`);
      onClose();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setTotal = (k) => (e) => {
    const val = e.target.value === '' ? 0 : Number(e.target.value);
    setEstimate((s) => ({ ...(s || { items: [] }), source: 'you', confidence: 'user', note: 'Corrected by you.', totals: { ...(s?.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0 }), [k]: val } }));
  };

  return (
    <Sheet
      title={initial?.id ? 'Edit food' : 'Log food'}
      onClose={onClose}
      footer={
        <>
          {initial?.id && (
            <button
              className="btn danger"
              onClick={async () => {
                await actions.remove('foods', initial.id);
                notify('Food entry deleted');
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="What did you eat?" hint="Plain words are fine — e.g. “Porridge with banana and peanut butter”">
          <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Chicken wrap and crisps" />
        </Field>
        <Seg full value={meal} onChange={setMeal} ariaLabel="Meal" options={['breakfast', 'lunch', 'dinner', 'snack', 'other'].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))} />
        <details className="more" open={!!(initial && (portion || notes || photo))}>
          <summary>Portion, time, photo and notes</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="form-grid">
              <Field label="Time">
                <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              <Field label="Date">
                <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
            <Field label="Portion / quantity">
              <input className="input" value={portion} onChange={(e) => setPortion(e.target.value)} placeholder="e.g. large bowl, 2 slices" />
            </Field>
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Homemade, from the canteen…" />
            </Field>
            <Field label="Photo" hint={aiOn ? 'The AI can use the photo to improve the estimate.' : 'Stored with the entry. (Photo analysis needs the AI integration.)'}>
              <div className="row">
                <label className="btn small" style={{ cursor: 'pointer' }}>
                  <Icon name="camera" /> {photo ? 'Replace photo' : 'Add photo'}
                  <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => e.target.files[0] && setPhoto(await resizeImage(e.target.files[0]))} />
                </label>
                {photo && (
                  <>
                    <img src={photo} alt="Food" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }} />
                    <button className="btn small ghost" onClick={() => setPhoto(null)}>
                      Remove
                    </button>
                  </>
                )}
              </div>
            </Field>
          </div>
        </details>

        <div className="card tinted" style={{ padding: 14 }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong className="small">Nutrition estimate</strong>
            <button className="btn small" disabled={busy || (!text.trim() && !photo)} onClick={runEstimate}>
              <Icon name="refresh" /> {estimate ? 'Re-estimate' : 'Estimate'}
            </button>
          </div>
          {estimate ? (
            <>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  ['kcal', 'kcal'],
                  ['protein', 'Protein g'],
                  ['carbs', 'Carbs g'],
                  ['fat', 'Fat g'],
                ].map(([k, l]) => (
                  <Field key={k} label={l}>
                    <input className="input" inputMode="numeric" value={Math.round(estimate.totals?.[k] || 0)} onChange={setTotal(k)} />
                  </Field>
                ))}
              </div>
              <p className="tiny faint" style={{ marginTop: 8 }}>
                {estimate.source === 'you'
                  ? 'Your corrected values.'
                  : `≈ Estimate (${estimate.source === 'ai' ? 'AI' : 'typical portions'}, ${estimate.confidence} confidence). ${estimate.note || ''}`}
                {estimate.items?.length > 0 && estimate.source !== 'you' && <> Recognised: {estimate.items.map((i) => i.name).join(', ')}.</>}
                {estimate.unmatched?.length > 0 && <> Not recognised: {estimate.unmatched.join(', ')}.</>}
                {estimate.assumptions?.length > 0 && <> Assumed: {estimate.assumptions.join('; ')}.</>}
              </p>
            </>
          ) : (
            <p className="tiny faint" style={{ margin: 0 }}>
              Optional. Estimates are approximate and never required for coaching. {aiOn ? 'Uses AI.' : 'Uses a built-in list of common foods.'}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar: blocks, day editor, events, cycle                         */
/* ------------------------------------------------------------------ */
export function BlocksEditor({ blocks, onChange }) {
  const upd = (i, patch) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {blocks.length === 0 && <p className="small faint">No time blocks — the whole day is treated as open but unplanned.</p>}
      {blocks.map((b, i) => (
        <div key={b.id || i} className="block-row">
          <input className="input" type="time" aria-label="Start" value={b.start} onChange={(e) => upd(i, { start: e.target.value })} />
          <input className="input" type="time" aria-label="End" value={b.end} onChange={(e) => upd(i, { end: e.target.value })} />
          <div className="row bl-label" style={{ gap: 6 }}>
            <select className="input" style={{ maxWidth: 170 }} value={b.kind} onChange={(e) => upd(i, { kind: e.target.value })} aria-label="Kind">
              {Object.entries(BLOCK_KINDS).map(([k, d]) => (
                <option key={k} value={k}>
                  {d.label}
                </option>
              ))}
            </select>
            <input className="input grow" value={b.label} placeholder="Label" onChange={(e) => upd(i, { label: e.target.value })} aria-label="Label" />
          </div>
          <button className="icon-btn" aria-label="Remove block" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <div>
        <button
          className="btn small"
          onClick={() => {
            const last = blocks[blocks.length - 1];
            const start = last ? last.end : '12:00';
            onChange([...blocks, { id: `b${Date.now()}`, start, end: minToTime(Math.min(timeToMin(start) + 60, 23 * 60 + 59)), kind: 'optional', label: 'Exercise window' }]);
          }}
        >
          <Icon name="plus" /> Add time block
        </button>
      </div>
    </div>
  );
}

export function DayEditor({ date, onClose }) {
  const { cal, data, actions, notify, today } = useStore();
  const day = useMemo(() => resolveDay(date, cal), [date, cal]);
  const override = data.dayOverrides.find((o) => o.id === date);
  const [dayType, setDayType] = useState(day.dayType);
  const [status, setStatus] = useState(day.status);
  const [blocks, setBlocks] = useState(day.blocks);
  const [notes, setNotes] = useState(override?.notes || '');
  const [eventDraft, setEventDraft] = useState(null);
  const [sessionDraft, setSessionDraft] = useState(null);

  const changeType = (t) => {
    setDayType(t);
    setBlocks(blocksForType(t, cal));
  };

  const save = async () => {
    for (const b of blocks) {
      if (!b.start || !b.end || b.end <= b.start) return notify('Each block needs an end time after its start', 'error');
    }
    await actions.create('dayOverrides', { id: date, date, dayType, status, blocks, notes });
    notify('Day updated — your plan has been recalculated');
    onClose();
  };
  const revert = async () => {
    await actions.remove('dayOverrides', date);
    notify('Back to your weekly pattern');
    onClose();
  };
  const periodHere = data.cycle.find((c) => c.startDate === date);

  return (
    <Sheet
      title={formatDate(date, { year: false })}
      onClose={onClose}
      wide
      footer={
        <>
          {override && (
            <button className="btn" onClick={revert}>
              Revert to weekly pattern
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save day
          </button>
        </>
      }
    >
      <div className="stack">
        {date < today && <Banner>This day is in the past. Changes only affect records, not your plan.</Banner>}
        <div className="form-grid">
          <Field label="Type of day">
            <select className="input" value={dayType} onChange={(e) => changeType(e.target.value)}>
              {dayTypeOptions(cal).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Availability">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(DAY_STATUSES).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div>
          <div className="section-title">Time blocks</div>
          <p className="tiny faint" style={{ marginTop: -4 }}>
            Mark what’s genuinely unavailable, what’s free but inconvenient, and your preferred or optional exercise windows.
          </p>
          <BlocksEditor blocks={blocks} onChange={setBlocks} />
        </div>
        <Field label="Notes">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the coach should know" />
        </Field>

        <hr className="sep" />
        <div className="row between">
          <div className="section-title" style={{ margin: 0 }}>
            Commitments
          </div>
          <button className="btn small" onClick={() => setEventDraft({ date, title: '', start: '', end: '', travelMin: '', blocksExercise: true, kind: 'commitment' })}>
            <Icon name="plus" /> Add
          </button>
        </div>
        {day.events.map((e) => (
          <div key={e.id} className="list-item">
            <div className="icon neutral">
              <Icon name="clock" />
            </div>
            <div className="grow">
              <div className="title">{e.title}</div>
              <div className="sub">
                {e.start ? `${e.start}–${e.end}` : 'All day'}
                {e.travelMin ? ` · ${e.travelMin} min travel` : ''}
                {e.blocksExercise === false ? ' · doesn’t block exercise' : ''}
              </div>
            </div>
            <button className="icon-btn" onClick={() => setEventDraft(e)} aria-label="Edit">
              <Icon name="edit" />
            </button>
          </div>
        ))}
        {eventDraft && <EventEditor draft={eventDraft} onDone={() => setEventDraft(null)} />}

        <hr className="sep" />
        <div className="row between">
          <div className="section-title" style={{ margin: 0 }}>
            Your planned sessions
          </div>
          <button className="btn small" onClick={() => setSessionDraft({ date, type: 'run', distanceMi: '', time: '', title: '' })}>
            <Icon name="plus" /> Add
          </button>
        </div>
        <p className="tiny faint" style={{ marginTop: -6 }}>
          Sessions you add here are confirmed; the coach plans around them.
        </p>
        {day.planned.map((p) => (
          <div key={p.id} className="list-item">
            <div className={`icon ${p.type}`}>
              <Icon name={p.type} />
            </div>
            <div className="grow">
              <div className="title">{p.title || (p.type === 'run' ? 'Run' : 'Walk')}</div>
              <div className="sub">
                {fmtDist(p.distanceMi)}{p.time ? ` at ${p.time}` : ''}
              </div>
            </div>
            <button className="icon-btn" onClick={() => setSessionDraft(p)} aria-label="Edit">
              <Icon name="edit" />
            </button>
          </div>
        ))}
        {sessionDraft && <SessionEditor draft={sessionDraft} onDone={() => setSessionDraft(null)} />}

        <hr className="sep" />
        <div className="row between">
          <div>
            <div className="section-title" style={{ margin: 0 }}>
              Cycle
            </div>
            <p className="tiny faint" style={{ margin: 0 }}>
              {day.period.active ? `Period ${day.period.actual ? 'logged' : 'expected'} on this day.` : 'Optional — helps the coach keep plans flexible.'}
            </p>
          </div>
          {periodHere ? (
            <button
              className="btn small"
              onClick={async () => {
                await actions.remove('cycle', periodHere.id);
                notify('Period entry removed');
              }}
            >
              Remove period start
            </button>
          ) : (
            <div className="row">
              <button className="btn small" onClick={async () => { await actions.create('cycle', { startDate: date, endDate: addDays(date, 4), kind: date > today ? 'expected' : 'actual' }); notify('Saved'); }}>
                {date > today ? 'Period expected from here' : 'Period started here'}
              </button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function EventEditor({ draft, onDone }) {
  const { actions, notify } = useStore();
  const [e, setE] = useState(draft);
  const set = (k) => (ev) => setE((s) => ({ ...s, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value }));
  return (
    <div className="card tinted stack" style={{ padding: 14 }}>
      <Field label="Commitment">
        <input className="input" value={e.title} onChange={set('title')} placeholder="Dentist, dinner with friends…" />
      </Field>
      <div className="form-grid">
        <Field label="Start (blank = all day)">
          <input className="input" type="time" value={e.start || ''} onChange={set('start')} />
        </Field>
        <Field label="End">
          <input className="input" type="time" value={e.end || ''} onChange={set('end')} />
        </Field>
        <Field label="Travel time each way (min)">
          <input className="input" inputMode="numeric" value={e.travelMin || ''} onChange={set('travelMin')} />
        </Field>
        <Field label="Type">
          <select className="input" value={e.kind} onChange={set('kind')}>
            <option value="commitment">Commitment</option>
            <option value="travel">Travel</option>
            <option value="mealprep">Meal prep</option>
            <option value="shopping">Shopping</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <label className="row small">
        <input type="checkbox" checked={e.blocksExercise !== false} onChange={set('blocksExercise')} /> Blocks exercise during this time
      </label>
      <div className="row">
        {draft.id && (
          <button
            className="btn small danger"
            onClick={async () => {
              await actions.remove('events', draft.id);
              onDone();
            }}
          >
            Delete
          </button>
        )}
        <span className="grow" />
        <button className="btn small" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn small primary"
          onClick={async () => {
            if (!e.title.trim()) return notify('Give it a name', 'error');
            if (e.start && e.end && e.end <= e.start) return notify('End must be after start', 'error');
            if (draft.id) await actions.update('events', draft.id, e);
            else await actions.create('events', e);
            notify('Commitment saved — plan updated');
            onDone();
          }}
        >
          Save commitment
        </button>
      </div>
    </div>
  );
}

function SessionEditor({ draft, onDone }) {
  const { actions, notify } = useStore();
  const { units } = useStore();
  // distances are typed in the user's unit and stored in miles
  const [s, setS] = useState({ ...draft, distanceMi: draft.distanceMi === '' || draft.distanceMi == null ? '' : String(Math.round(toUnit(draft.distanceMi, units) * 100) / 100) });
  return (
    <div className="card tinted stack" style={{ padding: 14 }}>
      <Seg value={s.type} onChange={(type) => setS({ ...s, type })} options={[{ value: 'run', label: 'Run' }, { value: 'walk', label: 'Walk' }]} />
      <div className="form-grid">
        <Field label={`Distance (${units})`}>
          <input className="input" inputMode="decimal" value={s.distanceMi} onChange={(e) => setS({ ...s, distanceMi: e.target.value })} />
        </Field>
        <Field label="Time">
          <input className="input" type="time" value={s.time || ''} onChange={(e) => setS({ ...s, time: e.target.value })} />
        </Field>
        <Field label="Label (optional)" className="full">
          <input className="input" value={s.title || ''} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="Parkrun, run with a friend…" />
        </Field>
      </div>
      <div className="row">
        {draft.id && (
          <button
            className="btn small danger"
            onClick={async () => {
              await actions.remove('plannedSessions', draft.id);
              onDone();
            }}
          >
            Remove
          </button>
        )}
        <span className="grow" />
        <button className="btn small" onClick={onDone}>
          Cancel
        </button>
        <button
          className="btn small primary"
          onClick={async () => {
            const d = Number(s.distanceMi);
            if (!(d > 0)) return notify('Add a distance', 'error');
            const doc = { ...s, distanceMi: toMiles(d, units), status: 'planned', source: draft.source || 'user' };
            if (draft.id) await actions.update('plannedSessions', draft.id, doc);
            else await actions.create('plannedSessions', doc);
            notify('Session added to your calendar');
            onDone();
          }}
        >
          Save session
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Challenge                                                           */
/* ------------------------------------------------------------------ */
export function ChallengeForm({ initial, onClose }) {
  const { actions, notify, data, today, units } = useStore();
  const nextStart = useMemo(() => {
    const d = new Date();
    return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  }, []);
  const [c, setC] = useState(
    initial || { name: '', startDate: nextStart, endDate: endOfMonth(nextStart), activityTypes: ['run', 'walk'], notes: '' }
  );
  const [unit, setUnit] = useState(units);
  const [target, setTarget] = useState(initial ? String(Math.round(toUnit(initial.targetMiles, units) * 10) / 10) : '100');
  const set = (k) => (e) => setC((s) => ({ ...s, [k]: e.target.value }));
  const changeUnit = (u) => {
    if (u === unit) return;
    if (target !== '' && !isNaN(Number(target))) setTarget(String(Math.round(toUnit(toMiles(Number(target), unit), u) * 10) / 10));
    setUnit(u);
  };
  const save = async () => {
    const t = Number(target);
    if (!c.name.trim()) return notify('Give the challenge a name', 'error');
    if (!(t > 0)) return notify('Target must be more than 0', 'error');
    if (!c.startDate || !c.endDate || c.endDate < c.startDate) return notify('End date must be after the start date', 'error');
    if (!c.activityTypes.some(isDistanceType)) return notify('Choose at least one activity that has a distance', 'error');
    const doc = { ...c, targetMiles: toMiles(t, unit) };
    const profile = data.profile[0];
    if (initial?.id) {
      await actions.update('challenges', initial.id, doc);
      notify('Challenge updated');
    } else {
      const saved = await actions.create('challenges', { ...doc, id: `ch-${c.startDate}-${Date.now().toString(36)}` });
      await actions.update('profile', profile.id, { activeChallengeId: saved.id });
      notify(`${saved.name} is now your active challenge. Previous challenges stay in Settings.`);
    }
    if (unit !== (profile.units || 'mi')) await actions.update('profile', profile.id, { units: unit });
    onClose();
  };
  return (
    <Sheet
      title={initial ? 'Edit challenge' : 'New challenge'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            {initial ? 'Save' : 'Create challenge'}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          <input className="input" value={c.name} onChange={set('name')} placeholder="November 80" />
        </Field>
        <Field label="Target" hint="Distances across the app use the unit you pick here.">
          <div className="field-row">
            <input className="input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(',', '.'))} aria-label="Target distance" />
            <UnitSeg value={unit} onChange={changeUnit} />
          </div>
        </Field>
        <Field label="What counts">
          <ActivityPills value={c.activityTypes} onChange={(activityTypes) => setC((s) => ({ ...s, activityTypes }))} />
          {c.activityTypes.includes('box') && <span className="hint">Boxing is tracked by time, so it doesn’t add to the distance target.</span>}
        </Field>
        <div className="form-grid">
          <Field label="Start">
            <input className="input" type="date" value={c.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="End">
            <input className="input" type="date" value={c.endDate} onChange={set('endDate')} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="input" value={c.notes || ''} onChange={set('notes')} />
        </Field>
        {initial && c.startDate <= today && <p className="tiny faint">Changing dates or target recalculates every total and the plan immediately. Activities are never deleted.</p>}
      </div>
    </Sheet>
  );
}
