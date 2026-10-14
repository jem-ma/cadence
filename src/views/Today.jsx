import { useEffect, useRef, useState } from 'react';
import { useStore, api, localNowString } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Icon, Banner, Empty } from '../components/ui.jsx';
import { DailyChart } from '../components/charts.jsx';
import { resizeImage } from '../components/forms.jsx';
import { challengeActivities, challengeStatus, countsToward, dailyTotals, round1, sumMiles, weeklyTotals } from '../shared/calc.js';
import { addDays, dateRange, diffDays, formatDate, formatDuration, startOfWeek } from '../shared/dates.js';
import { contextFingerprint, motivationLine } from '../shared/coach.js';
import { personalOf, resolveDay } from '../shared/schedule.js';
import { challengeReview } from '../shared/reviews.js';
import { RecoveryAndFuelling } from './Nutrition.jsx';
import { dayNutritionTotals } from '../shared/nutrition.js';
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
        <TodayCard />
        <RecoveryAndFuelling />
        <DailyMileage />
        <ActivityHistory />
        <WhatWorked />
      </div>
    </>
  );
}

/* ---------- Block 1: read-only progress and totals (compact) ---------- */
function ProgressCard() {
  const { coaching, challenge, data, cal, today } = useStore();
  const { status } = coaching;
  const review = challengeReview({ challenge, activities: data.activities, energyLogs: data.energyLogs, foods: data.foods, cal, recommendations: data.recommendations, today });
  const counted = challenge.activityTypes || ['run', 'walk'];
  const distTypes = LOG_ORDER.filter((t) => counted.includes(t) && isDistanceType(t));

  // This week (Mon–Sun, clipped to the challenge). "Needed" is fixed at the start of the week;
  // "needed per week from now" moves as you log distance.
  const ws = startOfWeek(today) < challenge.startDate ? challenge.startDate : startOfWeek(today);
  const we = addDays(startOfWeek(today), 6) > challenge.endDate ? challenge.endDate : addDays(startOfWeek(today), 6);
  const inWeek = challengeActivities(data.activities, challenge).filter((a) => a.date >= ws && a.date <= we);
  const weekDone = sumMiles(inWeek);
  const atWeekStart = challengeStatus(challenge, data.activities.filter((a) => a.date < ws), ws);
  const weekNeeded = atWeekStart.requiredPerDay * (diffDays(ws, we) + 1);
  const inChallenge = today >= challenge.startDate && today <= challenge.endDate;
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
        <Cell label="Days left" value={status.daysRemaining} unit={`of ${status.totalDays}`} />
        {inChallenge && <Cell label="This week" value={`${dist(weekDone)}/${dist(weekNeeded)}`} unit={unitShort()} />}
        <Cell label="Active days" value={review.activeDays} unit="" />
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

/* ---------- Block 2: today ---------- */
function TodayCard() {
  const { coaching, actions, today, challenge, data, profile } = useStore();
  const { open } = useSheets();
  const recId = `${today}-${challenge.id}`;
  const recDoc = data.recommendations.find((r) => r.id === recId);
  const rec = coaching.rec;
  const inChallenge = today >= challenge.startDate && today <= challenge.endDate;

  // Planned distance for today: remember what the plan was before anything was logged,
  // so "planned vs completed" stays meaningful once you start logging.
  const doneMi = coaching.status.todayMi;
  const plannedNow = round1(doneMi + (coaching.todayPlan?.sessions || []).filter((s) => !s.optional).reduce((t, s) => t + s.distanceMi, 0));
  const loggedToday = coaching.doneToday.length > 0;
  const saving = useRef(false);
  useEffect(() => {
    if (!inChallenge || saving.current) return;
    const stored = recDoc?.plannedMi;
    if (stored != null && (loggedToday || stored === plannedNow)) return;
    saving.current = true;
    const doc = { id: recId, date: today, challengeId: challenge.id, status: recDoc?.status || 'open', plannedMi: plannedNow };
    (recDoc ? actions.update('recommendations', recId, doc) : actions.create('recommendations', doc)).finally(() => (saving.current = false));
  }, [inChallenge, recDoc, loggedToday, plannedNow, recId, today, challenge.id, actions]);
  const plannedMi = recDoc?.plannedMi ?? plannedNow;

  const e = coaching.energyLog;
  const pct = plannedMi > 0 ? Math.min(100, (doneMi / plannedMi) * 100) : doneMi > 0 ? 100 : 0;
  const foods = data.foods.filter((f) => f.date === today);
  const nut = dayNutritionTotals(foods);
  const showNumbers = profile.nutrition?.showNumbers !== false;
  const macroKcal = nut.carbs * 4 + nut.protein * 4 + nut.fat * 9 || 1;

  return (
    <section className="card coach today-card" aria-label="Today">
      <header className="today-top">
        <div className="section-title" style={{ margin: 0 }}>
          Today
        </div>
        <h2>{formatDate(today, { year: false })}</h2>
        <p className="plan-summary">{rec.action.summary}</p>
        {rec.activity && (
          <div className="metaline">
            <span className={`chip ${rec.activity.type}`}>
              <Icon name={rec.activity.type} width="14" height="14" /> {fmtDist(rec.activity.distanceMi)}
            </span>
            {rec.activity.durationMin ? <span>≈ {formatDuration(rec.activity.durationMin)}</span> : null}
            {rec.suggestedTime && <span>{rec.suggestedTime}</span>}
          </div>
        )}
        <p className="motivation">{motivationLine(coaching)}</p>
      </header>

      <div className="today-tiles">
        <div className="t-tile">
          <div className="mini-head">Distance</div>
          <div className="t-value num">
            {distFixed(doneMi)}
            <small>
              {' '}
              / {distFixed(plannedMi)} {unitShort()}
            </small>
          </div>
          <div className="progress thin">
            <span className="run" style={{ width: `${pct}%` }} />
          </div>
          <div className="t-sub">completed / planned</div>
        </div>

        <button className="t-tile t-btn t-small" onClick={() => open('energy', { initial: e || undefined })} aria-label={e ? 'Edit energy' : 'Log energy'}>
          <div className="mini-head">Energy</div>
          {e ? (
            <>
              <div className="t-value num">
                {e.energy}
                <small>/10</small>
              </div>
              <div className="t-sub">at {e.time}</div>
            </>
          ) : (
            <>
              <div className="t-value faint">–</div>
              <div className="t-sub">Not logged</div>
            </>
          )}
        </button>

        <div className="t-tile">
          <div className="mini-head">
            Intake <span className="est">(estimated)</span>
          </div>
          {showNumbers && nut.estimatedEntries > 0 ? (
            <>
              <div className="t-value num">
                ≈{Math.round(nut.kcal)}
                <small> kcal</small>
              </div>
              <div className="macro-split" aria-hidden="true">
                <span style={{ width: `${((nut.carbs * 4) / macroKcal) * 100}%`, background: 'var(--walk)' }} />
                <span style={{ width: `${((nut.protein * 4) / macroKcal) * 100}%`, background: 'var(--run)' }} />
                <span style={{ width: `${((nut.fat * 9) / macroKcal) * 100}%`, background: 'var(--info)' }} />
              </div>
              <div className="t-sub num">
                {Math.round(nut.carbs)} g carbs · {Math.round(nut.protein)} g protein · {Math.round(nut.fat)} g fat
              </div>
            </>
          ) : (
            <>
              <div className="t-value faint">{foods.length || '–'}</div>
              <div className="t-sub">{foods.length ? `${foods.length} ${foods.length === 1 ? 'entry' : 'entries'}, not estimated` : 'No food logged yet'}</div>
            </>
          )}
        </div>
      </div>

      <CoachNote recDoc={recDoc} />

      {rec.preparation?.length > 0 && (
        <div className="prep">
          <div className="mini-head">
            <Icon name="bag" width="13" height="13" /> Prepare
          </div>
          <ul className="small">
            {rec.preparation.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <FoodLogger />
    </section>
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
    <div className="today-food" id="food-logger">
      <div className="mini-head">What did you eat today?</div>
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
    </div>
  );
}

/** The AI coach's daily note — only shown when the AI coach is configured on the server. */
function CoachNote({ recDoc }) {
  const { integrations, coaching, challenge, now, actions } = useStore();
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
    <div className="coach-note" aria-live="polite">
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
    </div>
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
      <button onClick={() => open('energy')}>
        <Icon name="energy" />
        Log energy
      </button>
    </div>
  );
}

/* ---------- Daily mileage across the challenge ---------- */
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
      <DailyChart onPick={(d) => open('day', { date: d })} days={days} types={distTypes} guide={status.requiredPerDay} guideLabel={`${dist(status.requiredPerDay)} ${unitShort()}/day needed`} />
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

/* ---------- What's working ---------- */
function WhatWorked() {
  const { challenge, data, cal, today } = useStore();
  const r = challengeReview({ challenge, activities: data.activities, energyLogs: data.energyLogs, foods: data.foods, cal, recommendations: data.recommendations, today });
  // opening-balance miles aren't a real week of training
  const extra = personalOf(cal).extraWalk;
  const bestWeek = weeklyTotals(challenge, data.activities.filter((a) => !a.isBaseline)).sort((a, b) => b.total - a.total)[0];
  const blocks = [
    r.bestDayType && { l: 'Most productive days', v: r.bestDayType.label, s: fmtDist(r.bestDayType.mi) },
    r.bestWeekday && { l: 'Strongest weekday', v: r.bestWeekday.name, s: fmtDist(r.bestWeekday.mi) },
    extra.enabled && { l: extra.label, v: r.extendedWalks, s: r.extendedWalks ? `≈${fmtDist(r.extendedWalks * extra.mi)} added` : 'none yet' },
    { l: 'Average energy', v: r.energyAvg != null ? `${r.energyAvg}/10` : '–', s: `${r.energyDays} ${r.energyDays === 1 ? 'day' : 'days'} logged` },
    { l: 'Food logged', v: r.foodEntries, s: r.foodEntries === 1 ? 'entry' : 'entries' },
    bestWeek && bestWeek.total > 0 && { l: 'Best week', v: fmtDist(bestWeek.total), s: `w/c ${formatDate(bestWeek.weekStart, { short: true, weekday: false })}` },
  ].filter(Boolean);
  return (
    <section aria-label="What's working">
      <h3 style={{ marginBottom: 10 }}>{today > challenge.endDate ? 'What worked' : "What's working"}</h3>
      <div className="kpi-row worked">
        {blocks.map((b) => (
          <div className="kpi" key={b.l}>
            <div className="l">{b.l}</div>
            <div className="v">{b.v}</div>
            <div className="tiny faint">{b.s}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
