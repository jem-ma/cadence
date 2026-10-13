// Pattern detection over logged data. Every finding states its sample size and
// is phrased as an observation, not a diagnosis.
import { addDays, dateRange, weekday, DAY_NAMES } from './dates.js';
import { wordDist } from './units.js';
import { resolveDay, periodState, typeName } from './schedule.js';
import { round1, sumMiles } from './calc.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** Average of each numeric wellbeing field per date. */
export function wellbeingByDate(energyLogs) {
  const by = {};
  for (const e of energyLogs) {
    by[e.date] = by[e.date] || { n: 0 };
    for (const k of ['energy', 'sleepQuality', 'sleepHours', 'mood', 'soreness', 'fatigue', 'motivation', 'recovery']) {
      if (e[k] == null || e[k] === '') continue;
      by[e.date][k + 'Sum'] = (by[e.date][k + 'Sum'] || 0) + Number(e[k]);
      by[e.date][k + 'N'] = (by[e.date][k + 'N'] || 0) + 1;
    }
    if (e.cycle) by[e.date].cycle = e.cycle;
  }
  const out = {};
  for (const [d, v] of Object.entries(by)) {
    out[d] = {};
    for (const k of ['energy', 'sleepQuality', 'sleepHours', 'mood', 'soreness', 'fatigue', 'motivation', 'recovery']) {
      if (v[k + 'N']) out[d][k] = v[k + 'Sum'] / v[k + 'N'];
    }
    if (v.cycle) out[d].cycle = v.cycle;
  }
  return out;
}

export function latestEnergy(energyLogs, date) {
  const today = energyLogs.filter((e) => e.date === date && e.energy != null).sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return today[0] || null;
}

export function computePatterns({ energyLogs = [], activities = [], foods = [], cal = {} }) {
  const wb = wellbeingByDate(energyLogs);
  const dates = Object.keys(wb).sort();
  const acts = activities.filter((a) => !a.deleted && !a.excluded && !a.isBaseline);
  const milesOn = (d) => sumMiles(acts.filter((a) => a.date === d));
  const runOn = (d) => sumMiles(acts.filter((a) => a.date === d && a.type === 'run'));
  const findings = [];
  const needs = [];
  const result = { findings, needs, periodEnergyDrop: null };

  const withEnergy = dates.filter((d) => wb[d].energy != null);
  if (withEnergy.length < 5) {
    needs.push(`Log energy on ${5 - withEnergy.length} more day${5 - withEnergy.length === 1 ? '' : 's'} to start seeing patterns.`);
  }

  // Period vs energy (uses both actual and expected entries; also wellbeing cycle notes)
  const isPeriod = (d) => periodState(d, cal.cycle || []).active || /period|bleed|menstru/i.test(wb[d]?.cycle || '');
  const pDays = withEnergy.filter(isPeriod);
  const oDays = withEnergy.filter((d) => !isPeriod(d));
  if (pDays.length >= 3 && oDays.length >= 5) {
    const drop = mean(oDays.map((d) => wb[d].energy)) - mean(pDays.map((d) => wb[d].energy));
    result.periodEnergyDrop = round1(drop);
    findings.push({
      key: 'period',
      title: 'Energy around your period',
      text:
        Math.abs(drop) < 0.8
          ? `So far your energy on period days (${pDays.length} logged) is similar to other days. The plan won't assume a dip.`
          : drop > 0
            ? `On period days your energy has averaged ${round1(drop)} points lower (${pDays.length} days vs ${oDays.length}). The coach keeps those days flexible rather than cutting them automatically.`
            : `Interestingly, your energy on period days has been ${round1(-drop)} points higher than other days (${pDays.length} logged).`,
      n: pDays.length + oDays.length,
    });
  } else if ((cal.cycle || []).length) {
    needs.push('Log energy on a few more period and non-period days to learn how your cycle affects you — if it does.');
  }

  // Sleep vs energy
  const sleepPairs = withEnergy.filter((d) => wb[d].sleepHours != null);
  if (sleepPairs.length >= 6) {
    const r = pearson(sleepPairs.map((d) => wb[d].sleepHours), sleepPairs.map((d) => wb[d].energy));
    if (r != null && Math.abs(r) >= 0.3) {
      findings.push({
        key: 'sleep',
        title: 'Sleep and energy',
        text: `${r > 0 ? 'More' : 'Less'} sleep tends to go with higher energy for you (correlation ${r.toFixed(2)}, ${sleepPairs.length} days).`,
        n: sleepPairs.length,
      });
    }
  }

  // Energy vs running that day
  const eRun = withEnergy.filter((d) => d <= dates[dates.length - 1]);
  const hi = eRun.filter((d) => wb[d].energy >= 7);
  const lo = eRun.filter((d) => wb[d].energy <= 4);
  if (hi.length >= 3 && lo.length >= 3) {
    findings.push({
      key: 'energyMiles',
      title: 'Energy and mileage',
      text: `On higher-energy days (7+) you averaged ${wordDist(mean(hi.map(milesOn)))}; on low-energy days (≤4), ${wordDist(mean(lo.map(milesOn)))}.`,
      n: hi.length + lo.length,
    });
  }

  // Day after a longer run
  const longDates = [...new Set(acts.filter((a) => a.type === 'run' && a.distanceMi >= 5.5).map((a) => a.date))];
  const after = longDates.map((d) => addDays(d, 1)).filter((d) => wb[d]?.energy != null);
  if (after.length >= 3 && withEnergy.length >= 8) {
    const others = withEnergy.filter((d) => !after.includes(d));
    const diff = mean(after.map((d) => wb[d].energy)) - mean(others.map((d) => wb[d].energy));
    findings.push({
      key: 'afterLong',
      title: 'The day after a long run',
      text:
        diff < -0.8
          ? `Energy is usually ${round1(-diff)} points lower the day after a long run (${after.length} examples). Easy days after long runs are already built into your plan.`
          : `You usually recover well — energy the day after a long run is close to normal (${after.length} examples).`,
      n: after.length,
    });
  }

  // Energy by type of day
  if (withEnergy.length >= 8) {
    const byType = {};
    for (const d of withEnergy) {
      const t = resolveDay(d, cal).dayType;
      (byType[t] = byType[t] || []).push(wb[d].energy);
    }
    const rows = Object.entries(byType).filter(([, v]) => v.length >= 2).map(([t, v]) => [t, mean(v), v.length]);
    if (rows.length >= 2) {
      rows.sort((a, b) => a[1] - b[1]);
      const label = (t) => typeName(t, cal, 'plural');
      findings.push({
        key: 'dayType',
        title: 'Which days drain you',
        text: `Energy is lowest on ${label(rows[0][0]).toLowerCase()} (avg ${round1(rows[0][1])}) and highest on ${label(rows[rows.length - 1][0]).toLowerCase()} (avg ${round1(rows[rows.length - 1][1])}).`,
        n: withEnergy.length,
      });
    }
  }

  // Fuelling: food logged vs running
  const foodDates = [...new Set(foods.map((f) => f.date))];
  const runDates = [...new Set(acts.filter((a) => a.type === 'run').map((a) => a.date))];
  const runWithSnack = runDates.filter((d) => foods.some((f) => f.date === d && f.meal === 'snack'));
  if (runDates.length >= 4 && foodDates.length >= 5) {
    const runEffort = (d) => mean(acts.filter((a) => a.date === d && a.type === 'run' && a.effort).map((a) => Number(a.effort)));
    const withS = runWithSnack.map(runEffort).filter((x) => x != null);
    const without = runDates.filter((d) => !runWithSnack.includes(d)).map(runEffort).filter((x) => x != null);
    if (withS.length >= 2 && without.length >= 2) {
      const diff = mean(without) - mean(withS);
      findings.push({
        key: 'snack',
        title: 'Snacks and how runs feel',
        text:
          diff > 0.7
            ? `Runs on days you logged a snack felt easier (effort ${round1(mean(withS))} vs ${round1(mean(without))}).`
            : `So far, logging a snack hasn't made an obvious difference to how hard runs feel (${withS.length + without.length} runs).`,
        n: withS.length + without.length,
      });
    }
  } else {
    needs.push('Log food on a few run days to see how fuelling relates to how runs feel.');
  }

  // Most productive weekdays
  if (acts.length >= 8) {
    const byWd = Array(7).fill(0);
    for (const a of acts) byWd[weekday(a.date)] += Number(a.distanceMi);
    const best = byWd.map((m, i) => [i, m]).sort((a, b) => b[1] - a[1])[0];
    findings.push({
      key: 'weekday',
      title: 'Your most productive day',
      text: `${DAY_NAMES[best[0]]}s have contributed the most distance (${wordDist(best[1])} logged).`,
      n: acts.length,
    });
  }

  return result;
}

