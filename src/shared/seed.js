// Starting data. New accounts begin empty and go through first-run setup.
import { defaultWeekTemplate, DEFAULT_PERSONAL, PLACEHOLDER_DAY_TYPES } from './schedule.js';
import { DEFAULT_TRAINING } from './planner.js';

const DEFAULT_NUTRITION = { diet: '', allergies: [], dislikes: [], budget: 'moderate', maxCookMin: 30, targets: { kcal: null, protein: null, carbs: null, fat: null }, showNumbers: true };

const emptyCollections = () => ({
  challenges: [],
  activities: [],
  dayOverrides: [],
  events: [],
  cycle: [],
  plannedSessions: [],
  dayPlans: [],
  energyLogs: [],
  foods: [],
  recommendations: [],
});

/** A brand-new account: no challenge yet, a generic week, default preferences. */
export function newUserData({ name = '' } = {}) {
  const dayTypes = PLACEHOLDER_DAY_TYPES.map((t) => ({ ...t }));
  const personal = { ...DEFAULT_PERSONAL, extraWalk: { ...DEFAULT_PERSONAL.extraWalk } };
  return {
    ...emptyCollections(),
    profile: [
      {
        id: 'me',
        name,
        onboarded: false,
        units: 'mi',
        training: { ...DEFAULT_TRAINING },
        nutrition: { ...DEFAULT_NUTRITION },
        personal,
        dayTypes,
        pantry: [],
        activeChallengeId: null,
      },
    ],
    calendar: [{ id: 'weekTemplate', template: defaultWeekTemplate({ 1: 'wfh', 2: 'wfh', 3: 'wfh', 4: 'wfh', 5: 'wfh', 6: 'weekend', 0: 'weekend' }, { personal, dayTypes }) }],
  };
}

/**
 * Data from the original single-user version predates per-user settings. It belongs to the
 * person the app was first built for, so restore the details that used to be built in.
 */
export function upgradeLegacyProfile(profile) {
  if (profile.personal) return { ...profile, onboarded: profile.onboarded ?? true };
  return {
    ...profile,
    onboarded: true,
    personal: { runFromPlace: "Nan's", commuteWalkMi: 2, extraWalk: { enabled: true, mi: 3, min: 60, label: 'Walk home from two stops early' } },
  };
}

// ---------- Example data used by the test suite ----------
export const EXAMPLE_CHALLENGE_ID = 'ch-2026-10';
const EXAMPLE_PERSONAL = { runFromPlace: "Nan's", commuteWalkMi: 2, extraWalk: { enabled: true, mi: 3, min: 60, label: 'Walk home from two stops early' } };

export function seedData() {
  return {
    ...emptyCollections(),
    profile: [
      {
        id: 'me',
        name: '',
        onboarded: true,
        units: 'mi',
        training: { ...DEFAULT_TRAINING },
        nutrition: { ...DEFAULT_NUTRITION },
        personal: EXAMPLE_PERSONAL,
        pantry: ['oats', 'milk', 'bananas', 'peanut butter', 'bread', 'pasta', 'rice', 'eggs'],
        activeChallengeId: EXAMPLE_CHALLENGE_ID,
      },
    ],
    challenges: [
      {
        id: EXAMPLE_CHALLENGE_ID,
        name: 'October 100',
        targetMiles: 100,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        activityTypes: ['run', 'walk'],
        createdAt: '2026-10-12T00:00:00.000Z',
      },
    ],
    activities: [
      { id: 'baseline-run-2026-10', date: '2026-10-11', type: 'run', distanceMi: 13.7, durationMin: null, notes: 'Opening balance', source: 'baseline', isBaseline: true },
      { id: 'baseline-walk-2026-10', date: '2026-10-11', type: 'walk', distanceMi: 10, durationMin: null, notes: 'Opening balance', source: 'baseline', isBaseline: true },
    ],
    calendar: [
      {
        id: 'weekTemplate',
        template: defaultWeekTemplate({ 1: 'office', 2: 'office', 3: 'nans', 4: 'office', 5: 'wfh', 6: 'weekend', 0: 'weekend' }, { personal: EXAMPLE_PERSONAL }),
      },
    ],
  };
}
