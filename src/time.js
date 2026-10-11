// Timezone helpers. Task times are stored in UTC; the household's IANA timezone is
// used to keep recurring tasks on the same wall-clock time and to word messages.

export function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    year: +get('year'), month: +get('month'), day: +get('day'),
    hour: +get('hour'), minute: +get('minute'), second: +get('second'), weekday: get('weekday'),
  };
}

function offsetAt(ms, tz) {
  const p = localParts(new Date(ms), tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Converts a wall-clock time in `tz` to a UTC Date (handles DST changes).
export function zonedToUtc({ year, month, day, hour = 9, minute = 0 }, tz) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - offsetAt(guess, tz);
  ms = guess - offsetAt(ms, tz);
  return new Date(ms);
}

// "2026-10-11T09:30 (Sunday)" in the household's timezone, for the parsers.
export function localNow(tz, now = new Date()) {
  const p = localParts(now, tz);
  const pad = (n) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)} (${p.weekday})`;
}

// Local "YYYY-MM-DD" + "HH:MM" -> UTC ISO string.
export function localToIso(date, time, tz) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = (time || '09:00').split(':').map(Number);
  return zonedToUtc({ year, month, day, hour, minute }, tz).toISOString();
}

export const RECURRENCE_UNITS = ['day', 'week', 'month', 'year'];

// Next occurrence after `iso`, keeping the same local time of day. Month and year
// steps clamp to the end of shorter months (31 Jan + 1 month = 28/29 Feb).
export function addInterval(iso, unit, interval, tz) {
  const p = localParts(new Date(iso), tz);
  let { year, month, day } = p;
  if (unit === 'day' || unit === 'week') {
    const d = new Date(Date.UTC(year, month - 1, day + interval * (unit === 'week' ? 7 : 1)));
    [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  } else {
    const months = (month - 1) + interval * (unit === 'year' ? 12 : 1);
    year += Math.floor(months / 12);
    month = (months % 12) + 1;
    day = Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  }
  return zonedToUtc({ year, month, day, hour: p.hour, minute: p.minute }, tz).toISOString();
}

export function describeRecurrence(unit, interval) {
  if (!unit) return null;
  const named = { 'week:1': 'weekly', 'week:2': 'every 2 weeks', 'month:1': 'monthly', 'month:3': 'quarterly', 'month:6': 'every 6 months', 'year:1': 'yearly', 'day:1': 'daily' };
  return named[`${unit}:${interval}`] ?? `every ${interval} ${unit}s`;
}

// Human wording for messages sent outside the app: "Thu 15 Oct, 10:00".
// The year is added when it isn't the current one: "Sat 16 Oct 2027, 10:00".
export function formatWhen(iso, tz, now = new Date()) {
  if (!iso) return 'no date';
  const sameYear = localParts(new Date(iso), tz).year === localParts(now, tz).year;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

// Local calendar date and time of an instant: { date: 'YYYY-MM-DD', time: 'HH:MM' }.
export function localDateTime(iso, tz) {
  const p = localParts(new Date(iso), tz);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// When a prep step "N days before" a task is due: 6pm local on that day, or two hours
// before the task for same-day prep. Mirrors prepDueAt() in public/app.js.
export function prepDueIso(dueIso, daysBefore, tz) {
  if (!dueIso) return null;
  if (daysBefore <= 0) return new Date(new Date(dueIso).getTime() - 2 * 3600_000).toISOString();
  const { date } = localDateTime(dueIso, tz);
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day - daysBefore));
  return zonedToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 18, minute: 0 }, tz).toISOString();
}

// Moves a prep step along with its task. Same-day steps keep their exact lead time
// ("2 hours before"); earlier ones keep their gap in calendar days and their local
// time of day ("6pm the day before"), even across clock changes.
export function shiftStep(stepIso, oldDueIso, newDueIso, tz) {
  if (!stepIso || !oldDueIso || !newDueIso) return stepIso;
  const step = localDateTime(stepIso, tz);
  const dayMs = (d) => Date.UTC(...d.split('-').map((n, i) => (i === 1 ? n - 1 : +n)));
  const gapDays = Math.round((dayMs(localDateTime(oldDueIso, tz).date) - dayMs(step.date)) / 86400_000);
  if (gapDays <= 0) {
    return new Date(new Date(newDueIso).getTime() - (new Date(oldDueIso) - new Date(stepIso))).toISOString();
  }
  const target = new Date(dayMs(localDateTime(newDueIso, tz).date) - gapDays * 86400_000);
  const [hour, minute] = step.time.split(':').map(Number);
  return zonedToUtc({ year: target.getUTCFullYear(), month: target.getUTCMonth() + 1, day: target.getUTCDate(), hour, minute }, tz).toISOString();
}
