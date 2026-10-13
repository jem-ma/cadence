// Distance units. Everything is STORED in miles; the unit below only changes what people see and type.
// `current` is set once per render (browser) or per request (server) from the user's profile.
export const KM_PER_MILE = 1.609344;

let current = 'mi';

export function setUnit(u) {
  current = u === 'km' ? 'km' : 'mi';
}
export const getUnit = () => current;

export const toUnit = (mi, u = current) => (u === 'km' ? Number(mi) * KM_PER_MILE : Number(mi));
export const fromUnit = (v, u = current) => (u === 'km' ? Number(v) / KM_PER_MILE : Number(v));

/** "12.3" — one decimal, trailing ".0" dropped (4 → "4", 4.25 → "4.3"). */
export function dist(mi, digits = 1) {
  if (mi == null || mi === '' || isNaN(Number(mi))) return '–';
  const s = toUnit(mi).toFixed(digits);
  return digits ? s.replace(/\.0+$/, '') : s;
}
/** "12.0" — always one decimal; for statistic tiles that should line up. */
export const distFixed = (mi) => (mi == null || isNaN(Number(mi)) ? '–' : toUnit(mi).toFixed(1));
/** "12.3 km" / "7.6 mi" */
export const fmtDist = (mi) => `${dist(mi)} ${current}`;
/** "mi" | "km" */
export const unitShort = () => current;
/** "miles" | "km" — for sentences */
export const unitWord = () => (current === 'km' ? 'km' : 'miles');
/** "12.3 miles" / "19.8 km" — for sentences */
export const wordDist = (mi) => `${dist(mi)} ${unitWord()}`;
/** "3-mile" / "5-km" — for phrases like "a 3-mile run" */
export const adjDist = (mi) => `${dist(mi)}-${current === 'km' ? 'km' : 'mile'}`;
/** Round a display-unit value typed by the user back to miles (4 dp keeps km round-trips exact). */
export const toMiles = (v, u = current) => Math.round(fromUnit(v, u) * 10000) / 10000;
/** Pace given in minutes per mile → minutes per displayed unit, formatted m:ss. */
export function paceLabel(minPerMile) {
  const per = current === 'km' ? minPerMile / KM_PER_MILE : minPerMile;
  const m = Math.floor(per);
  const s = Math.round((per - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}/${current}`;
}
