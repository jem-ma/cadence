import { useStore } from '../lib/store.jsx';
import { formatDuration, relativeDay } from '../shared/dates.js';
import { fmtDist } from '../shared/units.js';
import { recoveryAdvice, fuellingPlan } from '../shared/nutrition.js';

/** Recovery (only after a run today) and fuelling ahead of the next planned run. */
export function RecoveryAndFuelling() {
  const { today, data, coaching, profile, now } = useStore();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const prefs = profile.nutrition || {};
  const pantry = profile.pantry || [];

  const recovery = recoveryAdvice({
    doneToday: data.activities.filter((a) => a.date === today && !a.deleted && !a.excluded),
    foodsToday: data.foods.filter((f) => f.date === today),
    nowMin,
    prefs,
    pantry,
  });
  const nextRun = coaching?.plan.days.flatMap((d) => d.sessions.filter((s) => s.type === 'run').map((s) => ({ ...s, date: d.date })))[0];
  const fuel = nextRun ? fuellingPlan({ run: nextRun, isToday: nextRun.date === today, nowMin, prefs, pantry }) : null;
  if (!recovery && !fuel) return null;

  return (
    <div className="grid grid-2">
      {recovery && (
        <section className={`card coach ${fuel ? '' : 'span-2'}`}>
          <div className="section-title">Recovery</div>
          <h3>{recovery.headline}</h3>
          <p className="small muted" style={{ margin: '4px 0 10px' }}>
            {recovery.summary}
          </p>
          {recovery.lines.map((l) => (
            <p key={l} className="small">
              {l}
            </p>
          ))}
        </section>
      )}
      {fuel && (
        <section className={`card ${recovery ? '' : 'span-2'}`}>
          <div className="section-title">Fuelling</div>
          <h3>{fuel.headline}</h3>
          <p className="small muted" style={{ margin: '4px 0 12px' }}>
            {nextRun.label} · {fmtDist(nextRun.distanceMi)}{nextRun.durationMin ? ` (≈${formatDuration(nextRun.durationMin)})` : ''} · {relativeDay(nextRun.date, today)}
            {nextRun.time ? ` at ${nextRun.time}` : ''}
          </p>
          <div className="step-list">
            {fuel.steps.map((s) => (
              <div key={s.when} className={`step ${s.past ? 'past' : ''}`}>
                <span className="when">{s.when}</span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
