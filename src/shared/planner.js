// Deterministic session planner. Distributes remaining mileage across realistic opportunities
// in the calendar, respecting recovery rules. It never assumes every day is usable.
import { addDays, dateRange, diffDays, startOfWeek, weekday, timeToMin } from './dates.js';
import { challengeStatus, recentActivities, longestRun, paceMinPerMile, round1, round2, sumMiles } from './calc.js';
import { resolveDay, exerciseWindows, personalOf } from './schedule.js';

export const DEFAULT_TRAINING = {
  easyRunMi: 3.5,
  lunchRunMi: 3.1,
  nansRunMi: 4,
  longRunMinMi: 6,
  longRunMaxMi: 8,
  easyRunMaxMi: 5,
  maxRunDaysPerWeek: 4,
  maxConsecutiveRunDays: 2,
  runPaceMin: 10.5,
  walkPaceMin: 20,
  allowExtendedWalks: true,
  maxExtendedWalksPerWeek: 3,
};

function labelsFor(P) {
  return {
    run: 'Easy run',
    lunch: 'Lunchtime run',
    nans: `Run from ${P.runFromPlace}`,
    long: 'Long run',
    commute: 'Commute walking',
    extendedWalk: P.extraWalk.label || 'Longer walk home',
    recoveryWalk: 'Recovery walk',
    walk: 'Walk',
    user: 'Planned session',
  };
}

export function planChallenge(input) {
  const {
    challenge,
    activities,
    cal,
    profile = {},
    today,
    nowMin = 0,
    todayAdjust = {},
    patterns = {},
  } = input;
  const T = { ...DEFAULT_TRAINING, ...(profile.training || {}) };
  const P = personalOf(cal.personal ? cal : profile);
  const L = labelsFor(P);
  const runPace = paceMinPerMile(activities, 'run', T.runPaceMin);
  const walkPace = paceMinPerMile(activities, 'walk', T.walkPaceMin);
  const status = challengeStatus(challenge, activities, today);

  if (status.ended || today > challenge.endDate) {
    return { days: [], status, plannedMi: 0, projectedTotal: status.totalMi, shortfall: 0, buffer: 0, state: status.achieved ? 'complete' : 'ended', gapOptions: [], runPace, walkPace };
  }

  const startDate = today < challenge.startDate ? challenge.startDate : today;
  const dates = dateRange(startDate, challenge.endDate);
  const todayActs = activities.filter((a) => a.date === today && !a.deleted && !a.excluded);
  const ranToday = todayActs.some((a) => a.type === 'run');
  const walkedToday = sumMiles(todayActs.filter((a) => a.type === 'walk'));

  // Recent context for recovery rules
  const recent = recentActivities(activities, addDays(today, -1), 14);
  const recentLongest = longestRun(activities, addDays(today, -28), today);
  const longCap = Math.max(T.longRunMinMi, Math.min(T.longRunMaxMi, recentLongest ? recentLongest + 1.5 : T.longRunMaxMi));
  const longTarget = round1(Math.max(T.longRunMinMi, Math.min(longCap, recentLongest ? recentLongest + 0.5 : (T.longRunMinMi + T.longRunMaxMi) / 2)));
  const ranOn = new Set(activities.filter((a) => a.type === 'run' && !a.deleted && !a.excluded && !a.isBaseline).map((a) => a.date));
  const longOn = new Set(
    activities.filter((a) => a.type === 'run' && !a.deleted && !a.excluded && !a.isBaseline && a.distanceMi >= T.longRunMinMi - 0.5).map((a) => a.date)
  );

  const periodDrop = patterns.periodEnergyDrop ?? null; // e.g. 1.8 points lower on period days

  // ---- Build per-day candidate opportunities ----
  const days = dates.map((date) => {
    const day = resolveDay(date, cal);
    const isToday = date === today;
    const { windows, inconvenient } = exerciseWindows(day, { fromMinute: isToday ? nowMin + 10 : 0 });
    const sessions = [];
    const candidates = [];
    const notes = [];

    // User-planned sessions are fixed and take priority
    for (const p of day.status === 'unavailable' ? [] : day.planned) {
      if (p.status === 'done' || p.status === 'skipped') continue;
      if (isToday && p.type === 'run' && ranToday) continue;
      sessions.push(mk(p.type === 'run' ? (p.distanceMi >= T.longRunMinMi ? 'long' : 'run') : p.title === L.extendedWalk ? 'extendedWalk' : 'walk', p.type, Number(p.distanceMi) || 0, p.time || null, {
        fixed: true,
        label: p.title || L.user,
        plannedId: p.id,
        reason: 'You scheduled this yourself.',
      }));
    }

    // A day whose plan you've set yourself gets exactly those sessions — nothing added.
    if (day.planLocked) {
      notes.push(day.status === 'unavailable' ? 'Marked as no exercise possible.' : sessions.length ? 'You set this day\'s plan.' : 'You planned no sessions for this day.');
      return { date, day, sessions, candidates, notes, windows, inconvenient, isToday };
    }

    const workable = day.status !== 'unavailable';
    // Commute walking on office days happens anyway; we count it as expected mileage.
    if (day.features.commuteWalkMi && workable && !(isToday && walkedToday >= day.features.commuteWalkMi * 0.75)) {
      sessions.push(
        mk('commute', 'walk', day.features.commuteWalkMi, null, {
          label: L.commute,
          reason: 'Normal walking to and from the office. Log it so it counts.',
          expected: true,
        })
      );
    }

    if (day.status === 'rest' || day.status === 'unavailable') {
      notes.push(day.status === 'rest' ? 'Planned rest day.' : 'Marked as no exercise possible.');
      return { date, day, sessions, candidates, notes, windows, inconvenient, isToday };
    }

    const hasUserWalk = sessions.some((x) => x.fixed && x.type === 'walk');
    if (day.features.extendedWalk && day.status === 'normal' && T.allowExtendedWalks && !hasUserWalk && !(isToday && nowMin > timeToMin(extraWalkTime(day)) + 15)) {
      candidates.push(
        mk('extendedWalk', 'walk', day.features.extendedWalk.mi, extraWalkTime(day), {
          label: L.extendedWalk,
          durationMin: day.features.extendedWalk.min,
          reason: `Adds about ${day.features.extendedWalk.mi} miles to a day you are commuting anyway, without a late-evening run.`,
        })
      );
    }

    const hasUserRun = sessions.some((s) => s.type === 'run');
    const noRunToday = isToday && (ranToday || todayAdjust.noRun);
    if (!hasUserRun && !noRunToday && windows.length) {
      const best = windows[0];
      const maxByWindow = Math.max(0, (best.minutes - 15) / runPace);
      const busyCap = day.status === 'busy' ? 3 : Infinity;
      let kind = 'run';
      let mi = T.easyRunMi;
      if (day.features.runFromWork && best.activity === 'run') {
        kind = 'nans';
        mi = T.nansRunMi;
      } else if (day.features.lunchRun && best.activity === 'run') {
        kind = 'lunch';
        mi = T.lunchRunMi;
      } else if ((best.activity === 'long' || best.minutes >= 100) && day.features.longRunPossible !== false && best.minutes >= longTarget * runPace + 15) {
        kind = 'longCandidate';
        mi = longTarget;
      }
      const cap = Math.min(maxByWindow, busyCap, kind === 'longCandidate' ? longCap : kind === 'lunch' ? Math.max(T.lunchRunMi, (best.minutes - 15) / runPace) : T.easyRunMaxMi);
      mi = Math.min(mi, cap);
      if (isToday && todayAdjust.maxRunMi != null) mi = Math.min(mi, todayAdjust.maxRunMi);
      if (mi >= 1.5) {
        candidates.push(
          mk(kind, 'run', round1(mi), best.start, {
            window: best,
            maxMi: round1(Math.max(mi, Math.min(cap, isToday && todayAdjust.maxRunMi != null ? todayAdjust.maxRunMi : cap))),
            preferredWindow: best.kind === 'preferred',
          })
        );
      }
      // Weekend/free days can also hold a recovery walk when a run isn't placed
      if (best.minutes >= 60 && ['weekend', 'free'].includes(day.dayType) && !hasUserWalk) {
        candidates.push(mk('recoveryWalk', 'walk', 2.5, windows[1]?.start || best.start, { reason: 'Gentle mileage that supports recovery.' }));
      }
    }
    if (day.period.active) {
      notes.push(
        periodDrop != null && periodDrop >= 1.5
          ? `Period ${day.period.actual ? 'logged' : 'expected'} — your history shows lower energy around now, so keep this flexible.`
          : `Period ${day.period.actual ? 'logged' : 'expected'} — kept flexible; decide on the day.`
      );
    }
    return { date, day, sessions, candidates, notes, windows, inconvenient, isToday };
  });

  // ---- Phase A: base plan (preferred runs + one long run per week) ----
  const weekOf = (d) => startOfWeek(d);
  const runDays = new Set([...ranOn].filter((d) => d <= today && d >= addDays(startDate, -7)));
  const longDays = new Set([...longOn].filter((d) => d >= addDays(startDate, -7)));
  const runsInWeek = (ws) => [...runDays].filter((d) => weekOf(d) === ws).length + countUserRuns(days, ws);
  for (const d of days) for (const s of d.sessions) if (s.type === 'run') runDays.add(d.date), s.kind === 'long' && longDays.add(d.date);

  const canRun = (date, isLong) => {
    if (runsInWeek(weekOf(date)) >= T.maxRunDaysPerWeek) return false;
    // no run the day after a long run; keep the day after a long run free of runs
    if (longDays.has(addDays(date, -1))) return false;
    if (isLong && (runDays.has(addDays(date, 1)) || longDays.has(addDays(date, -2)))) return false;
    let streak = 0;
    while (streak < 7 && runDays.has(addDays(date, -(streak + 1)))) streak++;
    if (streak >= T.maxConsecutiveRunDays) return false;
    let ahead = 0;
    while (ahead < 7 && runDays.has(addDays(date, ahead + 1))) ahead++;
    return streak + ahead < T.maxConsecutiveRunDays;
  };
  const place = (d, c, reason, extra = {}) => {
    const s = { ...c, ...extra, reason: reason || c.reason };
    d.sessions.push(s);
    d.candidates = d.candidates.filter((x) => x !== c);
    if (s.type === 'run') runDays.add(d.date);
    if (s.kind === 'long') longDays.add(d.date);
  };

  // 1) one long run per week, on the weekend day with the most room
  const weeks = [...new Set(days.map((d) => weekOf(d.date)))];
  for (const ws of weeks) {
    if ([...longDays].some((d) => weekOf(d) === ws)) continue;
    const opts = days
      .filter((d) => weekOf(d.date) === ws && d.candidates.some((c) => c.kind === 'longCandidate'))
      .sort((a, b) => {
        const ca = a.candidates.find((c) => c.kind === 'longCandidate').window.minutes;
        const cb = b.candidates.find((c) => c.kind === 'longCandidate').window.minutes;
        return cb - ca || (weekday(a.date) === 6 ? -1 : 1);
      });
    for (const d of opts) {
      if (!canRun(d.date, true)) continue;
      const c = d.candidates.find((x) => x.kind === 'longCandidate');
      const mi = periodAdjust(d, c.distanceMi, periodDrop);
      place(d, c, `Your weekend has room for a longer run. ${round1(mi)} miles builds on your recent long runs without a big jump.`, {
        kind: 'long',
        label: L.long,
        distanceMi: mi,
      });
      break;
    }
  }

  // 2) preferred-window runs (run from work, lunchtime 5K)
  for (const d of days) {
    const c = d.candidates.find((x) => (x.kind === 'nans' || x.kind === 'lunch') && x.preferredWindow);
    if (!c || !canRun(d.date)) continue;
    const reason =
      c.kind === 'nans'
        ? `You can run straight from ${P.runFromPlace}${c.time ? ` at ${c.time}` : ''} — no extra travel, and it's your most reliable midweek run.`
        : 'Working from home leaves a lunchtime window that fits a 5K comfortably.';
    place(d, c, reason, { label: L[c.kind], distanceMi: periodAdjust(d, c.distanceMi, periodDrop) });
  }

  // ---- Phase B: close the gap with the smallest realistic additions ----
  const remaining = status.remainingMi;
  const totalPlanned = () => round2(days.reduce((s, d) => s + d.sessions.reduce((t, x) => t + x.distanceMi, 0), 0));
  const weekPlanned = (ws) => days.filter((d) => weekOf(d.date) === ws).reduce((s, d) => s + d.sessions.reduce((t, x) => t + x.distanceMi, 0), 0);
  const extendedInWeek = (ws) => days.filter((d) => weekOf(d.date) === ws).reduce((n, d) => n + d.sessions.filter((s) => s.kind === 'extendedWalk').length, 0);
  const target = remaining * 1.03; // small safety margin

  let guard = 0;
  while (totalPlanned() < target && guard++ < 200) {
    const options = [];
    for (const d of days) {
      const ws = weekOf(d.date);
      const load = weekPlanned(ws);
      for (const c of d.candidates) {
        if (c.kind === 'extendedWalk') {
          if (extendedInWeek(ws) >= T.maxExtendedWalksPerWeek) continue;
          if (d.isToday && todayAdjust.lowEnergy) continue;
          options.push({ d, c, score: 1.8 + load / 60, why: 'Strategic walking on a day you are already commuting adds mileage without extra running load.' });
        } else if (c.type === 'run' && ['run', 'lunch', 'nans', 'longCandidate'].includes(c.kind)) {
          if (!canRun(d.date, false)) continue;
          options.push({ d, c, score: (c.preferredWindow ? 1.5 : 2.2) + load / 60, why: 'An extra easy run in a window that is genuinely free.' });
        } else if (c.kind === 'recoveryWalk') {
          options.push({ d, c, score: 2.6 + load / 50, why: 'A relaxed walk adds distance while you recover.' });
        }
      }
      // lengthen existing runs a little
      for (const s of d.sessions) {
        if (s.type !== 'run' || s.fixed) continue;
        const cap = s.kind === 'long' ? longCap : s.maxMi || T.easyRunMaxMi;
        if (s.distanceMi + 0.5 <= cap + 0.01) options.push({ d, s, score: 3 + load / 40, why: 'A small extension keeps the increase gradual.' });
      }
    }
    if (!options.length) break;
    options.sort((a, b) => a.score - b.score);
    const o = options[0];
    if (o.s) {
      o.s.distanceMi = round1(o.s.distanceMi + 0.5);
      o.s.extended = true;
    } else {
      const c = o.c;
      const kind = c.kind === 'longCandidate' ? 'run' : c.kind;
      const mi = c.kind === 'longCandidate' ? Math.min(T.easyRunMi, c.distanceMi) : c.distanceMi;
      place(o.d, c, o.why, { kind, label: L[kind] || c.label, distanceMi: periodAdjust(o.d, mi, periodDrop) });
    }
  }

  // ---- finalise: durations, cumulative, optional flags ----
  let cum = 0;
  let projectedCompletionDate = null;
  for (const d of days) {
    d.sessions.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
    for (const s of d.sessions) {
      s.durationMin = s.durationMin || Math.round(s.distanceMi * (s.type === 'run' ? runPace : walkPace));
      if (!s.label) s.label = L[s.kind] || L[s.type];
      if (cum >= remaining * 1.05 && !s.fixed && !s.expected && remaining > 0) {
        s.optional = true;
        s.reason = 'Optional — your target is already covered by earlier sessions.';
      }
      cum += s.distanceMi;
      if (!projectedCompletionDate && cum >= remaining && remaining > 0) projectedCompletionDate = d.date;
    }
    d.plannedMi = round2(d.sessions.reduce((t, x) => t + x.distanceMi, 0));
  }
  const plannedMi = totalPlanned();
  const shortfall = round1(Math.max(0, remaining - plannedMi));
  const buffer = round1(Math.max(0, plannedMi - remaining));

  let state = 'on-track';
  if (status.remainingMi <= 0) state = 'complete';
  else if (shortfall > 0.05) state = 'at-risk';
  else if (status.vsTrajectory >= 3) state = 'ahead';
  else if (status.vsTrajectory <= -3) state = 'behind';

  const gapOptions = shortfall > 0 ? suggestGapOptions(days, shortfall, T) : [];

  return {
    days,
    status,
    plannedMi,
    projectedTotal: round1(status.totalMi + plannedMi),
    projectedCompletionDate,
    shortfall,
    buffer,
    state,
    gapOptions,
    runPace,
    walkPace,
    longTarget,
    recentLongest,
    recentRuns: recent.filter((a) => a.type === 'run').length,
    plannedByDate: Object.fromEntries(days.map((d) => [d.date, d.plannedMi])),
  };
}

function mk(kind, type, distanceMi, time, extra = {}) {
  return { kind, type, distanceMi: round1(distanceMi), time, ...extra };
}

function countUserRuns(days, ws) {
  return days.filter((d) => startOfWeek(d.date) === ws && d.sessions.some((s) => s.type === 'run' && s.fixed)).length;
}

function periodAdjust(d, mi, drop) {
  if (!d.day.period.active || drop == null || drop < 1.5) return round1(mi);
  return round1(Math.max(2, mi * 0.8));
}

function suggestGapOptions(days, shortfall, T) {
  const out = [];
  const inconvenient = days.filter((d) => d.inconvenient.length && !d.sessions.some((s) => s.type === 'run'));
  const busyOrOff = days.filter((d) => ['busy', 'unavailable'].includes(d.day.status));
  out.push(`The realistic plan falls about ${shortfall} miles short. Small changes that would close it:`);
  if (busyOrOff.length) out.push(`Free up part of ${busyOrOff.length === 1 ? 'one blocked day' : `one of ${busyOrOff.length} busy/blocked days`} for a 3-mile run.`);
  const weekendDays = days.filter((d) => [0, 6].includes(weekday(d.date)) && d.day.status === 'normal');
  if (weekendDays.length) out.push('Add a second, easy weekend outing — a 3-mile walk the day after a long run is gentle and counts.');
  if (inconvenient.length) out.push(`${inconvenient.length} evenings are technically free but tiring. One easy 3-mile run on an evening you feel good would help — only if it suits you.`);
  if (!T.allowExtendedWalks) out.push('Re-enable the walk-home-from-two-stops-early option on office days (+3 miles each).');
  out.push(`Lowering the target is also a legitimate choice if the month has turned out busier than planned.`);
  return out;
}

/** Plan diff helper — how many future planned miles changed between two plans. */
export function plannedDelta(a, b) {
  return round1((b?.plannedMi || 0) - (a?.plannedMi || 0));
}

export function daysUntil(today, date) {
  return diffDays(today, date);
}

/** The extra walk replaces the end of the commute home, so it starts before the work block ends. */
function extraWalkTime(day) {
  const end = day.workEndsAt ? timeToMin(day.workEndsAt) : 18 * 60 + 30;
  const min = day.features.extendedWalk?.min || 60;
  const t = end - min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
