// Deterministic logic: totals, planner, coach, nutrition estimates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedData } from '../src/shared/seed.js';
import { challengeStatus, findPossibleDuplicate } from '../src/shared/calc.js';
import { planChallenge } from '../src/shared/planner.js';
import { buildCoaching, mealContext, weekContext } from '../src/shared/coach.js';
import { estimateFromText } from '../src/shared/nutrition.js';
import { addDays, weekday } from '../src/shared/dates.js';

function fixture() {
  const s = seedData();
  return {
    challenge: s.challenges[0],
    activities: s.activities,
    energyLogs: [],
    foods: [],
    profile: s.profile[0],
    recommendations: [],
    cal: { weekTemplate: s.calendar[0].template, dayOverrides: [], events: [], cycle: [], plannedSessions: [], personal: s.profile[0].personal },
  };
}
const at = (iso) => new Date(iso);

test('1–2. starting challenge: 13.7 run + 10 walk = 23.7, 76.3 remaining', () => {
  const d = fixture();
  const st = challengeStatus(d.challenge, d.activities, '2026-10-12');
  assert.equal(st.runMi, 13.7);
  assert.equal(st.walkMi, 10);
  assert.equal(st.totalMi, 23.7);
  assert.equal(st.remainingMi, 76.3);
  assert.equal(st.daysRemaining, 20); // 12–31 Oct inclusive
  assert.ok(Math.abs(st.requiredPerDay - 76.3 / 20) < 1e-9);
});

test('days remaining follows the real date, not 12 October', () => {
  const d = fixture();
  assert.equal(challengeStatus(d.challenge, d.activities, '2026-10-25').daysRemaining, 7);
  assert.equal(challengeStatus(d.challenge, d.activities, '2026-11-02').daysRemaining, 0);
  assert.equal(challengeStatus(d.challenge, d.activities, '2026-09-20').daysRemaining, 31);
});

test('3. logging an activity updates totals', () => {
  const d = fixture();
  const acts = [...d.activities, { id: 'a1', date: '2026-10-12', type: 'run', distanceMi: 3.1 }];
  const st = challengeStatus(d.challenge, acts, '2026-10-12');
  assert.equal(st.runMi, 16.8);
  assert.equal(st.totalMi, 26.8);
  assert.equal(st.remainingMi, 73.2);
  assert.equal(st.todayMi, 3.1);
});

test('4. editing, excluding or deleting recalculates; out-of-range dates do not count', () => {
  const d = fixture();
  const a = { id: 'a1', date: '2026-10-12', type: 'walk', distanceMi: 2 };
  const base = challengeStatus(d.challenge, [...d.activities, a], '2026-10-12').totalMi;
  assert.equal(base, 25.7);
  assert.equal(challengeStatus(d.challenge, [...d.activities, { ...a, distanceMi: 3 }], '2026-10-12').totalMi, 26.7);
  assert.equal(challengeStatus(d.challenge, [...d.activities, { ...a, excluded: true }], '2026-10-12').totalMi, 23.7);
  assert.equal(challengeStatus(d.challenge, [...d.activities, { ...a, deleted: true }], '2026-10-12').totalMi, 23.7);
  assert.equal(challengeStatus(d.challenge, [...d.activities, { ...a, date: '2026-11-01' }], '2026-10-12').totalMi, 23.7);
});

test('duplicate detection matches same day/type/similar distance only', () => {
  const existing = [{ id: 'm', date: '2026-10-14', type: 'run', distanceMi: 4.0, startTime: '18:05' }];
  assert.ok(findPossibleDuplicate({ date: '2026-10-14', type: 'run', distanceMi: 4.08, startTime: '18:02' }, existing));
  assert.equal(findPossibleDuplicate({ date: '2026-10-14', type: 'walk', distanceMi: 4.0 }, existing), undefined);
  assert.equal(findPossibleDuplicate({ date: '2026-10-14', type: 'run', distanceMi: 6 }, existing), undefined);
  assert.equal(findPossibleDuplicate({ date: '2026-10-14', type: 'run', distanceMi: 4, startTime: '07:00' }, existing), undefined);
});

test('planner respects recovery rules and covers the remaining distance realistically', () => {
  const d = fixture();
  const plan = planChallenge({ ...d, today: '2026-10-12', nowMin: 8 * 60 });
  assert.equal(plan.shortfall, 0);
  const runDays = plan.days.filter((x) => x.sessions.some((s) => s.type === 'run')).map((x) => x.date);
  const longDays = plan.days.filter((x) => x.sessions.some((s) => s.kind === 'long')).map((x) => x.date);
  for (const l of longDays) assert.ok(!runDays.includes(addDays(l, 1)), `no run the day after a long run (${l})`);
  // no late runs on office days
  for (const x of plan.days) if (x.day.dayType === 'office') assert.ok(!x.sessions.some((s) => s.type === 'run'), x.date);
  // Wednesday Nan's run and Friday lunchtime run are anchors
  assert.ok(plan.days.find((x) => x.date === '2026-10-14').sessions.some((s) => s.kind === 'nans'));
  assert.ok(plan.days.find((x) => x.date === '2026-10-16').sessions.some((s) => s.kind === 'lunch'));
  // long runs are within the preferred 6–8 mile range
  for (const x of plan.days) for (const s of x.sessions) if (s.kind === 'long') assert.ok(s.distanceMi >= 6 && s.distanceMi <= 8);
  // at most 2 run days in a row
  for (const r of runDays) assert.ok(!(runDays.includes(addDays(r, 1)) && runDays.includes(addDays(r, 2))));
});

test('9. making Friday unavailable moves the lunchtime run elsewhere', () => {
  const d = fixture();
  const before = planChallenge({ ...d, today: '2026-10-12', nowMin: 480 });
  const cal = { ...d.cal, dayOverrides: [{ id: '2026-10-16', date: '2026-10-16', dayType: 'wfh', status: 'unavailable', blocks: [] }] };
  const after = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 480 });
  assert.equal(after.days.find((x) => x.date === '2026-10-16').plannedMi, 0);
  assert.ok(before.days.find((x) => x.date === '2026-10-16').plannedMi > 0);
  // the mileage is redistributed rather than lost (plan still covers the target or reports the gap)
  assert.ok(after.shortfall === 0 || after.gapOptions.length > 0);
  assert.notDeepEqual(before.plannedByDate, after.plannedByDate);
});

test('one-off commitment that covers a window removes that session', () => {
  const d = fixture();
  const cal = { ...d.cal, events: [{ id: 'e', date: '2026-10-14', title: 'Dinner', start: '18:00', end: '21:00', blocksExercise: true }] };
  const plan = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 480 });
  assert.ok(!plan.days.find((x) => x.date === '2026-10-14').sessions.some((s) => s.type === 'run'));
});

test('10. recommendation changes with energy, mileage and commitments', () => {
  const d = fixture();
  const wedMorning = at('2026-10-14T09:00:00');
  const normal = buildCoaching(d, wedMorning).rec;
  assert.match(normal.action.title, /Nan's/);
  assert.equal(normal.activity.distanceMi, 4);

  const low = buildCoaching({ ...d, energyLogs: [{ id: 'e', date: '2026-10-14', time: '08:30', energy: 4 }] }, wedMorning).rec;
  assert.ok(low.activity.distanceMi <= 2.5, 'low energy caps the run');
  assert.ok(low.rationale.some((r) => /Energy is 4\/10/.test(r)));

  const veryLow = buildCoaching({ ...d, energyLogs: [{ id: 'e', date: '2026-10-14', time: '08:30', energy: 2 }] }, wedMorning).rec;
  assert.equal(veryLow.action.title, 'Rest and recover');

  const done = buildCoaching({ ...d, activities: [...d.activities, { id: 'r', date: '2026-10-14', type: 'run', distanceMi: 4, startTime: '07:00' }] }, wedMorning).rec;
  assert.match(done.action.title, /4-mile run done/);
  assert.ok(!done.activity || done.activity.type !== 'run', 'no second run suggested');

  const busy = buildCoaching({ ...d, cal: { ...d.cal, dayOverrides: [{ id: '2026-10-14', dayType: 'nans', status: 'unavailable', blocks: [] }] } }, wedMorning).rec;
  assert.equal(busy.action.title, 'No exercise today');

  // ahead of target: planner marks later sessions optional instead of adding miles
  const ahead = buildCoaching({ ...d, activities: [...d.activities, { id: 'big', date: '2026-10-11', type: 'walk', distanceMi: 50 }] }, wedMorning);
  assert.equal(ahead.plan.state, 'ahead');
  assert.ok(ahead.plan.days.some((x) => x.sessions.some((s) => s.optional)));
});

test('12. coach always offers an alternative and never prescribes exercise at very low energy', () => {
  const d = fixture();
  for (const day of ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-16', '2026-10-17', '2026-10-18']) {
    for (const energy of [1, 2, 5, 9]) {
      const c = buildCoaching({ ...d, energyLogs: [{ id: 'e', date: day, time: '07:00', energy }] }, at(`${day}T07:30:00`));
      assert.ok(c.rec.alternative && c.rec.alternative.length > 3, `${day} e${energy}`);
      assert.ok(c.rec.rationale.length >= 1);
      if (energy <= 2) assert.ok(!c.rec.activity || c.rec.activity.type !== 'run', `no run at energy ${energy} on ${day}`);
    }
  }
});

test('weekend long run is suggested on a free Saturday', () => {
  const d = fixture();
  const c = buildCoaching(d, at('2026-10-17T08:00:00'));
  assert.equal(weekday('2026-10-17'), 6);
  assert.equal(c.rec.activity.type, 'run');
  assert.ok(c.rec.activity.distanceMi >= 6);
});

test('11. food estimates are labelled estimates and handle unknown foods', () => {
  const e = estimateFromText('Porridge with banana and peanut butter');
  assert.equal(e.items.length, 3);
  assert.ok(e.totals.kcal > 300 && e.totals.kcal < 700);
  assert.equal(e.source, 'library');
  assert.match(e.note, /estimate/i);
  const wrap = estimateFromText('Chicken wrap and crisps');
  assert.deepEqual(wrap.items.map((i) => i.name), ['Chicken wrap', 'Crisps']);
  const unknown = estimateFromText('mystery stew');
  assert.equal(unknown.confidence, 'none');
});

test('a confirmed suggestion is not suggested a second time', () => {
  const d = fixture();
  const cal = { ...d.cal, plannedSessions: [{ id: 'p1', date: '2026-10-13', type: 'walk', distanceMi: 3, time: '18:15', title: 'Walk home from two stops early', status: 'planned' }] };
  const plan = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 480 });
  const tue = plan.days.find((x) => x.date === '2026-10-13');
  assert.equal(tue.sessions.filter((s) => s.kind === 'extendedWalk').length, 1);
  assert.equal(tue.plannedMi, 5); // 3 confirmed + 2 commute
});

test('a day whose plan you set uses exactly your sessions; the rest of the month re-plans', () => {
  const d = fixture();
  const before = planChallenge({ ...d, today: '2026-10-12', nowMin: 480 });
  const cal = {
    ...d.cal,
    dayPlans: [{ id: '2026-10-14', locked: true }],
    plannedSessions: [{ id: 'p', date: '2026-10-14', type: 'run', distanceMi: 2.5, time: '18:15', title: 'Short run from Nan’s', status: 'planned' }],
  };
  const after = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 480 });
  const wed = after.days.find((x) => x.date === '2026-10-14');
  assert.deepEqual(wed.sessions.map((s) => [s.label, s.distanceMi]), [['Short run from Nan’s', 2.5]]);
  assert.ok(after.plannedMi >= after.status.remainingMi || after.gapOptions.length > 0, 'still covers the target, or reports the gap');
  assert.notDeepEqual(before.plannedByDate, after.plannedByDate);

  const empty = planChallenge({ ...d, cal: { ...d.cal, dayPlans: [{ id: '2026-10-13', locked: true }] }, today: '2026-10-12', nowMin: 480 });
  assert.equal(empty.days.find((x) => x.date === '2026-10-13').plannedMi, 0, 'removing every session, including commute, leaves the day empty');
});

test('an unavailable day ignores sessions you had planned', () => {
  const d = fixture();
  const cal = {
    ...d.cal,
    dayOverrides: [{ id: '2026-10-14', date: '2026-10-14', status: 'unavailable' }],
    plannedSessions: [{ id: 'p', date: '2026-10-14', type: 'run', distanceMi: 4, title: 'Run', status: 'planned' }],
  };
  const plan = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 480 });
  const wed = plan.days.find((x) => x.date === '2026-10-14');
  assert.equal(wed.plannedMi, 0);
  assert.equal(wed.day.dayType, 'nans', 'marking unavailable keeps the calendar day type');
});

// ---------- multiple activity types, units, custom day types ----------
import { openingBalanceDate, validateActivity } from '../src/shared/calc.js';
import { setUnit } from '../src/shared/units.js';
import { typeDefFor, resolveDay, defaultWeekTemplate, PLACEHOLDER_DAY_TYPES } from '../src/shared/schedule.js';

test('opening balance goes on the last day of the previous week, so this week starts clear', () => {
  // Monday 12 Oct 2026 → Sunday 11 Oct
  assert.equal(openingBalanceDate('2026-10-12', '2026-10-01'), '2026-10-11');
  // mid-week → still the Sunday before this week
  assert.equal(openingBalanceDate('2026-10-15', '2026-10-01'), '2026-10-11');
  // a challenge that started this week can't be dated before it began
  assert.equal(openingBalanceDate('2026-10-15', '2026-10-13'), '2026-10-13');
  // and a balance on that date leaves "this week" empty
  const d = fixture();
  const acts = [{ id: 'b', date: '2026-10-11', type: 'walk', distanceMi: 8, isBaseline: true }];
  const st = challengeStatus(d.challenge, acts, '2026-10-12');
  assert.equal(st.totalMi, 8);
});

test('every counted activity type adds to the total; boxing is time-only', () => {
  const challenge = { ...fixture().challenge, activityTypes: ['walk', 'run', 'cycle', 'swim', 'box'] };
  const acts = [
    { id: '1', date: '2026-10-12', type: 'cycle', distanceMi: 12.5 },
    { id: '2', date: '2026-10-12', type: 'swim', distanceMi: 0.6 },
    { id: '3', date: '2026-10-12', type: 'box', distanceMi: 0, durationMin: 45 },
    { id: '4', date: '2026-10-12', type: 'run', distanceMi: 3 },
  ];
  const st = challengeStatus(challenge, acts, '2026-10-12');
  assert.equal(st.totalMi, 16.1);
  assert.equal(st.byType.cycle, 12.5);
  assert.equal(st.byType.box, 0);
  assert.equal(st.sessionCount, 4);
  // an activity type the challenge doesn't count is ignored
  const runOnly = { ...challenge, activityTypes: ['run'] };
  assert.equal(challengeStatus(runOnly, acts, '2026-10-12').totalMi, 3);
});

test('activity validation: distance for distance types, duration for boxing', () => {
  assert.ok(validateActivity({ date: '2026-10-12', type: 'run', distanceMi: 0 }).distanceMi);
  assert.deepEqual(validateActivity({ date: '2026-10-12', type: 'swim', distanceMi: 1 }), {});
  assert.ok(validateActivity({ date: '2026-10-12', type: 'box', distanceMi: 0 }).durationMin);
  assert.deepEqual(validateActivity({ date: '2026-10-12', type: 'box', distanceMi: 0, durationMin: 40 }), {});
  assert.ok(validateActivity({ date: '2026-10-12', type: 'kayak', distanceMi: 3 }).type);
});

test('the planner only schedules activities the challenge counts', () => {
  const d = fixture();
  const walkOnly = planChallenge({ ...d, challenge: { ...d.challenge, activityTypes: ['walk'] }, today: '2026-10-12', nowMin: 480 });
  assert.ok(walkOnly.days.every((x) => x.sessions.every((s) => s.type === 'walk')), 'no runs planned when running does not count');
  const cyclingOnly = planChallenge({ ...d, challenge: { ...d.challenge, activityTypes: ['cycle'] }, today: '2026-10-12', nowMin: 480 });
  assert.equal(cyclingOnly.plannable, false);
  assert.equal(cyclingOnly.plannedMi, 0);
  assert.notEqual(cyclingOnly.state, 'at-risk');
  const c = buildCoaching({ ...d, challenge: { ...d.challenge, activityTypes: ['cycle'] } }, at('2026-10-14T09:00:00'));
  assert.match(c.rec.action.title, /Log your activity/);
});

test('distances are shown in kilometres when that is the unit, and stored in miles', () => {
  const d = fixture();
  const profile = { ...d.profile, units: 'km' };
  const c = buildCoaching({ ...d, profile, activities: [...d.activities, { id: 'r', date: '2026-10-14', type: 'run', distanceMi: 3.10686, startTime: '07:00' }] }, at('2026-10-14T09:00:00'));
  setUnit('km');
  const text = JSON.stringify([c.rec.action, c.rec.alternative, c.rec.rationale, c.rec.preparation]);
  assert.match(c.rec.action.title, /5-km run done/);
  assert.doesNotMatch(text, /\bmiles?\b|\bmi\b/);
  assert.equal(challengeStatus(d.challenge, d.activities, '2026-10-12').totalMi, 23.7, 'the stored figure is still miles');
  setUnit('mi');
});

test('custom day types: your names, and behaviour from their base', () => {
  const dayTypes = [...PLACEHOLDER_DAY_TYPES, { id: 'c-long', label: 'Long-run Sunday', base: 'flex' }];
  assert.deepEqual(PLACEHOLDER_DAY_TYPES.map((t) => t.label), ['Office day', 'Work from home', 'Morning movement', 'Evening movement', 'Weekend', 'Too busy']);
  assert.equal(typeDefFor('c-long', { dayTypes }).label, 'Long-run Sunday');
  assert.equal(typeDefFor('c-long', { dayTypes }).base, 'flex');

  const d = fixture();
  const mapping = { 1: 'evening', 2: 'morning', 3: 'off', 4: 'office', 5: 'wfh', 6: 'c-long', 0: 'weekend' };
  const cal = { ...d.cal, dayTypes, weekTemplate: defaultWeekTemplate(mapping, { personal: d.cal.personal, dayTypes }) };
  assert.equal(resolveDay('2026-10-12', cal).label, 'Evening movement');
  assert.equal(resolveDay('2026-10-14', cal).label, 'Too busy');
  const plan = planChallenge({ ...d, cal, today: '2026-10-12', nowMin: 360 });
  const mon = plan.days.find((x) => x.date === '2026-10-12');
  const run = mon.sessions.find((s) => s.type === 'run');
  assert.ok(run, 'an evening-movement day anchors a run in its evening window');
  assert.ok(run.time >= '17:30' && run.time < '19:30', run.time);
  assert.equal(plan.days.find((x) => x.date === '2026-10-14').plannedMi, 0, 'a "too busy" day plans nothing');
  assert.ok(plan.days.find((x) => x.date === '2026-10-13').sessions.some((s) => s.time && s.time < '08:30'), 'morning movement uses the early window');
});

test('meal coach context: intake today and yesterday, recent training and what is planned next', () => {
  const d = fixture();
  d.foods = [
    { id: 'f1', date: '2026-10-13', time: '19:00', text: 'Pasta', estimate: { totals: { kcal: 600, carbs: 90, protein: 20, fat: 15 }, confidence: 'medium' } },
    { id: 'f2', date: '2026-10-14', time: '08:00', text: 'Toast', estimate: { totals: { kcal: 200, carbs: 30, protein: 6, fat: 5 }, confidence: 'medium' } },
    { id: 'f3', date: '2026-10-10', time: '08:00', text: 'Old breakfast', estimate: { totals: { kcal: 400, carbs: 50, protein: 10, fat: 10 }, confidence: 'medium' } },
  ];
  d.activities = [...d.activities, { id: 'r', date: '2026-10-13', type: 'run', distanceMi: 4.5, durationMin: 45, startTime: '18:30' }];
  const now = at('2026-10-14T12:30');
  const m = mealContext(buildCoaching(d, now), d, { mealSlot: 'lunch' });
  assert.equal(m.now.time, '12:30');
  assert.equal(m.intake.yesterday.estimatedTotals.carbsG, 90);
  assert.deepEqual(m.intake.today.entries.map((e) => e.text), ['Toast']);
  assert.ok(!JSON.stringify(m.intake).includes('Old breakfast'), 'only today and yesterday');
  assert.equal(m.training.yesterday[0].distance, 4.5);
  assert.equal(m.distanceUnit, 'miles');
  assert.ok(Array.isArray(m.training.stillPlannedToday) && Array.isArray(m.training.plannedTomorrow));
});

const planInput = (d, now, extra = {}) => ({ challenge: d.challenge, activities: d.activities, cal: d.cal, profile: d.profile, today: '2026-10-14', nowMin: 8 * 60, ...extra });

test('future days shrink to what is left once distance is logged; your own sessions keep their distance', () => {
  const d = fixture();
  d.cal = { ...d.cal, plannedSessions: [{ id: 'p', date: '2026-10-24', type: 'run', distanceMi: 6, title: 'Parkrun and back', status: 'planned' }] };
  const before = planChallenge(planInput(d));
  const big = [...d.activities, { id: 'x', date: '2026-10-14', type: 'run', distanceMi: 20, startTime: '07:00' }];
  const after = planChallenge(planInput({ ...d, activities: big }));
  const future = (p) => p.days.filter((x) => x.date > '2026-10-14').reduce((t, x) => t + x.plannedMi, 0);
  assert.ok(future(after) < future(before) - 10, `future plan drops (${future(before)} → ${future(after)})`);
  assert.ok(future(after) >= after.status.remainingMi - 0.5, 'still covers what is left');
  assert.ok(future(after) <= after.status.remainingMi * 1.03 + 0.6, 'without piling on extra');
  const own = after.days.find((x) => x.date === '2026-10-24').sessions.find((s) => s.fixed);
  assert.equal(own.distanceMi, 6);
});

test('period days get lighter sessions than the same day type without a period', () => {
  const d = fixture();
  const base = planChallenge(planInput(d));
  const wed = '2026-10-21';
  const withPeriod = planChallenge(planInput({ ...d, cal: { ...d.cal, cycle: [{ id: 'c', kind: 'expected', startDate: wed, endDate: wed }] } }));
  const runOn = (p) => p.days.find((x) => x.date === wed).sessions.find((s) => s.type === 'run' && !s.optional);
  assert.ok(runOn(base) && runOn(withPeriod), 'a run is planned either way');
  assert.ok(runOn(withPeriod).distanceMi < runOn(base).distanceMi, `${runOn(withPeriod).distanceMi} < ${runOn(base).distanceMi}`);
});

test('coach note context works week by week: last week, this week day by day, next week', () => {
  const d = fixture();
  d.activities = [...d.activities, { id: 'r1', date: '2026-10-12', type: 'run', distanceMi: 4.5, startTime: '18:30' }, { id: 'w1', date: '2026-10-08', type: 'walk', distanceMi: 3 }];
  const ctx = buildCoaching(d, at('2026-10-14T09:00'));
  const w = weekContext(ctx, d);
  assert.deepEqual(w.thisWeek.dates, ['2026-10-12', '2026-10-18']);
  assert.equal(w.thisWeek.done, 4.5, 'opening balance on 11 Oct is not part of any week');
  assert.equal(w.thisWeek.days.length, 7);
  assert.equal(w.thisWeek.days[0].weekday, 'Mon');
  assert.ok(!('planned' in w.thisWeek.days[0]) && Array.isArray(w.thisWeek.days[2].planned), 'plans shown from today on');
  assert.equal(w.thisWeek.daysLeftInclToday, 5);
  assert.ok(w.thisWeek.needed > 0 && w.thisWeek.projected >= w.thisWeek.done);
  assert.deepEqual(w.lastWeek.dates, ['2026-10-05', '2026-10-11']);
  assert.equal(w.lastWeek.done, 3);
  assert.deepEqual(w.nextWeek.dates, ['2026-10-19', '2026-10-25']);
  assert.equal(w.nextWeek.days.length, 7);
});
