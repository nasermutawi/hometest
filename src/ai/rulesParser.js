// Offline fallback parser used when no ANTHROPIC_API_KEY is configured (and in tests).
// It understands common date/time phrases, member names and a handful of task types,
// so the app is fully usable without an API key; Claude does the real language work.
import { CATEGORIES } from './schema.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const CATEGORY_KEYWORDS = {
  contractor: ['plumber', 'electrician', 'contractor', 'builder', 'roofer', 'handyman', 'technician', 'engineer', 'quote', 'painter', 'decorator', 'carpenter'],
  vehicle: ['car', 'mot', 'tyre', 'tire', 'oil change', 'vehicle'],
  maintenance: ['boiler', 'service', 'servicing', 'repair', 'fix', 'leak', 'filter', 'smoke alarm', 'gutter', 'hvac', 'aircon', 'air con'],
  shopping: ['grocer', 'shopping', 'buy', 'supermarket', 'milk', 'pick up', 'order'],
  cleaning: ['clean', 'laundry', 'hoover', 'vacuum', 'tidy', 'bins', 'dishes'],
  finance: ['bill', 'pay', 'tax', 'insurance', 'bank', 'invoice', 'mortgage', 'rent'],
  admin: ['renew', 'passport', 'license', 'licence', 'form', 'appointment', 'book', 'register', 'council'],
  health: ['doctor', 'dentist', 'gp', 'prescription', 'pharmacy', 'vaccin', 'hospital'],
  kids: ['school', 'kids', 'nursery', 'daycare', 'homework', 'babysit'],
  pets: ['vet', 'dog', 'cat', 'pet', 'flea', 'worming'],
  garden: ['garden', 'lawn', 'mow', 'hedge', 'weeds', 'plants'],
};

// Prep steps come only from what was said: no built-in steps are added for a kind of task.
const EXPLICIT_PREP = /\b(?:before (?:that|then|this|they come|they arrive|it)|beforehand|first|in advance|ahead of time)\b/i;
const PREP_LEAD = /\b(?:need to|have to|must|should|make sure (?:to|we|i)?|remember to|don't forget to|dont forget to)\s+/i;

function pad(n) { return String(n).padStart(2, '0'); }

export function parseNow(now) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(now);
  if (!m) throw new Error('now must be a local ISO date-time');
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function fmt(d) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

export function findDate(text, today) {
  const t = text.toLowerCase();
  let m;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t))) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/\bday after tomorrow\b/.test(t)) return fmt(addDays(today, 2));
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return fmt(today);
  if (/\btomorrow\b/.test(t)) return fmt(addDays(today, 1));
  if ((m = /\bin (\d+|a|one|two|three) (day|week)s?\b/.exec(t))) {
    const words = { a: 1, one: 1, two: 2, three: 3 };
    const n = m[1] in words ? words[m[1]] : +m[1];
    return fmt(addDays(today, m[2] === 'week' ? n * 7 : n));
  }
  if (/\bnext week\b/.test(t)) return fmt(addDays(today, 7));
  if (/\bthis weekend\b|\bat the weekend\b|\bon the weekend\b/.test(t)) {
    return fmt(addDays(today, (6 - today.getUTCDay() + 7) % 7));
  }
  const monthRe = MONTHS.join('|');
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${monthRe})[a-z]*\\b`).exec(t))
    || (m = new RegExp(`\\b(${monthRe})[a-z]* (\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(t))) {
    const [day, mon] = /\d/.test(m[1]) ? [+m[1], m[2]] : [+m[2], m[1]];
    const month = MONTHS.indexOf(mon.slice(0, 3));
    let d = new Date(Date.UTC(today.getUTCFullYear(), month, day));
    if (d < today) d = new Date(Date.UTC(today.getUTCFullYear() + 1, month, day));
    return fmt(d);
  }
  for (let i = 0; i < 7; i++) {
    const re = new RegExp(`\\b(next |this |on )?${WEEKDAYS[i]}s?\\b`);
    if ((m = re.exec(t))) {
      // The next occurrence of that weekday, never today ("Saturday" said on a Saturday means next week).
      const delta = (i - today.getUTCDay() + 7) % 7 || 7;
      return fmt(addDays(today, delta));
    }
  }
  return null;
}

export function findTime(text) {
  const t = text.toLowerCase();
  let m;
  if ((m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(t))) {
    let h = +m[1] % 12;
    if (m[3] === 'pm') h += 12;
    return `${pad(h)}:${m[2] !== undefined ? m[2] : '00'}`;
  }
  if ((m = /\bat (\d{1,2}):(\d{2})\b/.exec(t))) return `${pad(+m[1])}:${m[2]}`;
  if (/\bnoon|midday|lunchtime\b/.test(t)) return '12:00';
  if (/\bmorning\b/.test(t)) return '09:00';
  if (/\bafternoon\b/.test(t)) return '14:00';
  if (/\bevening|tonight\b/.test(t)) return '19:00';
  return null;
}

const RECURRENCE_PATTERNS = [
  [/\b(?:every (?:other|2|two) weeks?|fortnightly|biweekly)\b/, 'week', 2],
  [/\b(?:quarterly|every (?:3|three) months|every quarter|each quarter)\b/, 'month', 3],
  [/\b(?:every (?:6|six) months|twice a year|half[- ]yearly|biannual(?:ly)?)\b/, 'month', 6],
  [/\b(?:every (?:day|morning|evening|night)|daily)\b/, 'day', 1],
  [/\b(?:every (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?|weekly|each week)\b/, 'week', 1],
  [/\b(?:every month|monthly|each month)\b/, 'month', 1],
  [/\b(?:every year|yearly|annual(?:ly)?|each year|once a year)\b/, 'year', 1],
];

export function findRecurrence(text) {
  const t = text.toLowerCase();
  let m;
  if ((m = /\bevery (\d+) (day|week|month|year)s\b/.exec(t))) return { unit: m[2], interval: Number(m[1]) };
  for (const [re, unit, interval] of RECURRENCE_PATTERNS) if (re.test(t)) return { unit, interval };
  return null;
}

function findOwner(text, members, speaker) {
  const lower = text.toLowerCase();
  const mentioned = members
    .map((m) => ({ name: m.name, idx: lower.search(new RegExp(`\\b${escapeRe(m.name.toLowerCase())}\\b`)) }))
    .filter((m) => m.idx >= 0)
    .sort((a, b) => a.idx - b.idx);
  if (mentioned.length) return mentioned[0].name;
  if (/\b(i|i'll|i will|i need|me|my|myself)\b/i.test(text)) return speaker;
  return null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function findCategory(text) {
  const t = text.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return 'other';
}

function sentenceCase(s) {
  const trimmed = s.trim().replace(/\s+/g, ' ').replace(/[.,;:!]+$/, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function splitClauses(text) {
  return text.split(/(?<=[.!?;])\s+|\s*,\s*(?:and\s+)?|\s+(?:and|but) (?=(?:we|i) (?:need|have|must|should)|before|make sure|remember|don't forget)/i)
    .map((c) => c.trim()).filter(Boolean);
}

function explicitPrep(clauses) {
  const steps = [];
  for (const clause of clauses.slice(1)) {
    const isPrep = EXPLICIT_PREP.test(clause) || /^(make sure|remember|don't forget|dont forget)/i.test(clause)
      || /^before\b/i.test(clause);
    if (!isPrep) continue;
    let title = clause
      .replace(/^before (?:that|then|this|they come|they arrive|it)\s*,?\s*/i, '')
      .replace(/\b(?:before (?:that|then|this|they come|they arrive|it)|beforehand|first|in advance|ahead of time)\b/gi, '');
    const lead = PREP_LEAD.exec(title);
    if (lead) title = title.slice(lead.index + lead[0].length);
    title = title.replace(/^(?:we|i|you)\s+/i, '');
    if (title.trim().length > 2) steps.push({ title: sentenceCase(title), days_before: /day before|the night before/i.test(clause) ? 1 : 0 });
  }
  return steps;
}

function cleanTitle(clause, members) {
  let t = clause
    .replace(/\b(?:every (?:other |\d+ |two |three |six )?(?:day|week|month|year|quarter|morning|evening|night|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?|fortnightly|biweekly|quarterly|weekly|monthly|yearly|annually|daily|twice a year|once a year|half[- ]yearly)\b/gi, '')
    .replace(/\b(?:starting|beginning|from)\b(?= *(?:on |the |next |this )?(?:\d|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi, '')
    .replace(/\b(?:on |this |next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi, '')
    .replace(/\b(?:day after tomorrow|tomorrow|today|tonight|next week|this weekend|at the weekend|in \d+ (?:days?|weeks?))\b/gi, '')
    .replace(/\b(?:at|by|around)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\bat \d{1,2}:\d{2}\b/gi, '')
    .replace(/\b(?:in the |this |on )?(?:morning|afternoon|evening)\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(new RegExp(`\\b(?:on )?(?:the )?\\d{1,2}(?:st|nd|rd|th)? (?:of )?(?:${MONTHS.join('|')})[a-z]*\\b`, 'gi'), '');
  for (const m of members) {
    t = t.replace(new RegExp(`\\b(?:for |by )?${escapeRe(m.name)}(?:'s)?\\b\\s*(?:needs to|has to|should|must|will|to)?`, 'gi'), '');
  }
  t = t.replace(/^\s*(?:(?:can|could) (?:you|we|someone)|please|remind (?:me|us) to|we need to|i need to|need to|we have to|i have to|i'll|i will|we should|i should|let's)\s+/i, '');
  t = t.replace(/^\s*(?:(?:can|could) (?:you|we|someone)|please|remind (?:me|us) to|we need to|i need to|need to)\s+/i, '');
  return sentenceCase(t).slice(0, 80) || 'New task';
}

export function parseWithRules({ text, now, members, speaker, history = [] }) {
  const today = parseNow(now);
  const answers = history.map((h) => h.answer).join('. ');
  const full = answers ? `${text}. ${answers}` : text;
  const clauses = splitClauses(text);

  const due_date = findDate(full, today);
  const due_time = findTime(full);
  const owner = findOwner(full, members, speaker);
  const recurrence = findRecurrence(full);
  const category = findCategory(text);

  const prep = explicitPrep(clauses);

  const questions = [];
  if (!due_date) questions.push('When does this need to happen?');
  if (!owner && members.length > 1) questions.push(`Who should own this: ${members.map((m) => m.name).join(' or ')}?`);

  const sameDayErrand = ['shopping', 'cleaning'].includes(category);
  return {
    title: cleanTitle(clauses.length ? clauses[0] : text, members),
    notes: '',
    category: CATEGORIES.includes(category) ? category : 'other',
    due_date,
    due_time,
    owner,
    prep_steps: prep.slice(0, 4),
    recurrence,
    reminder_offsets_minutes: sameDayErrand ? [60] : [1440, 60],
    questions,
  };
}
