import { useEffect, useRef, useState } from 'react';
import { useStore, api, localNowString } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Icon, Banner, Empty } from '../components/ui.jsx';
import { DailyChart } from '../components/charts.jsx';
import { resizeImage } from '../components/forms.jsx';
import { challengeActivities, countsToward, dailyTotals, sumMiles } from '../shared/calc.js';
import { dateRange, formatDate } from '../shared/dates.js';
import { contextFingerprint } from '../shared/coach.js';
import { resolveDay } from '../shared/schedule.js';
import { RecoveryAndFuelling } from './Nutrition.jsx';
import { ActivityHistory } from './Challenge.jsx';
import { dist, distFixed, fmtDist, unitShort } from '../shared/units.js';
import { isDistanceType, typeLabel, typeNoun } from '../shared/activities.js';

const LOG_ORDER = ['run', 'walk', 'cycle', 'swim', 'box'];

function greeting(now) {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { coaching, challenge, today, now, profile } = useStore();
  const { open } = useSheets();
  if (!challenge || !coaching)
    return (
      <div className="card">
        <Empty icon="challenge" title="No active challenge">
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => open('challenge')}>
            Create a challenge
          </button>
        </Empty>
      </div>
    );

  return (
    <>
      <header className="topbar">
        <div>
          <div className="eyebrow">
            {greeting(now)}
            {profile.name ? `, ${profile.name}` : ''}
          </div>
          <h1>{challenge.name}</h1>
        </div>
        <button className="icon-btn" onClick={() => open('settings')} aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>

      {today < challenge.startDate && (
        <div style={{ marginBottom: 16 }}>
          <Banner>This challenge starts {formatDate(challenge.startDate)}. The plan below is ready for day one.</Banner>
        </div>
      )}

      <div className="stack" style={{ gap: 18 }}>
        <ProgressCard />
        <StatusLine />
        <LogButtons />
        <RecoveryAndFuelling />
        <DailyMileage />
        <CoachNote />
        <FoodLogger />
        <ActivityHistory />
      </div>
    </>
  );
}

/* ---------- Block 1: read-only progress and totals (compact) ---------- */
function ProgressCard() {
  const { coaching, challenge, data } = useStore();
  const { status } = coaching;
  const counted = challenge.activityTypes || ['run', 'walk'];
  const distTypes = LOG_ORDER.filter((t) => counted.includes(t) && isDistanceType(t));

  const boxMinutes = counted.includes('box')
    ? challengeActivities(data.activities, challenge)
        .filter((a) => a.type === 'box')
        .reduce((t, a) => t + Number(a.durationMin || 0), 0)
    : null;

  return (
    <section className="card hero compact" aria-label="Challenge progress">
      <div className="hero-row">
        <div className="hero-total hero-big num">
          {distFixed(status.totalMi)}
          <small>
            / {dist(status.target)} {unitShort()}
          </small>
        </div>
        <div className="hero-bar">
          <div className="row between tiny muted" style={{ marginBottom: 4 }}>
            <span>Completed</span>
            <span className="num">{status.pct.toFixed(0)}%</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={status.target} aria-valuenow={status.totalMi} aria-label="Distance completed">
            {distTypes.map((t) => (
              <span key={t} className={t} style={{ width: `${Math.min(100, ((status.byType?.[t] || 0) / status.target) * 100)}%` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="stat-strip">
        {distTypes.map((t) => (
          <Cell key={t} dot={t} label={typeLabel(t)} value={distFixed(status.byType?.[t] || 0)} unit={unitShort()} />
        ))}
        {boxMinutes != null && <Cell dot="box" label="Boxing" value={boxMinutes} unit="min" />}
        <Cell label="Remaining" value={distFixed(status.remainingMi)} unit={unitShort()} />
      </div>
    </section>
  );
}

/* How far you've come and what's left, plus a nudge near a milestone */
const MILESTONES = [0.25, 0.5, 0.75, 0.9, 1];
const MILESTONE_NAME = { 0.25: 'a quarter of the way', 0.5: 'halfway', 0.75: 'three quarters', 0.9: '90%', 1: 'the finish' };

function statusMotivation(status, inChallenge) {
  const done = status.totalMi;
  const target = status.target;
  if (!(target > 0)) return null;
  const next = MILESTONES.find((m) => done < m * target);
  const toNext = next ? next * target - done : 0;
  // close = within a typical day's distance (min 1 mile) of the next milestone
  const close = next && toNext <= Math.max(1, status.requiredPerDay || 0, target * 0.04);
  const days = status.daysRemaining;
  if (close && next === 1) return `Only ${fmtDist(toNext)} between you and the finish. One more good session could do it.`;
  if (close) return `Just ${fmtDist(toNext)} until you pass ${MILESTONE_NAME[next]}. One good session gets you there.`;
  if (!inChallenge) return null;
  if (days === 1) return 'Last day. Make it count.';
  if (days <= 3) return `Final ${days} days. Everything you add now goes straight to the finish line.`;
  if (days <= 7) return 'Final week. Steady sessions will carry you home.';
  const passed = [...MILESTONES].reverse().find((m) => m < 1 && done >= m * target);
  if (passed && done - passed * target <= Math.max(1, status.requiredPerDay || 0)) return `You’ve just passed ${MILESTONE_NAME[passed]}. Keep the rhythm going.`;
  return null;
}

function StatusLine() {
  const { coaching, challenge, today } = useStore();
  const { status } = coaching;
  const pct = Math.floor(status.pct);
  const left = status.remainingMi;
  const days = status.daysRemaining;
  const inChallenge = today >= challenge.startDate && today <= challenge.endDate;
  let text;
  if (left <= 0) text = `You’ve reached your ${dist(status.target)} ${unitShort()} target: ${fmtDist(status.totalMi)} done`;
  else if (today < challenge.startDate) text = `${fmtDist(status.target)} to go, starting ${formatDate(challenge.startDate, { year: false })}`;
  else if (today > challenge.endDate) text = `You finished at ${pct}% of your target: ${fmtDist(status.totalMi)} of ${fmtDist(status.target)}`;
  else text = `You’re ${pct}% of the way there, with ${fmtDist(left)} to go in ${days} ${days === 1 ? 'day' : 'days'}`;
  const nudge = left <= 0 ? 'Anything more is a bonus.' : statusMotivation(status, inChallenge);
  return (
    <div className="status-line">
      <h2>{text}</h2>
      {nudge && <p>{nudge}</p>}
    </div>
  );
}

function Cell({ label, value, unit, dot, title }) {
  return (
    <div className="cell" title={title}>
      <div className="cell-l">
        {dot && <i className={`dot ${dot}`} />}
        {label}
      </div>
      <div className="cell-v num">
        {value}
        {unit ? <small> {unit}</small> : null}
      </div>
    </div>
  );
}

/* ---------- "What did you eat today?" ---------- */
function FoodLogger() {
  const { today, data, actions, notify, now, challenge, integrations, profile } = useStore();
  const { open } = useSheets();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const foods = data.foods.filter((f) => f.date === today).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const aiOn = integrations?.ai?.enabled;
  const showNumbers = profile.nutrition?.showNumbers !== false;

  const submit = async (ev) => {
    ev?.preventDefault();
    if (busy || (!text.trim() && !photo)) return;
    setBusy(true);
    try {
      const r = await api('/food/log', { method: 'POST', body: { text, photo, localNow: localNowString(now), challengeId: challenge?.id } });
      setResult(r);
      setText('');
      setPhoto(null);
      await actions.reload();
      if (r.aiError) notify(`AI wasn’t available (${r.aiError}) — used the built-in food list`, 'error');
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const est = result?.estimate;
  const totals = est?.totals;
  const lastId = foods[foods.length - 1]?.id;

  return (
    <section className="card today-food" id="food-logger" aria-label="What did you eat today?">
      <div className="card-head">
        <h3>What did you eat today?</h3>
      </div>
      <form onSubmit={submit} className="food-form">
        <textarea
          id="food-input"
          className="input"
          rows={2}
          value={text}
          placeholder="e.g. Porridge with banana and peanut butter"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit(e)}
          aria-label="What did you eat today?"
        />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn small primary" disabled={busy || (!text.trim() && !photo)}>
            {busy ? 'Estimating…' : 'Save'}
          </button>
          <label className="btn small ghost" style={{ cursor: 'pointer' }} title={aiOn ? 'Add a photo — the AI can use it' : 'Add a photo (stored with the entry)'}>
            <Icon name="camera" /> {photo ? 'Photo added' : 'Photo'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => e.target.files[0] && setPhoto(await resizeImage(e.target.files[0]))} />
          </label>
          {photo && (
            <button type="button" className="link-btn tiny" onClick={() => setPhoto(null)}>
              Remove
            </button>
          )}
        </div>
      </form>

      {result && (
        <div className="meal-result" role="status">
          <div className="mr-head">
            <span>
              Saved · <span className="cap">{result.entry.meal}</span>
            </span>
            <span>
              <button className="link-btn tiny" onClick={() => open('food', { initial: result.entry })}>
                Edit
              </button>
              <button className="icon-btn" aria-label="Dismiss" onClick={() => setResult(null)}>
                <Icon name="x" width="14" height="14" />
              </button>
            </span>
          </div>
          {showNumbers && totals && est.confidence !== 'none' ? (
            <>
              <div className="mr-est num">
                <strong>≈{Math.round(totals.kcal)} kcal</strong> · {Math.round(totals.carbs)} g carbs · {Math.round(totals.protein)} g protein · {Math.round(totals.fat)} g fat
              </div>
              <div className="tiny faint">
                Estimate ({est.source === 'ai' ? 'AI' : 'typical portions'}, {est.confidence} confidence)
                {est.items?.length > 0 && ` — recognised: ${est.items.map((i) => i.name).join(', ')}`}
                {est.assumptions?.length > 0 && `. Assumed: ${est.assumptions.join('; ')}`}. Tap Edit to correct it.
              </div>
            </>
          ) : (
            <div className="tiny faint">No nutrition estimate for this one — tap Edit to add numbers yourself.</div>
          )}
          {result.coach?.text && (
            <div className="mr-coach">
              <Icon name={result.coach.source === 'ai' ? 'spark' : 'list'} width="14" height="14" />
              <div>
                <span className="tiny faint">{result.coach.source === 'ai' ? 'AI coach' : 'Coach'}</span>
                <div>{result.coach.text}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {foods.length > 0 && (
        <ul className="food-items">
          {foods.map((f) => (
            <li key={f.id}>
              <button className="food-block" onClick={() => open('food', { initial: f })} aria-label={`Edit ${f.text}`}>
                <span className="fi-meta">
                  <span className="cap">{f.meal}</span> · {f.time}
                  {showNumbers && f.estimate?.totals && f.estimate.confidence !== 'none' && <> · ≈{Math.round(f.estimate.totals.kcal)} kcal</>}
                </span>
                <span className="fi-text">{f.text}</span>
                {!result && f.id === lastId && f.coach?.text && <span className="fi-coach">{f.coach.text}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The AI coach's daily note — only shown when the AI coach is configured on the server. */
function CoachNote() {
  const { integrations, coaching, challenge, now, actions, data, today } = useStore();
  const recDoc = data.recommendations.find((r) => r.id === `${today}-${challenge.id}`);
  const [state, setState] = useState({ loading: false, error: '' });
  const asked = useRef(false);
  const enabled = integrations?.ai?.enabled;
  const note = recDoc?.aiNote;
  const changed = note && note.fingerprint !== contextFingerprint(coaching);

  const fetchNote = async (refresh = false) => {
    setState({ loading: true, error: '' });
    try {
      await api('/coach/note', { method: 'POST', body: { localNow: localNowString(now), challengeId: challenge.id, refresh } });
      await actions.reload();
      setState({ loading: false, error: '' });
    } catch (e) {
      setState({ loading: false, error: e.message });
    }
  };

  // First visit of the day: write today's note automatically (once).
  useEffect(() => {
    if (enabled && !note && !asked.current) {
      asked.current = true;
      fetchNote(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, note]);

  if (!enabled) return null;
  return (
    <section className="card coach-note" aria-live="polite" aria-label="Coach’s note">
      <div className="mini-head">
        <Icon name="spark" width="13" height="13" /> Coach’s note
      </div>
      {note ? (
        <>
          <p className="cn-text">{note.note}</p>
          {note.focus && (
            <p className="cn-focus">
              <strong>Focus:</strong> {note.focus}
            </p>
          )}
        </>
      ) : state.loading ? (
        <p className="cn-text faint">Writing today’s note…</p>
      ) : null}
      <div className="cn-meta">
        {note && <span>AI · {new Date(note.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        {changed && !state.loading && <span>· your day has changed since</span>}
        {state.error && <span className="cn-err">{state.error}</span>}
        <button className="link-btn" onClick={() => fetchNote(true)} disabled={state.loading}>
          {state.loading ? 'Writing…' : note ? 'Refresh' : 'Try again'}
        </button>
      </div>
    </section>
  );
}

function LogButtons() {
  const { open } = useSheets();
  const { challenge } = useStore();
  const counted = challenge?.activityTypes || ['run', 'walk'];
  const types = LOG_ORDER.filter((t) => counted.includes(t));
  return (
    <div className="quick" role="group" aria-label="Log">
      {types.map((t) => (
        <button key={t} className={t} onClick={() => open('activity', { defaultType: t })}>
          <Icon name={t} />
          Log {typeNoun(t).toLowerCase()}
        </button>
      ))}
      <button className="energy" onClick={() => open('energy')}>
        <Icon name="energy" />
        Log energy
      </button>
    </div>
  );
}

/* ---------- Daily mileage across the challenge ---------- */
// Planned distance by activity; anything without a walk/run type is treated as a run.
function plannedByType(day) {
  const out = {};
  for (const s of day?.sessions || []) {
    if (s.optional) continue;
    const t = s.type === 'walk' ? 'walk' : 'run';
    out[t] = (out[t] || 0) + Number(s.distanceMi || 0);
  }
  return out;
}

function DailyMileage() {
  const { coaching, challenge, data, today, cal } = useStore();
  const { open } = useSheets();
  const { status, plan } = coaching;
  const counted = challenge.activityTypes || ['run', 'walk'];
  const distTypes = LOG_ORDER.filter((t) => counted.includes(t) && isDistanceType(t));
  const totals = dailyTotals(data.activities.filter((a) => !a.isBaseline && countsToward(a, challenge)), challenge.startDate, challenge.endDate);
  const baseline = sumMiles(data.activities.filter((a) => a.isBaseline && countsToward(a, challenge)));
  const days = dateRange(challenge.startDate, challenge.endDate).map((d) => ({
    date: d,
    parts: Object.fromEntries(distTypes.map((t) => [t, totals[d]?.[t] || 0])),
    planned: d >= today ? plan.plannedByDate[d] || 0 : 0,
    plannedParts: d >= today ? plannedByType(plan.days.find((x) => x.date === d)) : {},
    isToday: d === today,
    isPast: d < today,
    off: resolveDay(d, cal).status,
    period: resolveDay(d, cal).period.active,
    label: resolveDay(d, cal).short,
    fullLabel: resolveDay(d, cal).label,
  }));
  return (
    <section className="card">
      <div className="card-head wrap-head">
        <h3>Daily distance</h3>
        <div className="row wrap" style={{ gap: 12 }}>
        <div className="legend">
          {distTypes.map((t) => (
            <span key={t}>
              <i className={`dot ${t}`} />
              {typeNoun(t)}
            </span>
          ))}
          <span>
            <i className="dot plan" />
            Planned
          </span>
        </div>
        <button className="btn small" onClick={() => open('pattern')}>
          Weekly pattern
        </button>
        </div>
      </div>
      <DailyChart onPick={(d) => open('day', { date: d })} finish={{ projected: status.totalMi + (plan.plannedMi || 0), target: status.target }} days={days} types={distTypes} guide={status.requiredPerDay} guideLabel={`${dist(status.requiredPerDay)} ${unitShort()}/day needed`} />
      {baseline > 0 && (
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>
          Not shown by day: {fmtDist(baseline)} opening balance from before you started using Cadence.
        </p>
      )}
      <p className="tiny faint" style={{ margin: '6px 0 0' }}>
        Tap a day to change its availability, commitments or plan, or to log what you did.
      </p>
    </section>
  );
}
