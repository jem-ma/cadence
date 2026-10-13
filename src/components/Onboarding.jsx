import { useState } from 'react';
import { useStore, api } from '../lib/store.jsx';
import { Field, Banner, ActivityPills, UnitSeg } from './ui.jsx';
import { Logo } from './Auth.jsx';
import { DayTypeEditor } from './DayTypeEditor.jsx';
import { addDays, endOfMonth, formatDate, startOfMonth, startOfWeek, MONTHS, parseDate, DAY_NAMES } from '../shared/dates.js';
import { defaultWeekTemplate, DEFAULT_PERSONAL, PLACEHOLDER_DAY_TYPES, typeDefFor } from '../shared/schedule.js';
import { DEFAULT_TRAINING } from '../shared/planner.js';
import { ACTIVITY_TYPES, ACTIVITY_ORDER, isDistanceType } from '../shared/activities.js';
import { toMiles, toUnit } from '../shared/units.js';
import { openingBalanceDate } from '../shared/calc.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_WEEK = { 1: 'wfh', 2: 'wfh', 3: 'wfh', 4: 'wfh', 5: 'wfh', 6: 'weekend', 0: 'weekend' };
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const shown = (mi, unit) => String(Math.round(toUnit(mi, unit) * 10) / 10);

/** First-run setup for a new account. Everything here can be changed later. */
export function Onboarding() {
  const { profile, actions, today, notify } = useStore();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const monthStart = today.slice(8) > '20' ? startOfMonth(addDays(endOfMonth(today), 1)) : startOfMonth(today);

  const [unit, setUnit] = useState('mi');
  const [c, setC] = useState({
    name: `${MONTHS[parseDate(monthStart).getMonth()]} 100`,
    target: '100',
    startDate: monthStart,
    endDate: endOfMonth(monthStart),
    types: ['walk', 'run'],
    done: {},
  });
  const [dayTypes, setDayTypes] = useState(PLACEHOLDER_DAY_TYPES.map((t) => ({ ...t })));
  const [week, setWeek] = useState(DEFAULT_WEEK);
  const [personal, setPersonal] = useState({ ...DEFAULT_PERSONAL, extraWalk: { ...DEFAULT_PERSONAL.extraWalk } });
  const [t, setT] = useState({ easyRunMi: shown(DEFAULT_TRAINING.easyRunMi, 'mi'), longRunMinMi: shown(DEFAULT_TRAINING.longRunMinMi, 'mi'), longRunMaxMi: shown(DEFAULT_TRAINING.longRunMaxMi, 'mi'), maxRunDaysPerWeek: String(DEFAULT_TRAINING.maxRunDaysPerWeek) });

  const runCounted = c.types.includes('run');
  const totalSteps = runCounted ? 3 : 2;
  const distanceTypes = ACTIVITY_ORDER.filter((x) => c.types.includes(x) && isDistanceType(x));
  const startedAlready = c.startDate < today;

  // Distance done before using Cadence goes on the last day of the previous week, so this week starts clear.
  const balanceDate = openingBalanceDate(today, c.startDate);
  const balanceNote =
    balanceDate === addDays(startOfWeek(today), -1)
      ? `This is added to the end of last week (${formatDate(balanceDate, { short: true })}), so this week starts clear.`
      : `Your challenge began this week, so this is dated its first day (${formatDate(balanceDate, { short: true })}).`;

  const usedTypes = [...new Set(Object.values(week))].map((id) => typeDefFor(id, { dayTypes, personal }));
  const hasOffice = usedTypes.some((d) => d.base === 'office');

  // Switching unit relabels what you've typed (100 stays 100, now km). Only the suggested
  // defaults — run and walk distances — are converted, so "3.5 mi" becomes "5.6 km".
  const changeUnit = (u) => {
    if (u === unit) return;
    const conv = (v) => (v === '' || isNaN(Number(v)) ? v : String(Math.round(toUnit(toMiles(Number(v), unit), u) * 10) / 10));
    setT((s) => ({ ...s, easyRunMi: conv(s.easyRunMi), longRunMinMi: conv(s.longRunMinMi), longRunMaxMi: conv(s.longRunMaxMi) }));
    setPersonal((p) => ({ ...p, commuteWalkMi: conv(String(p.commuteWalkMi)), extraWalk: { ...p.extraWalk, mi: conv(String(p.extraWalk.mi)) } }));
    setUnit(u);
  };

  const updateTypes = (next) => {
    setDayTypes(next);
    // days that used a removed type fall back to the first remaining one
    if (next.length) setWeek((w) => Object.fromEntries(Object.entries(w).map(([wd, id]) => [wd, next.some((x) => x.id === id) ? id : next[0].id])));
  };

  const next = () => {
    if (step === 0) {
      if (!c.name.trim()) return notify('Give your challenge a name', 'error');
      if (!(num(c.target) > 0)) return notify('Set a target distance', 'error');
      if (c.endDate < c.startDate) return notify('The end date must be after the start', 'error');
      if (!distanceTypes.length) return notify('Choose at least one activity that has a distance (walking, running, cycling or swimming)', 'error');
    }
    if (step === 1 && dayTypes.length === 0) return notify('Add at least one day type', 'error');
    setStep(step + 1);
  };

  const finish = async () => {
    if (runCounted && [t.easyRunMi, t.longRunMinMi, t.longRunMaxMi, t.maxRunDaysPerWeek].some((v) => !(num(v) > 0))) return notify('Running preferences need positive numbers', 'error');
    if (runCounted && num(t.longRunMaxMi) < num(t.longRunMinMi)) return notify('“Longer runs up to” must be at least “from”', 'error');
    setBusy(true);
    try {
      const challengeId = `ch-${c.startDate}-${Date.now().toString(36)}`;
      await actions.create('challenges', {
        id: challengeId,
        name: c.name.trim(),
        targetMiles: toMiles(num(c.target), unit),
        startDate: c.startDate,
        endDate: c.endDate,
        activityTypes: ACTIVITY_ORDER.filter((x) => c.types.includes(x)),
      });
      if (startedAlready) {
        for (const type of distanceTypes) {
          const mi = toMiles(num(c.done[type]), unit);
          if (mi > 0)
            await actions.create('activities', {
              id: `baseline-${type}-${challengeId}`,
              date: balanceDate,
              type,
              distanceMi: mi,
              durationMin: null,
              notes: 'Opening balance: distance completed before using Cadence.',
              source: 'baseline',
              isBaseline: true,
              force: true,
            });
        }
      }
      const P = {
        runFromPlace: DEFAULT_PERSONAL.runFromPlace,
        commuteWalkMi: hasOffice ? toMiles(num(personal.commuteWalkMi), unit) : 0,
        extraWalk: {
          ...personal.extraWalk,
          enabled: hasOffice && personal.extraWalk.enabled,
          mi: toMiles(num(personal.extraWalk.mi), unit),
          min: num(personal.extraWalk.min) || Math.round(toMiles(num(personal.extraWalk.mi), unit) * 20),
        },
      };
      await actions.update('calendar', 'weekTemplate', { template: defaultWeekTemplate(week, { personal: P, dayTypes }) });
      const training = { ...(profile.training || DEFAULT_TRAINING) };
      if (runCounted) {
        training.easyRunMi = toMiles(num(t.easyRunMi), unit);
        training.longRunMinMi = toMiles(num(t.longRunMinMi), unit);
        training.longRunMaxMi = toMiles(num(t.longRunMaxMi), unit);
        training.maxRunDaysPerWeek = num(t.maxRunDaysPerWeek);
      }
      await actions.update('profile', profile.id, { units: unit, personal: P, dayTypes, training, activeChallengeId: challengeId, onboarded: true });
      await actions.reload();
      notify('All set — here is your plan');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!window.confirm('Replace this new account with the data in that file?')) return;
      const r = await api('/import', { method: 'POST', body: { confirm: 'REPLACE', export: parsed } });
      await actions.reload();
      notify(`Imported ${r.counts.activities} activities, ${r.counts.foods} food entries and your calendar`);
    } catch (e) {
      notify(e.message || 'Could not read that file', 'error');
    }
  };

  const setPW = (patch) => setPersonal((p) => ({ ...p, ...patch }));
  const setEW = (patch) => setPersonal((p) => ({ ...p, extraWalk: { ...p.extraWalk, ...patch } }));
  const isLast = step === totalSteps - 1;

  return (
    <div className="onboard">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <Logo />
        <span className="small muted">
          Step {step + 1} of {totalSteps}
        </span>
      </div>
      <h1 style={{ marginBottom: 6 }}>{['Your challenge', 'Your usual week', 'Your running'][step]}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {
          [
            'Set the distance you’re aiming for and what counts towards it. You can change any of this later.',
            'Make a list of the kinds of day you have, then pick one for each day of the week. Exact times can be fine-tuned later in the calendar.',
            'These keep suggestions comfortable. The planner never jumps far beyond what you’ve recently done.',
          ][step]
        }
      </p>

      <div className="card stack" style={{ marginTop: 14 }}>
        {step === 0 && (
          <>
            <Field label="Challenge name">
              <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </Field>
            <Field label="Target">
              <div className="field-row">
                <input className="input" inputMode="decimal" value={c.target} onChange={(e) => setC({ ...c, target: e.target.value.replace(',', '.') })} aria-label="Target distance" />
                <UnitSeg value={unit} onChange={changeUnit} />
              </div>
            </Field>
            <Field label="What counts" hint="Pick as many as apply.">
              <ActivityPills value={c.types} onChange={(types) => setC({ ...c, types })} />
              {c.types.includes('box') && <span className="hint">Boxing is tracked by time, so it counts as an active day but doesn’t add to the distance target.</span>}
            </Field>
            <div className="form-grid">
              <Field label="Start">
                <input className="input" type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} />
              </Field>
              <Field label="End">
                <input className="input" type="date" value={c.endDate} onChange={(e) => setC({ ...c, endDate: e.target.value })} />
              </Field>
            </div>
            {startedAlready && distanceTypes.length > 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div>
                  <div className="small" style={{ fontWeight: 500 }}>
                    Already done some distance this challenge?
                  </div>
                  <div className="tiny faint">{balanceNote}</div>
                </div>
                <div className="form-grid">
                  {distanceTypes.map((type) => (
                    <Field key={type} label={`${ACTIVITY_TYPES[type].label} so far (${unit})`}>
                      <input className="input" inputMode="decimal" placeholder="0" value={c.done[type] ?? ''} onChange={(e) => setC({ ...c, done: { ...c.done, [type]: e.target.value.replace(',', '.') } })} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Your day types" hint="These are suggestions. Remove any you don’t need and add your own. New ones start as a flexible day.">
              <DayTypeEditor types={dayTypes} onChange={updateTypes} />
            </Field>
            <hr className="sep" style={{ margin: '2px 0' }} />
            <div className="small" style={{ fontWeight: 500 }}>
              What is each day of the week usually?
            </div>
            <div className="week-picker">
              {WEEK_ORDER.map((wd) => (
                <label key={wd} className="week-pick">
                  <span className="wp-day">{DAY_NAMES[wd]}</span>
                  <select className="input" value={week[wd]} onChange={(e) => setWeek({ ...week, [wd]: e.target.value })} disabled={!dayTypes.length}>
                    {dayTypes.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {hasOffice && (
              <>
                <Field label={`Walking you usually do as part of an office-day commute (${unit})`} hint="Counts towards your challenge when you log it. Leave at 0 if none.">
                  <input className="input" inputMode="decimal" value={personal.commuteWalkMi} onChange={(e) => setPW({ commuteWalkMi: e.target.value.replace(',', '.') })} />
                </Field>
                <label className="row small">
                  <input type="checkbox" checked={personal.extraWalk.enabled} onChange={(e) => setEW({ enabled: e.target.checked })} /> On office days I could add a longer walk (e.g. get off a stop early)
                </label>
                {personal.extraWalk.enabled && (
                  <div className="form-grid">
                    <Field label="Describe it" className="full">
                      <input className="input" value={personal.extraWalk.label} onChange={(e) => setEW({ label: e.target.value })} placeholder="Walk home from two stops early" />
                    </Field>
                    <Field label={`Extra distance (${unit})`}>
                      <input className="input" inputMode="decimal" value={personal.extraWalk.mi} onChange={(e) => setEW({ mi: e.target.value.replace(',', '.') })} />
                    </Field>
                    <Field label="Takes (minutes)">
                      <input className="input" inputMode="numeric" value={personal.extraWalk.min} onChange={(e) => setEW({ min: e.target.value })} />
                    </Field>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 2 && (
          <div className="form-grid">
            <Field label={`A comfortable easy run (${unit})`}>
              <input className="input" inputMode="decimal" value={t.easyRunMi} onChange={(e) => setT({ ...t, easyRunMi: e.target.value.replace(',', '.') })} />
            </Field>
            <Field label="Most run days in a week">
              <input className="input" inputMode="numeric" value={t.maxRunDaysPerWeek} onChange={(e) => setT({ ...t, maxRunDaysPerWeek: e.target.value })} />
            </Field>
            <Field label={`Longer runs from (${unit})`}>
              <input className="input" inputMode="decimal" value={t.longRunMinMi} onChange={(e) => setT({ ...t, longRunMinMi: e.target.value.replace(',', '.') })} />
            </Field>
            <Field label={`Longer runs up to (${unit})`}>
              <input className="input" inputMode="decimal" value={t.longRunMaxMi} onChange={(e) => setT({ ...t, longRunMaxMi: e.target.value.replace(',', '.') })} />
            </Field>
          </div>
        )}

        <div className="row" style={{ marginTop: 6 }}>
          {step > 0 && (
            <button className="btn" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </button>
          )}
          <span className="grow" />
          {!isLast ? (
            <button className="btn primary" onClick={next}>
              Continue
            </button>
          ) : (
            <button className="btn primary" onClick={finish} disabled={busy}>
              {busy ? 'Setting up…' : 'Start my plan'}
            </button>
          )}
        </div>
      </div>

      {step === 0 && (
        <div style={{ marginTop: 16 }}>
          <Banner>
            Moving from another copy of Cadence?{' '}
            <label className="link-btn" style={{ display: 'inline' }}>
              Import an export file
              <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files[0] && importFile(e.target.files[0])} />
            </label>{' '}
            instead of setting up from scratch.
          </Banner>
        </div>
      )}
    </div>
  );
}
