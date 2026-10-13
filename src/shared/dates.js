// Date helpers that work on local calendar dates ("YYYY-MM-DD") to avoid UTC drift.

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midday avoids DST edge cases
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a, b) {
  // whole days from a to b (b - a)
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

export function dateRange(start, end) {
  const out = [];
  if (!start || !end || start > end) return out;
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function weekday(iso) {
  return parseDate(iso).getDay();
}

export function weekdayName(iso) {
  return DAY_NAMES[weekday(iso)];
}

export function startOfWeek(iso) {
  // Monday-based weeks
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function startOfMonth(iso) {
  return iso.slice(0, 8) + '01';
}

export function endOfMonth(iso) {
  const d = parseDate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function formatDate(iso, opts = {}) {
  const d = parseDate(iso);
  const { weekday: wd = true, year = false, short = false } = opts;
  const day = wd ? (short ? DAY_SHORT[d.getDay()] : DAY_NAMES[d.getDay()]) + ' ' : '';
  const month = short ? MONTHS[d.getMonth()].slice(0, 3) : MONTHS[d.getMonth()];
  return `${day}${d.getDate()} ${month}${year ? ' ' + d.getFullYear() : ''}`;
}

export function relativeDay(iso, today) {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return weekdayName(iso);
  return formatDate(iso, { short: true });
}

export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(min) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function formatDuration(min) {
  if (min == null || isNaN(min)) return '';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
