// Daily, weekly and end-of-challenge reviews, computed from logged data only.
import { addDays, startOfWeek, weekday, DAY_NAMES } from './dates.js';
import { dist, fmtDist, wordDist, toUnit, fromUnit } from './units.js';
import { challengeActivities, challengeStatus, round1, sumMiles, longestRun, weeklyTotals } from './calc.js';
import { dayNutritionTotals } from './nutrition.js';
import { wellbeingByDate } from './insights.js';
import { resolveDay, typeName, personalOf } from './schedule.js';

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function dailyReview({ date, activities, foods, energyLogs, recommendations, challenge, cal, planForTomorrow }) {
  const acts = activities.filter((a) => a.date === date && !a.deleted && !a.excluded);
  const f = foods.filter((x) => x.date === date);
  const e = energyLogs.filter((x) => x.date === date);
  const rec = recommendations.find((r) => r.date === date && r.challengeId === challenge.id);
  const status = challengeStatus(challenge, activities, addDays(date, 1));
  const run = sumMiles(acts, 'run');
  const walk = sumMiles(acts, 'walk');
  let toPlan = 'No recommendation was recorded for this day.';
  if (rec) {
    const planned = rec.payload?.activity?.distanceMi || 0;
    if (rec.status === 'completed') toPlan = 'You completed the recommended session.';
    else if (rec.status === 'skipped') toPlan = 'You skipped the recommendation — the plan has moved that distance elsewhere.';
    else if (rec.status === 'modified') toPlan = 'You did something different from the plan — totals and future sessions have updated.';
    else if (planned && run + walk >= planned * 0.9) toPlan = 'Broadly to plan.';
    else if (planned) toPlan = `Less than planned (${fmtDist(run + walk)} of ~${fmtDist(planned)} suggested).`;
  }
  return {
    date,
    run,
    walk,
    total: round1(run + walk),
    activities: acts,
    foodCount: f.length,
    nutrition: dayNutritionTotals(f),
    energy: avg(e.filter((x) => x.energy != null).map((x) => Number(x.energy))),
    wellbeingNotes: e.map((x) => x.notes).filter(Boolean),
    toPlan,
    remaining: status.remainingMi,
    tomorrow: planForTomorrow || null,
    tomorrowDay: resolveDay(addDays(date, 1), cal),
  };
}

export function challengeReview({ challenge, activities, energyLogs, foods, cal, recommendations, today }) {
  const acts = challengeActivities(activities, challenge);
  const real = acts.filter((a) => !a.isBaseline);
  const st = challengeStatus(challenge, activities, addDays(challenge.endDate, 1));
  const weeks = weeklyTotals(challenge, activities);
  const activeDays = new Set(real.map((a) => a.date)).size;
  const byType = {};
  for (const a of real) {
    const t = resolveDay(a.date, cal).dayType;
    byType[t] = (byType[t] || 0) + Number(a.distanceMi);
  }
  const bestType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const byWd = Array(7).fill(0);
  for (const a of real) byWd[weekday(a.date)] += Number(a.distanceMi);
  const bestWd = byWd.map((m, i) => [i, m]).sort((a, b) => b[1] - a[1])[0];
  const P = personalOf(cal);
  const extWalks = P.extraWalk.enabled
    ? real.filter((a) => a.type === 'walk' && a.distanceMi >= Math.max(1, Number(P.extraWalk.mi) * 0.9) && resolveDay(a.date, cal).base === 'office').length
    : 0;
  const wb = wellbeingByDate(energyLogs.filter((e) => e.date >= challenge.startDate && e.date <= challenge.endDate));
  const energies = Object.values(wb).map((v) => v.energy).filter((x) => x != null);
  const recs = recommendations.filter((r) => r.challengeId === challenge.id);
  const decided = recs.filter((r) => ['completed', 'modified', 'skipped'].includes(r.status));
  const fuelled = foods.filter((f) => f.date >= challenge.startDate && f.date <= challenge.endDate);

  const worked = [];
  if (bestType) worked.push(`${typeName(bestType[0], cal, 'plural')} produced the most distance (${fmtDist(bestType[1])}).`);
  if (bestWd && bestWd[1] > 0) worked.push(`${DAY_NAMES[bestWd[0]]} was your strongest day of the week.`);
  if (extWalks) worked.push(`${personalOf(cal).extraWalk.label} added distance on ${extWalks} office day${extWalks === 1 ? '' : 's'}.`);
  const strongest = [...weeks].sort((a, b) => b.total - a.total)[0];

  const next = [];
  const ended = (today || '9999-12-31') > challenge.endDate;
  if (!ended && !st.achieved) next.push(`Still in progress — ${wordDist(st.remainingMi)} to go. Suggestions for the next challenge appear once this one ends.`);
  else if (st.achieved) next.push(`You hit ${wordDist(st.target)}. A similar target with the same anchor sessions is very achievable; consider +10% only if energy stayed good.`);
  else next.push(`You reached ${dist(st.totalMi)} of ${wordDist(st.target)}. A target around ${wordDist(fromUnit(Math.round(toUnit(st.totalMi) / 5) * 5 + 5))} may be more realistic for a similar month.`);
  if (energies.length >= 5 && avg(energies) < 5.5) next.push('Average energy was on the low side — build in more planned rest days next time.');

  return {
    achieved: st.achieved,
    total: st.totalMi,
    run: st.runMi,
    walk: st.walkMi,
    target: st.target,
    longest: longestRun(activities, challenge.startDate, challenge.endDate),
    activeDays,
    runCount: real.filter((a) => a.type === 'run').length,
    strongestWeek: strongest,
    worked,
    bestDayType: bestType ? { label: typeName(bestType[0], cal, 'plural'), mi: round1(bestType[1]) } : null,
    bestWeekday: bestWd && bestWd[1] > 0 ? { name: DAY_NAMES[bestWd[0]], mi: round1(bestWd[1]) } : null,
    extendedWalks: extWalks,
    energyAvg: energies.length ? round1(avg(energies)) : null,
    energyDays: energies.length,
    foodEntries: fuelled.length,
    // only recommendations you marked (done / changed / skipped) count
    recCompletion: decided.length ? Math.round((decided.filter((r) => r.status === 'completed').length / decided.length) * 100) : null,
    next,
    weeks,
  };
}

export { startOfWeek };
