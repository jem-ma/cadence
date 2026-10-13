import { useEffect, useRef, useState } from 'react';
import { useStore, api, localNowString } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Icon, Banner, Empty } from '../components/ui.jsx';
import { DailyChart } from '../components/charts.jsx';
import { challengeActivities, challengeStatus, countsToward, dailyTotals, round1, sumMiles, weeklyTotals } from '../shared/calc.js';
import { addDays, dateRange, diffDays, formatDate, formatDuration, relativeDay, startOfWeek } from '../shared/dates.js';
import { contextFingerprint, motivationLine } from '../shared/coach.js';
import { personalOf } from '../shared/schedule.js';
import { challengeReview } from '../shared/reviews.js';
import { LoggedFood, RecoveryAndFuelling } from './Nutrition.jsx';
import { dayNutritionTotals } from '../shared/nutrition.js';
import { CalendarSection } from './Calendar.jsx';
import { ActivityHistory } from './Challenge.jsx';

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
        <LogButtons />
        <TodayCard />
        <RecoveryAndFuelling />
        <ComingUp />
        <DailyMileage />
        <div className="grid cal-history">
          <CalendarSection />
          <ActivityHistory />
        </div>
        <WhatWorked />
      </div>
    </>
  );
}

/* ---------- Block 1: read-only progress and totals ---------- */
function ProgressCard() {
  const { coaching, challenge, data, cal, today } = useStore();
  const { status } = coaching;
  const runPct = (status.runMi / status.target) * 100;
  const walkPct = (status.walkMi / status.target) * 100;
  const review = challengeReview({ challenge, activities: data.activities, energyLogs: data.energyLogs, foods: data.foods, cal, recommendations: data.recommendations, today });

  // This week (Mon–Sun, clipped to the challenge). "Needed" is fixed at the start of the week;
  // "needed per week from now" moves as you log distance.
  const ws = startOfWeek(today) < challenge.startDate ? challenge.startDate : startOfWeek(today);
  const we = addDays(startOfWeek(today), 6) > challenge.endDate ? challenge.endDate : addDays(startOfWeek(today), 6);
  const inWeek = challengeActivities(data.activities, challenge).filter((a) => a.date >= ws && a.date <= we);
  const weekDone = sumMiles(inWeek);
  const atWeekStart = challengeStatus(challenge, data.activities.filter((a) => a.date < ws), ws);
  const weekNeeded = round1(atWeekStart.requiredPerDay * (diffDays(ws, we) + 1));
  const weekLeft = round1(Math.max(0, weekNeeded - weekDone));
  const perWeekNow = round1(status.requiredPerDay * 7);
  const inChallenge = today >= challenge.startDate && today <= challenge.endDate;

  return (
    <section className="card hero compact" aria-label="Challenge progress">
      <div className="hero-row">
        <div className="hero-total">
          <div className="hero-big num">
            {status.totalMi.toFixed(1)}
            <small>/ {status.target} mi</small>
          </div>
        </div>
        <div className="hero-bar">
          <div className="row between tiny muted" style={{ marginBottom: 6 }}>
            <span>Completed</span>
            <span className="num">{status.pct.toFixed(0)}%</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={status.target} aria-valuenow={status.totalMi} aria-label="Distance completed">
            <span className="run" style={{ width: `${Math.min(100, runPct)}%` }} />
            <span className="walk" style={{ width: `${Math.min(100 - Math.min(100, runPct), walkPct)}%` }} />
          </div>
        </div>
      </div>
      <div className="kpi-row top-kpis">
        <Kpi label="Running" value={status.runMi.toFixed(1)} unit="mi" dot="run" />
        <Kpi label="Walking" value={status.walkMi.toFixed(1)} unit="mi" dot="walk" />
        <Kpi label="Remaining" value={status.remainingMi.toFixed(1)} unit="mi" />
        <Kpi label="Days left" value={status.daysRemaining} unit={`of ${status.totalDays}`} />
      </div>
      <div className="stats stats-4 stats-compact">
        {inChallenge && <Stat label="This week" value={weekDone.toFixed(1)} unit={`of ${weekNeeded.toFixed(1)} needed`} />}
        {inChallenge && <Stat label="Left this week" value={weekLeft.toFixed(1)} unit="mi" />}
        <Stat label="Needed per week" value={perWeekNow.toFixed(1)} unit="mi" />
        <Stat label="Needed per day" value={status.requiredPerDay.toFixed(1)} unit="mi avg" />
        <Stat label="vs. even pace" value={`${status.vsTrajectory > 0 ? '+' : ''}${status.vsTrajectory.toFixed(1)}`} unit="mi" />
        <Stat label="Runs logged" value={review.runCount} unit={review.longest ? `longest ${review.longest.toFixed(1)} mi` : ''} />
        <Stat label="Active days" value={review.activeDays} unit="days" />
      </div>
    </section>
  );
}

function Kpi({ label, value, unit, dot }) {
  return (
    <div className="kpi">
      <div className="l">
        {dot && <i className={`dot ${dot}`} />}
        {label}
      </div>
      <div className="v num">
        {value} <small className="tiny faint">{unit}</small>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, dot }) {
  return (
    <div className="stat">
      <div className="label">
        {dot && <i className={`dot ${dot}`} />}
        {label}
      </div>
      <div className="value">
        {value} <small>{unit}</small>
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
        <p className="motivation">{motivationLine(coaching)}</p>
      </header>

      <div className="today-tiles">
        <div className="t-tile">
          <div className="mini-head">Distance</div>
          <div className="t-value num">
            {doneMi.toFixed(1)}
            <small> / {plannedMi.toFixed(1)} mi</small>
          </div>
          <div className="progress thin">
            <span className="run" style={{ width: `${pct}%` }} />
          </div>
          <div className="t-sub">completed / planned</div>
        </div>

        <button className="t-tile t-btn" onClick={() => open('energy', { initial: e || undefined })} aria-label={e ? 'Edit energy' : 'Log energy'}>
          <div className="mini-head">Energy</div>
          {e ? (
            <>
              <div className="t-value num">
                {e.energy}
                <small>/10</small>
              </div>
              <div className="energy-dots" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < e.energy ? 'on' : ''} />
                ))}
              </div>
              <div className="t-sub">
                at {e.time}
                {[e.sleepHours ? `${e.sleepHours} h sleep` : null, e.soreness ? `soreness ${e.soreness}` : null, e.cycle].filter(Boolean).map((x) => ` · ${x}`)}
              </div>
            </>
          ) : (
            <>
              <div className="t-value faint">–</div>
              <div className="t-sub">Not logged yet</div>
            </>
          )}
        </button>

        <div className="t-tile">
          <div className="mini-head">Intake <span className="est">(estimated)</span></div>
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

      <div className="today-main">
        <div className="today-plan">
          <div className="mini-head">Your plan</div>
          <div className="action-title">{rec.action.title}</div>
          <p style={{ margin: 0 }}>{rec.action.summary}</p>
          {rec.activity && (
            <div className="metaline">
              <span className={`chip ${rec.activity.type}`}>
                <Icon name={rec.activity.type} width="14" height="14" /> {rec.activity.distanceMi} mi
              </span>
              {rec.activity.durationMin ? <span>≈ {formatDuration(rec.activity.durationMin)}</span> : null}
              {rec.suggestedTime && <span>{rec.suggestedTime}</span>}
            </div>
          )}
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
        </div>

        <div className="today-food">
          <div className="mini-head">Food logged</div>
          <LoggedFood />
        </div>
      </div>
    </section>
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
  return (
    <div className="quick" role="group" aria-label="Log">
      <button className="run" onClick={() => open('activity', { defaultType: 'run' })}>
        <Icon name="run" />
        Log run
      </button>
      <button className="walk" onClick={() => open('activity', { defaultType: 'walk' })}>
        <Icon name="walk" />
        Log walk
      </button>
      <button onClick={() => open('food')}>
        <Icon name="food" />
        Log food
      </button>
      <button onClick={() => open('energy')}>
        <Icon name="energy" />
        Log energy
      </button>
    </div>
  );
}

/* ---------- Daily mileage across the challenge ---------- */
function DailyMileage() {
  const { coaching, challenge, data, today } = useStore();
  const { status, plan } = coaching;
  const totals = dailyTotals(data.activities.filter((a) => !a.isBaseline && countsToward(a, challenge)), challenge.startDate, challenge.endDate);
  const baseline = sumMiles(data.activities.filter((a) => a.isBaseline && countsToward(a, challenge)));
  const days = dateRange(challenge.startDate, challenge.endDate).map((d) => ({
    date: d,
    run: totals[d]?.run || 0,
    walk: totals[d]?.walk || 0,
    planned: d >= today ? plan.plannedByDate[d] || 0 : 0,
    isToday: d === today,
    isPast: d < today,
  }));
  return (
    <section className="card">
      <div className="card-head wrap-head">
        <h3>Daily mileage</h3>
        <div className="legend">
          <span>
            <i className="dot run" />
            Run
          </span>
          <span>
            <i className="dot walk" />
            Walk
          </span>
          <span>
            <i className="dot plan" />
            Planned
          </span>
        </div>
      </div>
      <DailyChart days={days} guide={status.requiredPerDay} guideLabel={`${status.requiredPerDay.toFixed(1)} mi/day needed`} />
      {baseline > 0 && (
        <p className="tiny faint" style={{ margin: '6px 0 0' }}>
          Not shown by day: {baseline.toFixed(1)} mi opening balance from before you started using Cadence.
        </p>
      )}
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
    r.bestDayType && { l: 'Most productive days', v: r.bestDayType.label, s: `${r.bestDayType.mi} mi` },
    r.bestWeekday && { l: 'Strongest weekday', v: r.bestWeekday.name, s: `${r.bestWeekday.mi} mi` },
    extra.enabled && { l: extra.label, v: r.extendedWalks, s: r.extendedWalks ? `≈${Math.round(r.extendedWalks * extra.mi * 10) / 10} mi added` : 'none yet' },
    { l: 'Average energy', v: r.energyAvg != null ? `${r.energyAvg}/10` : '–', s: `${r.energyDays} ${r.energyDays === 1 ? 'day' : 'days'} logged` },
    { l: 'Food logged', v: r.foodEntries, s: r.foodEntries === 1 ? 'entry' : 'entries' },
    bestWeek && bestWeek.total > 0 && { l: 'Best week', v: `${bestWeek.total.toFixed(1)} mi`, s: `w/c ${formatDate(bestWeek.weekStart, { short: true, weekday: false })}` },
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

/* ---------- Block 3: coming up ---------- */
function ComingUp() {
  const { coaching, today } = useStore();
  const { open } = useSheets();
  const track = useRef(null);
  const days = coaching.plan.days.filter((d) => d.date > today).slice(0, 7);
  const scroll = (dir) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' });
  if (!days.length) return null;
  return (
    <section aria-label="Coming up">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3>Coming up</h3>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={() => scroll(-1)} aria-label="Scroll back">
            <Icon name="chevronL" />
          </button>
          <button className="icon-btn" onClick={() => scroll(1)} aria-label="Scroll forward">
            <Icon name="chevronR" />
          </button>
        </div>
      </div>
      <div className="carousel" ref={track}>
        {days.map((d) => {
          const total = Math.round(d.sessions.reduce((s, x) => s + x.distanceMi, 0) * 10) / 10;
          const statusLabel = { normal: d.day.label, unavailable: 'No exercise', rest: 'Rest day', busy: 'Busy' }[d.day.status];
          return (
            <article
              key={d.date}
              className={`card day-card clickable ${d.day.status === 'unavailable' ? 'off' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`Plan ${formatDate(d.date)}`}
              onClick={() => open('planDay', { date: d.date })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open('planDay', { date: d.date }))}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{relativeDay(d.date, today)}</div>
                <div className="tiny faint">
                  {formatDate(d.date, { weekday: false, short: true })} · {statusLabel}
                  {d.day.planLocked ? ' · your plan' : ''}
                </div>
              </div>
              <div className="day-card-total num">{total ? `${total} mi` : '—'}</div>
              <div className="stack" style={{ gap: 8 }}>
                {d.sessions.length === 0 && <span className="small faint">{d.day.status === 'normal' ? 'Rest' : d.notes[0]}</span>}
                {d.sessions.map((s, i) => (
                  <div key={i} className="small" style={{ opacity: s.optional ? 0.65 : 1 }}>
                    <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
                      <i className={`dot ${s.type}`} />
                      <span className="grow">
                        {s.label} · {s.distanceMi} mi
                        {s.time && <span className="faint"> · {s.time}</span>}
                      </span>
                    </div>
                    {s.fixed && (
                      <span className="tiny" style={{ color: 'var(--run)', marginLeft: 15 }}>
                        Confirmed
                      </span>
                    )}
                  </div>
                ))}
                {d.day.events.map((e) => (
                  <div key={e.id} className="tiny" style={{ color: 'var(--warn)' }}>
                    {e.start ? `${e.start} ` : ''}
                    {e.title}
                  </div>
                ))}
                {d.day.period.active && (
                  <span className="chip period" style={{ alignSelf: 'flex-start' }}>
                    {d.day.period.actual ? 'Period' : 'Period expected'}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
