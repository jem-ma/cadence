// Calendar model: weekly template + per-date overrides + one-off events + cycle entries.
import { timeToMin, minToTime, weekday, addDays } from './dates.js';

export const BLOCK_KINDS = {
  unavailable: { label: 'Unavailable', help: 'Genuinely not possible' },
  inconvenient: { label: 'Free but inconvenient', help: 'Technically free, not a good time' },
  preferred: { label: 'Preferred exercise window', help: 'Best time to train' },
  optional: { label: 'Optional opportunity', help: 'Could work if it suits you' },
};

export const DAY_STATUSES = {
  normal: 'Normal',
  busy: 'Busy — short sessions only',
  unavailable: 'No exercise possible',
  rest: 'Planned rest day',
};

let _id = 0;
const bid = () => `b${Date.now().toString(36)}${(_id++).toString(36)}`;
const blk = (start, end, kind, label, activity) => ({ id: bid(), start, end, kind, label, ...(activity ? { activity } : {}) });

/**
 * Per-user details that personalise the generic day types.
 * - runFromPlace: where "run-from" days are spent (e.g. "work", "Nan's").
 * - commuteWalkMi: walking done as part of an office-day commute (0 = none).
 * - extraWalk: an optional longer walk on office days (e.g. getting off the train early).
 */
export const DEFAULT_PERSONAL = {
  runFromPlace: 'work',
  commuteWalkMi: 0,
  extraWalk: { enabled: false, mi: 2, min: 40, label: 'Longer walk home' },
};

export function personalOf(src = {}) {
  const p = src.personal || {};
  return { ...DEFAULT_PERSONAL, ...p, extraWalk: { ...DEFAULT_PERSONAL.extraWalk, ...(p.extraWalk || {}) } };
}

/** Day-type names, with the run-from place filled in. kind: 'label' | 'plural' | 'short'. */
export function typeName(type, personal, kind = 'label') {
  const def = DAY_TYPES[type] || DAY_TYPES.custom;
  const place = personalOf({ personal }).runFromPlace;
  if (type === 'nans' && place && place.toLowerCase() !== 'work') {
    return { label: `Working at ${place}`, plural: `Days at ${place}`, short: place }[kind];
  }
  return def[kind];
}

export const DAY_TYPES = {
  office: {
    label: 'Office day', plural: 'Office days',
    short: 'Office',
    color: 'slate',
    blocks: () => [
      blk('08:00', '18:30', 'unavailable', 'Office day, including commute'),
      blk('18:30', '22:00', 'inconvenient', 'Evening after commuting'),
    ],
    features: { commute: true },
    prep: ['Pack lunch and an afternoon snack'],
  },
  // Key kept as "nans" for compatibility with existing data; this is the generic "run from work" day.
  nans: {
    label: 'Run-from-work day', plural: 'Run-from-work days',
    short: 'Run-from',
    color: 'amber',
    blocks: (P) => [
      blk('09:00', '17:30', 'unavailable', 'Working'),
      blk('17:30', '19:00', 'preferred', `Run straight from ${personalOf({ personal: P }).runFromPlace}`, 'run'),
      blk('19:00', '22:00', 'inconvenient', 'Late evening'),
    ],
    features: { runFromWork: true },
    prep: ['Pack running kit and shoes', 'Pack an afternoon snack', 'Bring water and something for after the run'],
  },
  wfh: {
    label: 'Working from home', plural: 'Work-from-home days',
    short: 'Home',
    color: 'green',
    blocks: () => [
      blk('07:15', '08:45', 'optional', 'Before work'),
      blk('09:00', '12:30', 'unavailable', 'Work'),
      blk('12:30', '13:30', 'preferred', 'Lunchtime 5K', 'run'),
      blk('13:30', '18:00', 'unavailable', 'Work'),
      blk('18:00', '20:00', 'optional', 'After work'),
    ],
    features: { lunchRun: true },
    prep: [],
  },
  weekend: {
    label: 'Weekend', plural: 'Weekends',
    short: 'Weekend',
    color: 'blue',
    blocks: () => [
      blk('08:30', '12:00', 'optional', 'Morning — longer run window', 'long'),
      blk('14:00', '17:00', 'optional', 'Afternoon'),
    ],
    features: { longRunPossible: true },
    prep: [],
  },
  free: {
    label: 'Free day', plural: 'Free days',
    short: 'Free',
    color: 'blue',
    blocks: () => [blk('08:00', '12:00', 'optional', 'Morning'), blk('14:00', '18:00', 'optional', 'Afternoon')],
    features: {},
    prep: [],
  },
  off: { label: 'No exercise day', plural: 'No-exercise days', short: 'Off', color: 'grey', blocks: () => [], features: {}, prep: [] },
  custom: { label: 'Custom', plural: 'Custom days', short: 'Custom', color: 'grey', blocks: () => [], features: {}, prep: [] },
};

/** A weekly template from a weekday → day-type mapping (0 = Sunday). Defaults to a generic week. */
export function defaultWeekTemplate(mapping, personal) {
  const t = mapping || { 1: 'wfh', 2: 'wfh', 3: 'wfh', 4: 'wfh', 5: 'wfh', 6: 'weekend', 0: 'weekend' };
  const out = {};
  for (const [wd, type] of Object.entries(t)) out[wd] = { dayType: type, blocks: DAY_TYPES[type].blocks(personal), notes: '' };
  return out;
}

export function blocksForType(type, personal) {
  return (DAY_TYPES[type] || DAY_TYPES.custom).blocks(personal);
}

/** Resolve the effective plan for a single date. */
export function resolveDay(date, cal) {
  const template = cal.weekTemplate || defaultWeekTemplate();
  const base = template[weekday(date)] || { dayType: 'free', blocks: blocksForType('free') };
  const ov = (cal.dayOverrides || []).find((o) => o.id === date || o.date === date);
  const dayType = ov?.dayType || base.dayType;
  const blocks = (ov?.blocks || base.blocks || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  const status = ov?.status || 'normal';
  const events = (cal.events || []).filter((e) => e.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const planned = (cal.plannedSessions || []).filter((p) => p.date === date && p.status !== 'cancelled');
  const typeDef = DAY_TYPES[dayType] || DAY_TYPES.custom;
  const P = personalOf(cal);
  const features = { ...typeDef.features, ...(ov?.features || {}) };
  if (features.commute) {
    features.commuteWalkMi = P.commuteWalkMi || 0;
    if (P.extraWalk.enabled && P.extraWalk.mi > 0) features.extendedWalk = { mi: Number(P.extraWalk.mi), min: Number(P.extraWalk.min) || Math.round(P.extraWalk.mi * 20), label: P.extraWalk.label };
  }
  return {
    date,
    dayType,
    label: typeName(dayType, P, 'label'),
    short: typeName(dayType, P, 'short'),
    blocks,
    status,
    notes: [base.notes, ov?.notes].filter(Boolean).join(' · '),
    events,
    planned,
    isOverride: !!ov,
    planLocked: (cal.dayPlans || []).some((p) => p.id === date && p.locked),
    features,
    prep: [...(typeDef.prep || []), ...(features.commuteWalkMi ? ['Wear walking-friendly shoes'] : [])],
    leaveAt: blocks.find((b) => b.kind === 'unavailable')?.start || null,
    workEndsAt: [...blocks].reverse().find((b) => b.kind === 'unavailable')?.end || null,
    period: periodState(date, cal.cycle || []),
  };
}

export function periodState(date, cycle) {
  let expected = false;
  let actual = false;
  let entry = null;
  for (const c of cycle) {
    const end = c.endDate || addDays(c.startDate, 4);
    if (date >= c.startDate && date <= end) {
      if (c.kind === 'actual') actual = true;
      else expected = true;
      entry = c;
    }
  }
  const upcoming = cycle
    .filter((c) => c.startDate > date)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  return { expected, actual, active: expected || actual, entry, nextStart: upcoming?.startDate || null };
}

// interval helpers (minutes)
function subtract(intervals, cut) {
  const out = [];
  for (const [s, e] of intervals) {
    if (cut[1] <= s || cut[0] >= e) out.push([s, e]);
    else {
      if (cut[0] > s) out.push([s, cut[0]]);
      if (cut[1] < e) out.push([cut[1], e]);
    }
  }
  return out;
}

/**
 * Exercise windows for a resolved day after removing one-off commitments.
 * Only preferred/optional blocks count. Inconvenient blocks are returned separately.
 */
export function exerciseWindows(day, { fromMinute = 0 } = {}) {
  if (day.status === 'unavailable' || day.status === 'rest') return { windows: [], inconvenient: [] };
  const cuts = day.events
    .filter((e) => e.blocksExercise !== false && e.start && e.end)
    .map((e) => [timeToMin(e.start) - (Number(e.travelMin) || 0), timeToMin(e.end) + (Number(e.travelMin) || 0)]);
  const allDay = day.events.some((e) => e.blocksExercise !== false && (!e.start || !e.end));
  if (allDay) return { windows: [], inconvenient: [] };
  const build = (kinds) =>
    day.blocks
      .filter((b) => kinds.includes(b.kind))
      .flatMap((b) => {
        let parts = [[Math.max(timeToMin(b.start), fromMinute), timeToMin(b.end)]].filter(([s, e]) => e > s);
        for (const c of cuts) parts = subtract(parts, c);
        return parts
          .filter(([s, e]) => e - s >= 20)
          .map(([s, e]) => ({ start: minToTime(s), end: minToTime(e), minutes: e - s, kind: b.kind, label: b.label, activity: b.activity }));
      });
  const windows = build(['preferred', 'optional']).sort((a, b) => (a.kind === b.kind ? b.minutes - a.minutes : a.kind === 'preferred' ? -1 : 1));
  return { windows, inconvenient: build(['inconvenient']) };
}

export function dayTypeOptions(personal) {
  return Object.keys(DAY_TYPES).map((value) => ({ value, label: typeName(value, personal) }));
}
