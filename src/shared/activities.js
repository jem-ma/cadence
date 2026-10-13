// The kinds of activity a challenge can count. Boxing is tracked by time, not distance.
export const ACTIVITY_TYPES = {
  walk: { label: 'Walking', noun: 'Walk', plural: 'Walks', distance: true },
  run: { label: 'Running', noun: 'Run', plural: 'Runs', distance: true },
  cycle: { label: 'Cycling', noun: 'Ride', plural: 'Rides', distance: true },
  box: { label: 'Boxing', noun: 'Boxing', plural: 'Boxing sessions', distance: false },
  swim: { label: 'Swimming', noun: 'Swim', plural: 'Swims', distance: true },
};

/** Display order in pickers (as listed in the setup). */
export const ACTIVITY_ORDER = ['walk', 'run', 'cycle', 'box', 'swim'];

export const isDistanceType = (t) => ACTIVITY_TYPES[t]?.distance !== false;
export const typeNoun = (t) => ACTIVITY_TYPES[t]?.noun || 'Activity';
export const typeLabel = (t) => ACTIVITY_TYPES[t]?.label || t;
export const typePlural = (t) => ACTIVITY_TYPES[t]?.plural || t;
/** Types in a challenge that add distance to the target. */
export const distanceTypes = (challenge) => (challenge?.activityTypes || ['run', 'walk']).filter(isDistanceType);
