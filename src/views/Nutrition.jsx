import { useStore } from '../lib/store.jsx';
import { recoveryAdvice } from '../shared/nutrition.js';

/** Recovery advice, shown only after a run today. */
export function RecoveryAndFuelling() {
  const { today, data, profile, now } = useStore();
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
  if (!recovery) return null;

  return (
    <section className="card coach">
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
  );
}
