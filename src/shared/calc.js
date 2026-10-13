// Deterministic mileage calculations. Nothing here depends on the AI layer.
import { addDays, dateRange, diffDays, startOfWeek } from './dates.js';

export const KM_PER_MILE = 1.609344;
export const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const kmToMi = (km) => km / KM_PER_MILE;
export const miToKm = (mi) => mi * KM_PER_MILE;

/** An activity counts toward a challenge when it's in range, not excluded and not deleted. */
export function countsToward(activity, challenge) {
  return (
    !activity.deleted &&
    !activity.excluded &&
    activity.date >= challenge.startDate &&
    activity.date <= challenge.endDate &&
    (challenge.activityTypes || ['run', 'walk']).includes(activity.type)
  );
}

export function challengeActivities(activities, challenge) {
  return activities.filter((a) => countsToward(a, challenge)).sort(byDateTime);
}

export function byDateTime(a, b) {
  return (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || ''));
}

export function sumMiles(list, type) {
  // integer hundredths avoids floating drift such as 13.7 + 10 = 23.700000000000003
  const hundredths = list
    .filter((a) => !type || a.type === type)
    .reduce((s, a) => s + Math.round(Number(a.distanceMi || 0) * 100), 0);
  return hundredths / 100;
}

/**
 * Core challenge status. `today` is a local ISO date string.
 * Days remaining counts calendar days from today (inclusive) to the end date (inclusive),
 * including days with no activity.
 */
export function challengeStatus(challenge, activities, today) {
  const list = challengeActivities(activities, challenge);
  const runMi = sumMiles(list, 'run');
  const walkMi = sumMiles(list, 'walk');
  const totalMi = round2(runMi + walkMi);
  const target = Number(challenge.targetMiles);
  const remainingMi = round2(Math.max(0, target - totalMi));
  const pct = target > 0 ? Math.min(100, (totalMi / target) * 100) : 0;

  const started = today >= challenge.startDate;
  const ended = today > challenge.endDate;
  const fromDay = started ? today : challenge.startDate;
  const daysRemaining = ended ? 0 : diffDays(fromDay, challenge.endDate) + 1;
  const totalDays = diffDays(challenge.startDate, challenge.endDate) + 1;
  const daysElapsed = ended ? totalDays : started ? diffDays(challenge.startDate, today) : 0; // full days before today
  const requiredPerDay = daysRemaining > 0 ? remainingMi / daysRemaining : 0;

  // Target trajectory: linear from start to end. Where should I be by the end of yesterday?
  const expectedByYesterday = (target * daysElapsed) / totalDays;
  const doneBeforeToday = sumMiles(list.filter((a) => a.date < today));
  const vsTrajectory = round1(doneBeforeToday - expectedByYesterday);

  const todayMi = sumMiles(list.filter((a) => a.date === today));

  return {
    runMi: round2(runMi),
    walkMi: round2(walkMi),
    totalMi,
    target,
    remainingMi,
    pct,
    daysRemaining,
    totalDays,
    daysElapsed,
    requiredPerDay,
    vsTrajectory,
    todayMi,
    started,
    ended,
    achieved: totalMi >= target,
    activityCount: list.length,
    runCount: list.filter((a) => a.type === 'run' && !a.isBaseline).length,
  };
}

/** Cumulative series for charts: one point per day from start to end. */
export function cumulativeSeries(challenge, activities, today, plannedByDate = {}) {
  const list = challengeActivities(activities, challenge);
  const days = dateRange(challenge.startDate, challenge.endDate);
  const byDate = {};
  for (const a of list) byDate[a.date] = (byDate[a.date] || 0) + Number(a.distanceMi || 0);
  const target = Number(challenge.targetMiles);
  let cum = 0;
  let planCum = null;
  return days.map((d, i) => {
    cum += byDate[d] || 0;
    const isPast = d <= today;
    if (d === today) planCum = cum;
    else if (d > today && planCum != null) planCum += plannedByDate[d] || 0;
    return {
      date: d,
      actual: isPast ? round2(cum) : null,
      target: round2((target * (i + 1)) / days.length),
      planned: d >= today && planCum != null ? round2(planCum) : null,
      dayMi: round2(byDate[d] || 0),
    };
  });
}

export function dailyTotals(activities, start, end) {
  const out = {};
  for (const d of dateRange(start, end)) out[d] = { run: 0, walk: 0, total: 0 };
  for (const a of activities) {
    if (a.deleted || a.excluded || !out[a.date]) continue;
    out[a.date][a.type] = round2((out[a.date][a.type] || 0) + Number(a.distanceMi));
    out[a.date].total = round2(out[a.date].total + Number(a.distanceMi));
  }
  return out;
}

export function weeklyTotals(challenge, activities) {
  const list = challengeActivities(activities, challenge);
  const weeks = [];
  let ws = startOfWeek(challenge.startDate);
  while (ws <= challenge.endDate) {
    const we = addDays(ws, 6);
    const inWeek = list.filter((a) => a.date >= ws && a.date <= we);
    weeks.push({
      weekStart: ws,
      weekEnd: we,
      run: sumMiles(inWeek, 'run'),
      walk: sumMiles(inWeek, 'walk'),
      total: sumMiles(inWeek),
    });
    ws = addDays(ws, 7);
  }
  return weeks;
}

/** Real (non-baseline) activities in a window — used for recency and load reasoning. */
export function recentActivities(activities, today, days) {
  const from = addDays(today, -days);
  return activities
    .filter((a) => !a.deleted && !a.excluded && !a.isBaseline && a.date >= from && a.date <= today)
    .sort(byDateTime);
}

export function paceMinPerMile(activities, type, fallback) {
  const withTime = activities.filter(
    (a) => a.type === type && !a.deleted && !a.isBaseline && a.durationMin > 0 && a.distanceMi > 0.5
  );
  if (withTime.length < 2) return fallback;
  const recent = withTime.slice(-8);
  const pace = sumDur(recent) / sumMiles(recent);
  // guard against bad data
  if (type === 'run' && (pace < 6 || pace > 16)) return fallback;
  if (type === 'walk' && (pace < 12 || pace > 30)) return fallback;
  return pace;
}

function sumDur(list) {
  return list.reduce((s, a) => s + Number(a.durationMin || 0), 0);
}

export function longestRun(activities, from, to) {
  return activities
    .filter((a) => a.type === 'run' && !a.deleted && !a.excluded && !a.isBaseline && a.date >= from && a.date <= to)
    .reduce((m, a) => Math.max(m, Number(a.distanceMi)), 0);
}

/** Detect likely duplicates between an incoming activity and existing ones. */
export function findPossibleDuplicate(incoming, existing) {
  return existing.find((a) => {
    if (a.deleted || a.id === incoming.id) return false;
    if (a.externalId && incoming.externalId && a.externalId === incoming.externalId) return true;
    if (a.date !== incoming.date || a.type !== incoming.type || a.isBaseline) return false;
    const dd = Math.abs(Number(a.distanceMi) - Number(incoming.distanceMi));
    const tol = Math.max(0.15, Number(incoming.distanceMi) * 0.06);
    if (dd > tol) return false;
    if (a.startTime && incoming.startTime) {
      const [ah, am] = a.startTime.split(':').map(Number);
      const [ih, im] = incoming.startTime.split(':').map(Number);
      if (Math.abs(ah * 60 + am - (ih * 60 + im)) > 90) return false;
    }
    return true;
  });
}

export function validateActivity(a) {
  const errors = {};
  if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) errors.date = 'Choose a date';
  if (!['run', 'walk'].includes(a.type)) errors.type = 'Choose run or walk';
  const d = Number(a.distanceMi);
  if (!(d > 0)) errors.distanceMi = 'Distance must be more than 0';
  else if (d > 100) errors.distanceMi = 'That looks too far — check the units';
  if (a.durationMin != null && a.durationMin !== '' && !(Number(a.durationMin) >= 0)) errors.durationMin = 'Invalid duration';
  if (a.startTime && !/^\d{2}:\d{2}$/.test(a.startTime)) errors.startTime = 'Use HH:MM';
  return errors;
}
