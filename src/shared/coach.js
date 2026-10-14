// Rule-based daily coach. Combines the deterministic planner, today's energy, food log and
// calendar into a structured recommendation. The AI layer (server) receives this as context
// and may rephrase/refine it, but all numbers come from here.
import { addDays, formatDuration, nowMinutes, timeToMin, weekday, toISODate } from './dates.js';
import { challengeStatus, round1, sumMiles } from './calc.js';
import { planChallenge } from './planner.js';
import { resolveDay, personalOf } from './schedule.js';
import { nutritionAdvice, dayNutritionTotals } from './nutrition.js';
import { latestEnergy, computePatterns } from './insights.js';
import { setUnit, toUnit, dist, wordDist, adjDist, fmtDist, unitWord } from './units.js';
import { typeNoun, isDistanceType } from './activities.js';

export function energyState(log) {
  if (!log) return { level: 'unknown', score: null };
  const e = Number(log.energy);
  const sore = Number(log.soreness || 0);
  const fatigue = Number(log.fatigue || 0);
  const recovery = log.recovery != null && log.recovery !== '' ? Number(log.recovery) : null;
  let level = e >= 7 ? 'good' : e >= 5 ? 'ok' : e >= 3 ? 'low' : 'very-low';
  if ((sore >= 8 || fatigue >= 8 || (recovery != null && recovery <= 2)) && level !== 'very-low') level = 'low';
  if (level === 'good' && (sore >= 6 || fatigue >= 7)) level = 'ok';
  return { level, score: e, soreness: sore, fatigue, recovery };
}

/**
 * Build the full coaching context and the rule-based recommendation.
 * data: { challenge, activities, energyLogs, foods, cal, profile, recommendations }
 */
export function buildCoaching(data, now = new Date()) {
  const today = toISODate(now);
  const nowMin = nowMinutes(now);
  const { challenge, activities = [], energyLogs = [], foods = [], cal = {}, profile = {}, recommendations = [] } = data;
  setUnit(profile.units);
  const patterns = computePatterns({ energyLogs, activities, foods, cal });
  const energyLog = latestEnergy(energyLogs, today);
  const energy = energyState(energyLog);
  const todayRec = recommendations.find((r) => r.date === today && r.challengeId === challenge.id);
  const skipped = todayRec?.status === 'skipped';

  const todayAdjust = {};
  if (skipped) todayAdjust.noRun = true;
  if (energy.level === 'very-low') Object.assign(todayAdjust, { noRun: true, lowEnergy: true });
  else if (energy.level === 'low') Object.assign(todayAdjust, { maxRunMi: 2.5, lowEnergy: true });
  else if (energy.level === 'ok') todayAdjust.maxRunMi = 5;

  const plan = planChallenge({ challenge, activities, cal, profile, today, nowMin, todayAdjust, patterns });
  const status = plan.status;
  const todayPlan = plan.days.find((d) => d.date === today);
  const tomorrowPlan = plan.days.find((d) => d.date === addDays(today, 1));
  const day = todayPlan?.day || resolveDay(today, cal);
  const tomorrow = tomorrowPlan?.day || resolveDay(addDays(today, 1), cal);
  const doneToday = activities.filter((a) => a.date === today && !a.deleted && !a.excluded);
  const doneTodayMi = sumMiles(doneToday);
  const foodsToday = foods.filter((f) => f.date === today);

  const rec = composeRecommendation({ today, nowMin, day, tomorrow, todayPlan, tomorrowPlan, plan, status, energy, doneToday, doneTodayMi, skipped, challenge, profile });
  rec.nutrition = nutritionAdvice({
    nowMin,
    foodsToday,
    todaySessions: todayPlan?.sessions || [],
    doneToday,
    tomorrow,
    prefs: profile.nutrition || {},
    pantry: profile.pantry || [],
    energy: energy.score,
  });
  rec.preparation = [...new Set([...(rec.preparation || []), ...rec.nutrition.prep])];
  rec.projection = {
    remainingMi: status.remainingMi,
    plannedMi: plan.plannedMi,
    projectedTotal: plan.projectedTotal,
    projectedCompletionDate: plan.projectedCompletionDate,
    shortfall: plan.shortfall,
    buffer: plan.buffer,
    state: plan.state,
  };
  rec.missing = [];
  if (!energyLog) rec.missing.push("You haven't logged energy today, so I've assumed it's normal.");
  rec.confidence = rec.missing.length >= 2 ? 'medium' : 'high';

  return { today, nowMin, plan, status, energy, energyLog, patterns, day, tomorrow, todayPlan, tomorrowPlan, doneToday, foodsToday, rec, todayRec };
}

function composeRecommendation(c) {
  const { today, nowMin, day, tomorrow, todayPlan, tomorrowPlan, plan, status, energy, doneToday, doneTodayMi, skipped, profile } = c;
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const sessions = (todayPlan?.sessions || []).filter((s) => !s.optional || true);
  const run = sessions.find((s) => s.type === 'run');
  const commute = sessions.find((s) => s.kind === 'commute');
  const extWalk = sessions.find((s) => s.kind === 'extendedWalk');
  const recWalk = sessions.find((s) => s.kind === 'recoveryWalk');
  const workouts = doneToday.filter((a) => a.type !== 'walk');
  const why = [];
  const prep = [];
  let action;
  let alternative;
  let activity = null;

  if (status.remainingMi <= 0) {
    action = { title: 'Challenge complete', summary: `You've reached ${wordDist(status.target)}. Anything from here is a bonus — move because you enjoy it.` };
    alternative = 'Rest, or a relaxed walk if you fancy it.';
    why.push('Your target is already met, so there is no need to chase extra mileage.');
  } else if (day.status === 'unavailable') {
    action = { title: 'No exercise today', summary: "You've marked today as unavailable. That's fine — the plan has already moved this mileage to other days." };
    alternative = commute ? `If you do end up walking, log it — ${wordDist(commute.distanceMi)} of commuting would still count.` : 'Rest.';
    why.push('Days you mark as unavailable are excluded from planning, and the remaining distance is spread across realistic opportunities.');
  } else if (energy.level === 'very-low') {
    action = { title: 'Rest and recover', summary: `Energy is ${energy.score}/10. Rest today${commute ? ' — your normal commute walking will still add some distance' : ''}.` };
    alternative = 'A gentle 15–20 minute walk if you feel like getting outside — only if it helps.';
    why.push('Pushing through very low energy rarely helps consistency. One rest day has a small effect on the overall plan.');
  } else if (plan.plannable === false) {
    action = {
      title: 'Log your activity as you go',
      summary: 'Cadence schedules runs and walks. Your challenge counts other activities, so log each one and your totals update straight away.',
    };
    alternative = 'Rest days are part of it — nothing is needed today if you are tired.';
    why.push(`${wordDist(status.remainingMi)} to go over ${status.daysRemaining} ${status.daysRemaining === 1 ? 'day' : 'days'} (about ${wordDist(status.requiredPerDay)} a day).`);
  } else if (workouts.length && !run) {
    const types = [...new Set(workouts.map((a) => a.type))];
    const mi = round1(sumMiles(workouts));
    const mins = workouts.reduce((t, a) => t + Number(a.durationMin || 0), 0);
    const title =
      types.length === 1 && isDistanceType(types[0])
        ? `${adjDist(mi)} ${typeNoun(types[0]).toLowerCase()} done`
        : types.length === 1
          ? `${mins ? `${mins} min of ` : ''}${typeNoun(types[0]).toLowerCase()} done`
          : 'Training done for today';
    action = {
      title,
      summary: `You've already trained today, so there's nothing more to add. Recover well${commute ? ` — and log your commute walking (about ${wordDist(commute.distanceMi)}) if you did it` : ''}.`,
    };
    activity = commute || null;
    alternative = 'A relaxed walk only if you fancy one — it is not needed for the plan.';
    why.push(mi > 0 ? `Today's ${wordDist(mi)} are already counted, and the rest of the plan has been recalculated around them.` : 'Today is logged, and the rest of the plan has been recalculated around it.');
  } else if (day.base === 'office' && !run) {
    const walkLine = commute ? `Your normal commute walking will contribute about ${wordDist(commute.distanceMi)}.` : '';
    if (extWalk && !extWalk.optional) {
      action = {
        title: commute ? `Commute walk + ${lc(extWalk.label)}` : extWalk.label,
        summary: `Today is a long office day, so don't force a run tonight. ${walkLine} ${extWalk.label} adds about ${wordDist(extWalk.distanceMi)} (around ${formatDuration(extWalk.durationMin)}).`,
      };
      activity = extWalk;
      why.push('The plan relies on a few strategic walks on office days to cover the remaining distance without adding late-evening runs.');
      alternative = commute ? `If you're tired or short on time, just do the normal commute (${fmtDist(commute.distanceMi)}) — the plan can absorb it.` : 'If you are tired, skip it — the plan can absorb it.';
    } else {
      action = {
        title: commute ? 'Office day — commute walking only' : 'Office day — no run planned',
        summary: `Today is a long office day, so don't force a run tonight. ${walkLine}${extWalk ? ` If you have the time and energy, ${lc(extWalk.label)} would add another ${wordDist(extWalk.distanceMi)}.` : ''}`,
      };
      activity = commute;
      alternative = extWalk ? `Optional: ${lc(extWalk.label)} (+${fmtDist(extWalk.distanceMi)}, ~${formatDuration(extWalk.durationMin)}).` : 'Rest this evening.';
      why.push(commute ? 'Long commute days are tiring, so the plan uses walking you are already doing rather than a late run.' : 'Office days are long, so the plan keeps your runs for days with better windows.');
    }
    if (commute && day.workEndsAt && nowMin > timeToMin(day.workEndsAt) + 15) action.summary += ' The commute is done for today — make sure the walking is logged.';
  } else if (run) {
    const t = run.time;
    activity = run;
    const late = t && timeToMin(t) + run.durationMin < nowMin;
    action = {
      title: `${run.label}: ${wordDist(run.distanceMi)}`,
      summary: `${run.label} of ${wordDist(run.distanceMi)} (~${formatDuration(run.durationMin)})${t ? ` at ${t}` : ''}${run.window ? ` (window ${run.window.start}–${run.window.end})` : ''}.`,
    };
    why.push(run.reason || 'This fits your best available window today.');
    if (energy.level === 'low') why.push(`Energy is ${energy.score}/10, so I've capped it at an easy ${wordDist(run.distanceMi)}.`);
    if (energy.level === 'good') why.push(`Energy is ${energy.score}/10 — a good day to run.`);
    if (run.kind === 'long') {
      alternative = `Shorter option: an easy ${wordDist(Math.max(3, round1(run.distanceMi * 0.55)))}, or split it into a run and a walk later.`;
    } else {
      alternative = `If you're tired or short on time: a ${adjDist(Math.max(1.5, round1(run.distanceMi * 0.6)))} easy run or a ${adjDist(2)} walk.`;
    }
    if (day.base === 'nans' || run.preferredWindow) {
      prep.push(`Pack your kit and shoes${day.leaveAt ? ` before you leave at ${day.leaveAt}` : ''}.`);
    }
    if (late) action.summary += ' (This window has passed — log it if you went, or mark it as skipped and the plan will adjust.)';
  } else if (recWalk) {
    activity = recWalk;
    action = { title: `${recWalk.label}: ${wordDist(recWalk.distanceMi)}`, summary: `A relaxed ${adjDist(recWalk.distanceMi)} walk${recWalk.time ? ` around ${recWalk.time}` : ''}.` };
    why.push(recWalk.reason);
    alternative = 'Rest completely if you need it.';
  } else if (sessions.length === 0 && todayPlan?.windows?.length === 0) {
    const passed = todayPlan && (day.blocks || []).some((b) => ['preferred', 'optional'].includes(b.kind) && timeToMin(b.end) < nowMin);
    action = {
      title: passed ? "Today's windows have passed" : 'Rest day',
      summary: passed
        ? "Your exercise windows for today have passed. Rest, eat well and get ready for tomorrow's opportunity."
        : day.status === 'rest'
          ? "Today's a planned rest day. Recovery is part of the plan."
          : 'No realistic exercise window today. Rest and prepare for the next opportunity.',
    };
    alternative = 'A short walk if you feel like it — it all counts.';
    why.push('The plan only uses time you have marked as genuinely available.');
  } else {
    action = { title: 'Easy day', summary: 'Nothing scheduled — a relaxed walk or rest.' };
    alternative = 'Rest.';
    why.push('Your plan covers the remaining distance on other days.');
  }

  if (skipped) why.push("You skipped today's original recommendation, so the plan has moved that mileage elsewhere.");
  if (day.period.active) why.push(todayPlan?.notes?.find((n) => n.startsWith('Period')) || 'Period day — listen to how you feel.');

  // Things to do tonight for tomorrow's session. (Upcoming days themselves are shown in "Coming up".)
  if (tomorrowPlan) {
    const tRun = tomorrowPlan.sessions.find((s) => s.type === 'run');
    if (tomorrow.base === 'nans' && tRun) prep.push(`Put your running kit aside tonight for tomorrow's run from ${personalOf(profile).runFromPlace}.`);
    else if (tRun && ['morning', 'evening'].includes(tomorrow.base)) prep.push(`Put your kit aside tonight for tomorrow's ${tomorrow.base} session.`);
    else if (tRun?.kind === 'long') prep.push('Long run tomorrow — lay out your kit tonight and get to bed on time.');
    else if (tRun?.kind === 'lunch') prep.push('Lunchtime run tomorrow — leave your kit by the door.');
  }

  const suggestedTime = activity?.time || (activity?.kind === 'commute' ? 'On your commute' : null);
  return {
    generatedAt: new Date().toISOString(),
    source: 'rules',
    action,
    activity: activity
      ? { type: activity.type, kind: activity.kind, label: activity.label, distanceMi: activity.distanceMi, durationMin: activity.durationMin, time: suggestedTime }
      : null,
    suggestedTime,
    rationale: why,
    alternative,
    preparation: prep,
    sessionsToday: sessions.map((s) => ({ label: s.label, type: s.type, distanceMi: s.distanceMi, time: s.time, optional: !!s.optional, expected: !!s.expected })),
  };
}

/** Stable fingerprint of the inputs that matter for today's recommendation. */
export function contextFingerprint(ctx) {
  const parts = [
    ctx.today,
    ctx.status.totalMi,
    ctx.energy.score ?? '-',
    ctx.foodsToday.length,
    ctx.plan.plannedMi,
    ['completed', 'modified', 'skipped'].includes(ctx.todayRec?.status) ? ctx.todayRec.status : '',
    (ctx.todayPlan?.sessions || []).map((s) => s.kind + s.distanceMi).join(','),
  ];
  return parts.join('|');
}

/** Compact structured summary sent to the AI model. Contains no credentials. Distances are in the user's unit. */
export function aiContext(ctx, data) {
  const { plan, status, energy, energyLog, patterns, day, tomorrow, doneToday, foodsToday, rec } = ctx;
  setUnit(data.profile?.units);
  const D = (mi) => round1(toUnit(mi));
  const u = unitWord();
  const recent = data.activities
    .filter((a) => !a.deleted && !a.excluded && !a.isBaseline && a.date >= addDays(ctx.today, -10))
    .map((a) => ({ date: a.date, type: a.type, distance: D(a.distanceMi), minutes: a.durationMin || null, effort: a.effort || null }));
  return {
    distanceUnit: u,
    now: { date: ctx.today, weekday: day.date && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday(ctx.today)], time: `${String(Math.floor(ctx.nowMin / 60)).padStart(2, '0')}:${String(ctx.nowMin % 60).padStart(2, '0')}` },
    challenge: {
      name: data.challenge.name,
      target: D(status.target),
      counts: data.challenge.activityTypes,
      dates: [data.challenge.startDate, data.challenge.endDate],
      completed: { total: D(status.totalMi), byType: Object.fromEntries(Object.entries(status.byType || {}).map(([t, mi]) => [t, D(mi)])) },
      remaining: D(status.remainingMi),
      daysRemainingInclToday: status.daysRemaining,
      avgRequiredPerDay: D(status.requiredPerDay),
      vsTargetLine: D(status.vsTrajectory),
      planState: plan.state,
      plannedFutureDistance: D(plan.plannedMi),
      planShortfall: D(plan.shortfall),
      planBuffer: D(plan.buffer),
      projectedCompletionDate: plan.projectedCompletionDate,
    },
    today: {
      dayType: day.label,
      status: day.status,
      blocks: day.blocks.map((b) => `${b.start}-${b.end} ${b.kind}: ${b.label}`),
      events: day.events.map((e) => `${e.start || 'all day'}-${e.end || ''} ${e.title}`),
      periodActive: day.period.active,
      loggedActivities: doneToday.map((a) => ({ type: a.type, distance: D(a.distanceMi), minutes: a.durationMin || null, time: a.startTime || null })),
      energy: energyLog ? { energy: energy.score, sleepHours: energyLog.sleepHours ?? null, soreness: energyLog.soreness ?? null, fatigue: energyLog.fatigue ?? null, mood: energyLog.mood ?? null, notes: energyLog.notes || null } : 'not logged',
      food: foodsToday.map((f) => ({ meal: f.meal, time: f.time, text: f.text, kcal: f.estimate?.totals?.kcal ? Math.round(f.estimate.totals.kcal) : null })),
      plannedSessions: ctx.todayPlan?.sessions.map((s) => ({ label: s.label, type: s.type, distance: D(s.distanceMi), time: s.time, optional: !!s.optional })) || [],
    },
    nextDays: plan.days.slice(1, 6).map((d) => ({
      date: d.date,
      dayType: d.day.label,
      status: d.day.status,
      events: d.day.events.map((e) => e.title),
      period: d.day.period.active,
      sessions: d.sessions.map((s) => `${s.label} ${dist(s.distanceMi)}${unitWord() === 'km' ? 'km' : 'mi'}${s.time ? ' @' + s.time : ''}${s.optional ? ' (optional)' : ''}`),
    })),
    recentActivities: recent,
    patterns: patterns.findings.map((f) => f.text),
    nutritionPrefs: data.profile?.nutrition || {},
    pantry: data.profile?.pantry || [],
    ruleBasedDraft: {
      action: rec.action,
      alternative: rec.alternative,
      rationale: rec.rationale,
      nutrition: { headline: rec.nutrition.headline, lines: rec.nutrition.lines, ideas: rec.nutrition.ideas.map((i) => i.name) },
      preparation: rec.preparation,
    },
    tomorrow: { dayType: tomorrow.label, status: tomorrow.status },
  };
}

/** A short, data-driven encouragement line — chosen from the actual state, never random. */
export function motivationLine(ctx) {
  const { status, plan, energy, doneToday } = ctx;
  const trained = doneToday.some((a) => a.type !== 'walk');
  const todayMi = round1(sumMiles(doneToday));
  const sessions = status.sessionCount;
  if (status.remainingMi <= 0) return `You've reached ${wordDist(status.target)}. Everything from here is a bonus — enjoy it.`;
  if (status.ended) return 'The challenge window has closed. Whatever the total, every bit you logged counted.';
  if (energy.level === 'very-low' || energy.level === 'low')
    return 'Low-energy days are part of any month. Look after yourself today — the plan has room to adapt.';
  if (trained) return `Another session in the bank${sessions > 1 ? ` — that's ${sessions} logged this challenge` : ''}. Consistency like this is what gets ${wordDist(status.target)} done.`;
  if (todayMi > 0) return `${wordDist(todayMi)} already today. Every bit counts towards ${wordDist(status.target)}.`;
  if (plan.plannable === false) return `${wordDist(status.remainingMi)} to go. Log each session as you do it and the totals take care of themselves.`;
  if (plan.state === 'ahead') return `You're ${wordDist(status.vsTrajectory)} ahead of even pace — you've earned some easier days.`;
  if (plan.state === 'at-risk') return "It's tight, but small changes close the gap — an extra walk here, an easy run there. You don't need heroics.";
  if (plan.state === 'behind')
    return `You're ${wordDist(-status.vsTrajectory)} behind even pace, but your realistic plan still gets you there. One session at a time.`;
  if (status.pct >= 75) return `Over ${Math.floor(status.pct / 5) * 5}% done. The finish line is in sight.`;
  return `You're on track — ${wordDist(status.remainingMi)} to go and a plan that fits your week.`;
}

/**
 * What the AI nutrition coach sees when a meal is logged: food from today and yesterday
 * (with estimated totals), training over the last few days and what's planned next.
 * The meal just logged isn't in the totals yet — the AI estimates it in the same call.
 */
export function mealContext(ctx, data, { mealSlot } = {}) {
  setUnit(data.profile?.units);
  const D = (mi) => round1(toUnit(mi));
  const today = ctx.today;
  const yesterday = addDays(today, -1);
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const r0 = (n) => Math.round(n || 0);
  const day = (date) => {
    const foods = data.foods.filter((f) => f.date === date && !f.deleted).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const t = dayNutritionTotals(foods);
    return {
      entries: foods.map((f) => {
        const e = f.estimate?.totals;
        return { time: f.time || null, text: f.text, ...(e && f.estimate?.confidence !== 'none' ? { kcal: r0(e.kcal), carbsG: r0(e.carbs), proteinG: r0(e.protein), fatG: r0(e.fat) } : { estimate: 'none' }) };
      }),
      estimatedTotals: t.estimatedEntries ? { kcal: r0(t.kcal), carbsG: r0(t.carbs), proteinG: r0(t.protein), fatG: r0(t.fat) } : null,
      entriesWithoutEstimate: t.entries - t.estimatedEntries,
    };
  };
  const acts = (from, to) =>
    data.activities
      .filter((a) => !a.deleted && !a.excluded && !a.isBaseline && a.date >= from && a.date <= to)
      .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')))
      .map((a) => ({ date: a.date, type: a.type, ...(isDistanceType(a.type) ? { distance: D(a.distanceMi) } : {}), minutes: a.durationMin || null, startTime: a.startTime || null, effort: a.effort || null }));
  const session = (s) => ({ type: s.type, label: s.label, distance: D(s.distanceMi), time: s.time || null, optional: !!s.optional });
  const tomorrowPlan = ctx.plan.days.find((d) => d.date === addDays(today, 1));
  const e = ctx.energyLog;
  return {
    distanceUnit: unitWord(),
    now: { date: today, time: hhmm(ctx.nowMin), mealSlot: mealSlot || null },
    intake: {
      note: 'Estimated from what they typed; "today" does not yet include the meal just logged.',
      today: day(today),
      yesterday: day(yesterday),
    },
    training: {
      today: acts(today, today),
      yesterday: acts(yesterday, yesterday),
      previous3Days: acts(addDays(today, -4), addDays(today, -2)),
      stillPlannedToday: (ctx.todayPlan?.sessions || []).filter((s) => !s.time || timeToMin(s.time) > ctx.nowMin).map(session),
      plannedTomorrow: tomorrowPlan ? tomorrowPlan.sessions.map(session) : [],
      tomorrowDayType: ctx.tomorrow?.label || null,
    },
    energyToday: e ? { score: ctx.energy.score, sleepHours: e.sleepHours ?? null, soreness: e.soreness ?? null, fatigue: e.fatigue ?? null } : null,
    periodActive: !!ctx.day?.period?.active,
    nutritionPrefs: data.profile?.nutrition || {},
    pantry: data.profile?.pantry || [],
  };
}
