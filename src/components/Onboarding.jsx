import { useMemo, useState } from 'react';
import { useStore, api } from '../lib/store.jsx';
import { Field, Seg, Banner } from './ui.jsx';
import { Logo } from './Auth.jsx';
import { addDays, endOfMonth, startOfMonth, MONTHS, parseDate, DAY_NAMES } from '../shared/dates.js';
import { defaultWeekTemplate, DEFAULT_PERSONAL } from '../shared/schedule.js';
import { DEFAULT_TRAINING } from '../shared/planner.js';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TYPE_CHOICES = [
  { value: 'office', label: 'Office / commute day', help: 'Long day away; walking may be part of the commute.' },
  { value: 'nans', label: 'Run-straight-after day', help: 'Working somewhere you can run home or run from afterwards.' },
  { value: 'wfh', label: 'Work from home', help: 'Before work, lunchtime or after-work windows.' },
  { value: 'weekend', label: 'Weekend / day off', help: 'Room for a longer run.' },
  { value: 'free', label: 'Free day', help: 'Mostly flexible.' },
  { value: 'off', label: 'No exercise', help: 'Never plan anything on this day.' },
];

/** First-run setup for a new account. Everything here can be changed later. */
export function Onboarding() {
  const { profile, actions, today, notify } = useStore();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const monthStart = today.slice(8) > '20' ? startOfMonth(addDays(endOfMonth(today), 1)) : startOfMonth(today);
  const [c, setC] = useState({
    name: `${MONTHS[parseDate(monthStart).getMonth()]} ${100}`,
    targetMiles: '100',
    startDate: monthStart,
    endDate: endOfMonth(monthStart),
    run: true,
    walk: true,
    doneRun: '',
    doneWalk: '',
  });
  const [week, setWeek] = useState({ 1: 'wfh', 2: 'wfh', 3: 'wfh', 4: 'wfh', 5: 'wfh', 6: 'weekend', 0: 'weekend' });
  const [personal, setPersonal] = useState({ ...DEFAULT_PERSONAL, extraWalk: { ...DEFAULT_PERSONAL.extraWalk } });
  const [t, setT] = useState({ easyRunMi: DEFAULT_TRAINING.easyRunMi, longRunMinMi: DEFAULT_TRAINING.longRunMinMi, longRunMaxMi: DEFAULT_TRAINING.longRunMaxMi, maxRunDaysPerWeek: DEFAULT_TRAINING.maxRunDaysPerWeek });

  const uses = useMemo(() => new Set(Object.values(week)), [week]);
  const startedAlready = c.startDate < today;

  const next = () => {
    if (step === 0) {
      if (!c.name.trim()) return notify('Give your challenge a name', 'error');
      if (!(Number(c.targetMiles) > 0)) return notify('Set a target distance', 'error');
      if (c.endDate < c.startDate) return notify('The end date must be after the start', 'error');
      if (!c.run && !c.walk) return notify('Choose running, walking or both', 'error');
    }
    setStep(step + 1);
  };

  const finish = async () => {
    const num = (v) => (v === '' || v == null ? 0 : Number(v));
    if ([t.easyRunMi, t.longRunMinMi, t.longRunMaxMi, t.maxRunDaysPerWeek].some((v) => !(Number(v) > 0))) return notify('Running preferences need positive numbers', 'error');
    setBusy(true);
    try {
      const challengeId = `ch-${c.startDate}-${Date.now().toString(36)}`;
      await actions.create('challenges', {
        id: challengeId,
        name: c.name.trim(),
        targetMiles: Number(c.targetMiles),
        startDate: c.startDate,
        endDate: c.endDate,
        activityTypes: [c.run && 'run', c.walk && 'walk'].filter(Boolean),
      });
      // Distance done before using Cadence becomes an "opening balance", dated the day before today.
      const balanceDate = startedAlready ? (addDays(today, -1) < c.startDate ? c.startDate : addDays(today, -1)) : c.startDate;
      for (const [type, mi] of [['run', num(c.doneRun)], ['walk', num(c.doneWalk)]]) {
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
      const P = {
        runFromPlace: personal.runFromPlace.trim() || 'work',
        commuteWalkMi: num(personal.commuteWalkMi),
        extraWalk: { ...personal.extraWalk, mi: num(personal.extraWalk.mi), min: num(personal.extraWalk.min) || Math.round(num(personal.extraWalk.mi) * 20) },
      };
      await actions.update('calendar', 'weekTemplate', { template: defaultWeekTemplate(week, P) });
      await actions.update('profile', profile.id, {
        personal: P,
        training: { ...(profile.training || DEFAULT_TRAINING), ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)])) },
        activeChallengeId: challengeId,
        onboarded: true,
      });
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

  return (
    <div className="onboard">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <Logo />
        <span className="small muted">Step {step + 1} of 3</span>
      </div>
      <h1 style={{ marginBottom: 6 }}>{['Your challenge', 'Your usual week', 'Your running'][step]}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {
          [
            'Set the distance you’re aiming for. You can change any of this later.',
            'Cadence plans sessions around your real week. Pick what each day usually looks like — exact times can be fine-tuned later in the calendar.',
            'These keep suggestions comfortable. The planner never jumps far beyond what you’ve recently done.',
          ][step]
        }
      </p>

      <div className="card stack" style={{ marginTop: 14 }}>
        {step === 0 && (
          <>
            <div className="form-grid">
              <Field label="Challenge name" className="full">
                <input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
              </Field>
              <Field label="Target (miles)">
                <input className="input" inputMode="decimal" value={c.targetMiles} onChange={(e) => setC({ ...c, targetMiles: e.target.value })} />
              </Field>
              <Field label="What counts">
                <div className="row" style={{ minHeight: 42 }}>
                  <label className="row small">
                    <input type="checkbox" checked={c.run} onChange={(e) => setC({ ...c, run: e.target.checked })} /> Running
                  </label>
                  <label className="row small">
                    <input type="checkbox" checked={c.walk} onChange={(e) => setC({ ...c, walk: e.target.checked })} /> Walking
                  </label>
                </div>
              </Field>
              <Field label="Start">
                <input className="input" type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} />
              </Field>
              <Field label="End">
                <input className="input" type="date" value={c.endDate} onChange={(e) => setC({ ...c, endDate: e.target.value })} />
              </Field>
            </div>
            {startedAlready && (
              <div className="form-grid">
                <p className="small full" style={{ margin: 0 }}>
                  Already done some distance since {c.startDate.slice(8)} {MONTHS[parseDate(c.startDate).getMonth()]}? Add it so your totals start in the right place.
                </p>
                {c.run && (
                  <Field label="Running so far (mi)">
                    <input className="input" inputMode="decimal" value={c.doneRun} onChange={(e) => setC({ ...c, doneRun: e.target.value })} placeholder="0" />
                  </Field>
                )}
                {c.walk && (
                  <Field label="Walking so far (mi)">
                    <input className="input" inputMode="decimal" value={c.doneWalk} onChange={(e) => setC({ ...c, doneWalk: e.target.value })} placeholder="0" />
                  </Field>
                )}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <div className="week-picker">
              {WEEK_ORDER.map((wd) => (
                <label key={wd} className="week-pick">
                  <span className="wp-day">{DAY_NAMES[wd]}</span>
                  <select className="input" value={week[wd]} onChange={(e) => setWeek({ ...week, [wd]: e.target.value })}>
                    {TYPE_CHOICES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {uses.has('nans') && (
              <Field label="Where are you on run-straight-after days?" hint="Used in your plan, e.g. “Run from the office” or “Run from Mum’s”.">
                <input className="input" value={personal.runFromPlace} onChange={(e) => setPW({ runFromPlace: e.target.value })} placeholder="work" />
              </Field>
            )}
            {uses.has('office') && (
              <>
                <Field label="Walking you usually do as part of an office-day commute (miles)" hint="Counts towards your challenge when you log it. Leave at 0 if none.">
                  <input className="input" inputMode="decimal" value={personal.commuteWalkMi} onChange={(e) => setPW({ commuteWalkMi: e.target.value })} />
                </Field>
                <label className="row small">
                  <input type="checkbox" checked={personal.extraWalk.enabled} onChange={(e) => setEW({ enabled: e.target.checked })} /> On office days I could add a longer walk (e.g. get off a stop early)
                </label>
                {personal.extraWalk.enabled && (
                  <div className="form-grid">
                    <Field label="Describe it" className="full">
                      <input className="input" value={personal.extraWalk.label} onChange={(e) => setEW({ label: e.target.value })} placeholder="Walk home from two stops early" />
                    </Field>
                    <Field label="Extra miles">
                      <input className="input" inputMode="decimal" value={personal.extraWalk.mi} onChange={(e) => setEW({ mi: e.target.value })} />
                    </Field>
                    <Field label="Takes (minutes)">
                      <input className="input" inputMode="numeric" value={personal.extraWalk.min} onChange={(e) => setEW({ min: e.target.value })} />
                    </Field>
                  </div>
                )}
              </>
            )}
            <p className="tiny faint" style={{ margin: 0 }}>
              {TYPE_CHOICES.filter((o) => uses.has(o.value))
                .map((o) => `${o.label}: ${o.help}`)
                .join(' ')}
            </p>
          </>
        )}

        {step === 2 && (
          <div className="form-grid">
            <Field label="A comfortable easy run (mi)">
              <input className="input" inputMode="decimal" value={t.easyRunMi} onChange={(e) => setT({ ...t, easyRunMi: e.target.value })} />
            </Field>
            <Field label="Most run days in a week">
              <input className="input" inputMode="numeric" value={t.maxRunDaysPerWeek} onChange={(e) => setT({ ...t, maxRunDaysPerWeek: e.target.value })} />
            </Field>
            <Field label="Longer runs from (mi)">
              <input className="input" inputMode="decimal" value={t.longRunMinMi} onChange={(e) => setT({ ...t, longRunMinMi: e.target.value })} />
            </Field>
            <Field label="Longer runs up to (mi)">
              <input className="input" inputMode="decimal" value={t.longRunMaxMi} onChange={(e) => setT({ ...t, longRunMaxMi: e.target.value })} />
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
          {step < 2 ? (
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
