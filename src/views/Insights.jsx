import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { WeeklyBars } from '../components/charts.jsx';
import { formatDate, startOfWeek } from '../shared/dates.js';
import { challengeReview } from '../shared/reviews.js';
import { challengeStatus } from '../shared/calc.js';
import { dist, distFixed, fmtDist, unitShort, unitWord } from '../shared/units.js';

function K({ v, l }) {
  return (
    <div className="kpi">
      <div className="v num">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export function ChallengeReviewCard({ challenge, title, showTotals = false, hideKpis = false, children }) {
  const { data, cal, today } = useStore();
  const r = challengeReview({ challenge, activities: data.activities, energyLogs: data.energyLogs, foods: data.foods, cal, recommendations: data.recommendations, today });
  return (
    <section className="card">
      <div className="card-head">
        <h3>
          {title} · {challenge.name}
        </h3>
        <span className={`chip ${r.achieved ? 'ok' : today > challenge.endDate ? 'warn' : ''}`}>{r.achieved ? 'Target achieved' : today > challenge.endDate ? 'Target not reached' : 'In progress'}</span>
      </div>
      {!hideKpis && <div className="kpi-row">
        {showTotals && <K v={`${distFixed(r.total)} / ${dist(r.target)}`} l={unitWord()} />}
        {showTotals && <K v={`${distFixed(r.run)} / ${distFixed(r.walk)}`} l="run / walk" />}
        <K v={dist(r.longest)} l={`longest run (${unitShort()})`} />
        <K v={r.runCount} l="runs logged" />
        <K v={r.activeDays} l="active days" />
        {!showTotals && <K v={r.recCompletion != null ? `${r.recCompletion}%` : '–'} l="plans followed" />}
      </div>}
      <div className="stack" style={{ marginTop: hideKpis ? 0 : 14 }}>
        <div className="small stack" style={{ gap: 6 }}>
          <strong>What worked</strong>
          {r.worked.length ? r.worked.map((w) => <span key={w}>{w}</span>) : <span className="muted">Not enough logged activity yet.</span>}
          {showTotals && r.recCompletion != null && <span>You followed {r.recCompletion}% of recommendations as planned.</span>}
          {r.energyAvg != null && (
            <span>
              Average energy {r.energyAvg}/10 across {r.energyDays} logged {r.energyDays === 1 ? 'day' : 'days'}; {r.foodEntries} food {r.foodEntries === 1 ? 'entry' : 'entries'}.
            </span>
          )}
          <strong style={{ marginTop: 6 }}>For next time</strong>
          {r.next.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div>
          <div className="section-title" style={{ marginTop: 6 }}>
            Weekly distance
          </div>
          <WeeklyBars weeks={r.weeks} weeklyTarget={(r.target / ((new Date(challenge.endDate) - new Date(challenge.startDate)) / 86400000 + 1)) * 7} current={startOfWeek(today)} />
        </div>
      </div>
      {children}
    </section>
  );
}

export function OtherChallenges() {
  const { data, profile, today, actions, notify } = useStore();
  const [selected, setSelected] = useState(null);
  const past = useMemo(() => data.challenges.filter((c) => c.id !== profile.activeChallengeId).sort((a, b) => b.startDate.localeCompare(a.startDate)), [data.challenges, profile.activeChallengeId]);
  if (!past.length) return null;
  return (
    <section className="card">
      <h3 style={{ marginBottom: 6 }}>Other challenges</h3>
      <div className="list">
        {past.map((c) => {
          const st = challengeStatus(c, data.activities, today);
          return (
            <div key={c.id}>
              <div className="list-item">
                <div className="grow">
                  <div className="title">{c.name}</div>
                  <div className="sub">
                    {formatDate(c.startDate, { short: true })} – {formatDate(c.endDate, { short: true, year: true })} · {dist(st.totalMi)} of {fmtDist(c.targetMiles)}
                  </div>
                </div>
                <button className="btn small ghost" onClick={() => setSelected(selected === c.id ? null : c.id)}>
                  {selected === c.id ? 'Hide' : 'Review'}
                </button>
                <button
                  className="btn small"
                  onClick={async () => {
                    await actions.update('profile', profile.id, { activeChallengeId: c.id });
                    notify(`${c.name} is now active`);
                  }}
                >
                  Make active
                </button>
              </div>
              {selected === c.id && <ChallengeReviewCard challenge={c} showTotals title={today > c.endDate ? 'End-of-challenge review' : 'So far'} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
