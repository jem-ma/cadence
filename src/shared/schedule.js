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
  morning: {
    label: 'Morning movement', plural: 'Morning-movement days',
    short: 'Morning',
    color: 'green',
    blocks: () => [
      blk('06:30', '08:30', 'preferred', 'Morning movement', 'run'),
      blk('08:30', '18:00', 'unavailable', 'Busy day'),
      blk('18:00', '21:00', 'inconvenient', 'Evening'),
    ],
    features: { longRunPossible: false },
    prep: ['Lay out your kit the night before'],
  },
  evening: {
    label: 'Evening movement', plural: 'Evening-movement days',
    short: 'Evening',
    color: 'amber',
    blocks: () => [
      blk('06:30', '09:00', 'inconvenient', 'Early morning'),
      blk('09:00', '17:30', 'unavailable', 'Busy day'),
      blk('17:30', '19:30', 'preferred', 'Evening movement', 'run'),
      blk('19:30', '21:30', 'inconvenient', 'Late evening'),
    ],
    features: { longRunPossible: false },
    prep: ['Pack your kit and an afternoon snack'],
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
  // What a user-added day type behaves like until they edit its time blocks: a few short windows, no long runs.
  flex: {
    label: 'Flexible day', plural: 'Flexible days',
    short: 'Flexible',
    color: 'blue',
    blocks: () => [
      blk('07:00', '09:00', 'optional', 'Morning'),
      blk('12:00', '14:00', 'optional', 'Midday'),
      blk('17:30', '20:00', 'optional', 'Evening'),
    ],
    features: { longRunPossible: false },
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

/**
 * Placeholder day types a new user starts with. Each has a "base" that decides how the planner
 * treats it (which windows exist, whether there's a commute…). Users can delete these and add their own.
 */
export const PLACEHOLDER_DAY_TYPES = [
  { id: 'office', label: 'Office day', base: 'office' },
  { id: 'wfh', label: 'Work from home', base: 'wfh' },
  { id: 'morning', label: 'Morning movement', base: 'morning' },
  { id: 'evening', label: 'Evening movement', base: 'evening' },
  { id: 'weekend', label: 'Weekend', base: 'weekend' },
  { id: 'off', label: 'Too busy', base: 'off' },
];

/** What a custom (user-added) day type behaves like until its time blocks are edited. */
export const CUSTOM_BASE = 'flex';

/**
 * The full definition for a day type id: behaviour from its base, name from the user's list.
 * `src` is anything with { personal, dayTypes } (a calendar object or a profile).
 */
export function typeDefFor(type, src = {}) {
  const custom = (src.dayTypes || []).find((t) => t.id === type);
  if (custom) {
    const base = DAY_TYPES[custom.base] || DAY_TYPES[CUSTOM_BASE];
    // a short name for tight spaces such as calendar cells
    const short = custom.label.length <= 9 ? custom.label : custom.id === custom.base ? base.short : custom.label.split(' ')[0].slice(0, 9);
    return { ...base, label: custom.label, plural: custom.label, short, base: custom.base in DAY_TYPES ? custom.base : CUSTOM_BASE };
  }
  const def = DAY_TYPES[type] || DAY_TYPES.custom;
  const place = personalOf(src).runFromPlace;
  if (type === 'nans' && place && place.toLowerCase() !== 'work') {
    return { ...def, label: `Working at ${place}`, plural: `Days at ${place}`, short: place, base: type };
  }
  return { ...def, base: type };
}

/** Day-type name. kind: 'label' | 'plural' | 'short'. */
export function typeName(type, src = {}, kind = 'label') {
  return typeDefFor(type, src)[kind];
}

/** The day types a person manages: their own list, or the built-ins for accounts that predate custom types. */
export function effectiveDayTypes(src = {}) {
  if (src.dayTypes?.length) return src.dayTypes.map((t) => ({ ...t }));
  return ['office', 'nans', 'wfh', 'weekend', 'free', 'off'].map((id) => ({ id, label: typeName(id, src), base: id }));
}

/** The options a person can pick for a day: their own list, or the built-ins for older accounts. */
export function dayTypeOptions(src = {}) {
  if (src.dayTypes?.length) return src.dayTypes.map((t) => ({ value: t.id, label: t.label, base: t.base }));
  return ['office', 'nans', 'wfh', 'weekend', 'free', 'off', 'custom'].map((value) => ({ value, label: typeName(value, src), base: value }));
}

/** A weekly template from a weekday → day-type id mapping (0 = Sunday). Defaults to a generic week. */
export function defaultWeekTemplate(mapping, src = {}) {
  const t = mapping || { 1: 'wfh', 2: 'wfh', 3: 'wfh', 4: 'wfh', 5: 'wfh', 6: 'weekend', 0: 'weekend' };
  const personal = src.personal;
  const out = {};
  for (const [wd, type] of Object.entries(t)) out[wd] = { dayType: type, blocks: typeDefFor(type, src).blocks(personal), notes: '' };
  return out;
}

export function blocksForType(type, src = {}) {
  return typeDefFor(type, src).blocks(src.personal);
}

/** Resolve the effective plan for a single date. */
export function resolveDay(date, cal) {
  const template = cal.weekTemplate || defaultWeekTemplate();
  const base = template[weekday(date)] || { dayType: 'free', blocks: blocksForType('free', cal) };
  const ov = (cal.dayOverrides || []).find((o) => o.id === date || o.date === date);
  const dayType = ov?.dayType || base.dayType;
  const blocks = (ov?.blocks || base.blocks || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  const status = ov?.status || 'normal';
  const events = (cal.events || []).filter((e) => e.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const planned = (cal.plannedSessions || []).filter((p) => p.date === date && p.status !== 'cancelled');
  const typeDef = typeDefFor(dayType, cal);
  const P = personalOf(cal);
  const features = { ...typeDef.features, ...(ov?.features || {}) };
  if (features.commute) {
    features.commuteWalkMi = P.commuteWalkMi || 0;
    if (P.extraWalk.enabled && P.extraWalk.mi > 0) features.extendedWalk = { mi: Number(P.extraWalk.mi), min: Number(P.extraWalk.min) || Math.round(P.extraWalk.mi * 20), label: P.extraWalk.label };
  }
  return {
    date,
    dayType,
    base: typeDef.base,
    label: typeDef.label,
    short: typeDef.short,
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
