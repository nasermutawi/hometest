/**
 * Household — Google Sheets edition.
 *
 * The spreadsheet this script is attached to is the database:
 *   Tasks     one row per task (edit it directly if you like)
 *   Members   who's in the household and how each person wants to be reminded
 *   Settings  household-wide preferences
 *   Activity  a log of every change; used to email the other person
 *
 * The script also serves:
 *   - a phone-friendly web app (doGet) for adding and managing tasks
 *   - an MCP endpoint (doPost) so Claude can read and change tasks for you
 *   - a timer (runScheduledJobs) that emails reminders and syncs Google Calendar
 *
 * Functions ending in "_" are private: the web page can't call them.
 */

// ---------------------------------------------------------------- Layout

const TASKS = 'Tasks';
const MEMBERS = 'Members';
const SETTINGS = 'Settings';
const ACTIVITY = 'Activity';

const TASK_COLUMNS = ['ID', 'Done', 'Task', 'Due date', 'Time', 'Owner', 'Repeats', 'Prep steps', 'Notes',
  'Category', 'Reminders', 'Created by', 'Created', 'Updated', 'Completed', 'Calendar event', 'Next ID'];
const MEMBER_COLUMNS = ['Name', 'Email', 'Email reminders', 'Email updates', 'Morning summary', 'Calendar invites'];
const ACTIVITY_COLUMNS = ['When', 'Who', 'What', 'Task ID', 'Task', 'Owner', 'Due', 'Details', 'Emailed'];

const REPEATS = {
  Never: null,
  Daily: { unit: 'day', interval: 1 },
  Weekly: { unit: 'week', interval: 1 },
  'Every 2 weeks': { unit: 'week', interval: 2 },
  Monthly: { unit: 'month', interval: 1 },
  Quarterly: { unit: 'month', interval: 3 },
  'Every 6 months': { unit: 'month', interval: 6 },
  Yearly: { unit: 'year', interval: 1 },
};

const DEFAULT_SETTINGS = [
  ['Household name', 'Our household', 'Shown at the top of the app and in emails.'],
  ['Default reminders', '1 day, 1 hour', 'Used for new tasks. Options: 1 week, 2 days, 1 day, 2 hours, 1 hour, 30 minutes, at the time.'],
  ['Morning summary time', '07:00', "When the daily summary email goes out (24-hour clock) to people who've turned it on."],
  ['Calendar sync', 'Yes', 'Yes = put tasks with a date in Google Calendar, with alerts, for members who turned on Calendar invites.'],
  ['App link', '', 'Filled in automatically the first time someone opens the app.'],
];

const OWNER_ANYONE = 'Anyone';
const NO_TIME_DEFAULT = '09:00';

// ---------------------------------------------------------------- Setup

/** Run this once from the Apps Script editor. Safe to run again. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tasks = ensureSheet_(ss, TASKS, TASK_COLUMNS);
  const members = ensureSheet_(ss, MEMBERS, MEMBER_COLUMNS);
  const settings = ensureSheet_(ss, SETTINGS, ['Setting', 'Value', 'What it does']);
  const activity = ensureSheet_(ss, ACTIVITY, ACTIVITY_COLUMNS);

  // Settings rows (keep existing values).
  const existing = settings.getLastRow() > 1 ? settings.getRange(2, 1, settings.getLastRow() - 1, 2).getValues() : [];
  const have = new Set(existing.map((r) => String(r[0])));
  DEFAULT_SETTINGS.forEach((row) => { if (!have.has(row[0])) settings.appendRow(row); });
  removeSetting_('Assistant key'); // the old Claude connector key; no longer used
  settings.setColumnWidth(1, 190).setColumnWidth(2, 220).setColumnWidth(3, 520);

  // The person running setup becomes the first member.
  const email = Session.getEffectiveUser().getEmail();
  if (email && !findMember_(email)) {
    const name = email.split('@')[0].replace(/[._\d]+/g, ' ').trim().split(' ')[0] || 'Me';
    members.appendRow([name.charAt(0).toUpperCase() + name.slice(1), email, 'Yes', 'Yes', 'No', 'Yes']);
  }

  formatTasks_(tasks);
  members.getRange('C2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Yes', 'No'], true).build());
  members.setColumnWidth(2, 240);
  activity.setColumnWidth(1, 150).setColumnWidth(5, 220).setColumnWidth(8, 260);
  activity.getRange('A2:A').setNumberFormat('ddd d mmm yyyy, hh:mm');
  refreshOwnerChoices_();

  // Timers: reminders/emails every 5 minutes; log edits made directly in the sheet.
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (['runScheduledJobs', 'onSheetEdit'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runScheduledJobs').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  PropertiesService.getScriptProperties().setProperty('lastRun', new Date().toISOString());

  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
  ss.setActiveSheet(tasks);
  return 'Setup complete';
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  else {
    // Add any columns introduced by newer versions of this script.
    const current = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
    headers.filter((h) => !current.includes(h)).forEach((h, i) => sh.getRange(1, current.length + 1 + i).setValue(h));
  }
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#e3efea');
  return sh;
}

function formatTasks_(sh) {
  const col = (name) => TASK_COLUMNS.indexOf(name) + 1;
  const all = (name) => sh.getRange(2, col(name), sh.getMaxRows() - 1, 1);
  // Checkbox validation (not insertCheckboxes, which fills every row with FALSE).
  all('Done').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  all('Due date').setNumberFormat('ddd d mmm yyyy');
  all('Time').setNumberFormat('@');
  all('Repeats').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(REPEATS), true).build());
  all('Category').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CATEGORIES, true).build());
  ['Created', 'Updated', 'Completed'].forEach((c) => all(c).setNumberFormat('d mmm yyyy, hh:mm'));
  all('Prep steps').setWrap(true);
  all('Notes').setWrap(true);
  sh.setColumnWidth(col('ID'), 45).setColumnWidth(col('Done'), 50).setColumnWidth(col('Task'), 240)
    .setColumnWidth(col('Prep steps'), 300).setColumnWidth(col('Notes'), 220);
  sh.hideColumns(col('Calendar event'), 2);

  // Overdue in red, done greyed out.
  const range = sh.getRange(2, 1, sh.getMaxRows() - 1, TASK_COLUMNS.length);
  const d = columnLetter_(col('Done'));
  const due = columnLetter_(col('Due date'));
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=$${d}2=TRUE`)
      .setFontColor('#9aa49f').setStrikethrough(true).setRanges([range]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(`=AND($${d}2=FALSE,$${due}2<>"",$${due}2<TODAY())`)
      .setFontColor('#b23b2e').setRanges([range]).build(),
  ]);
}

function columnLetter_(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Keeps the Owner dropdown in the Tasks tab in line with the Members tab. */
function refreshOwnerChoices_() {
  const names = members_().map((m) => m.name).concat(OWNER_ANYONE);
  const sh = sheet_(TASKS);
  sh.getRange(2, TASK_COLUMNS.indexOf('Owner') + 1, sh.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(names, true).build());
}

// ---------------------------------------------------------------- Sheet access

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error(`The "${name}" tab is missing. Open Extensions > Apps Script and run setup.`);
  return sh;
}

function tz_() { return ss_().getSpreadsheetTimeZone(); }
function fmt_(date, pattern) { return Utilities.formatDate(date, tz_(), pattern); }
function parseLocal_(text, pattern) { return Utilities.parseDate(text, tz_(), pattern); }

function table_(name) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const values = lastRow > 0 ? sh.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
  const headers = values[0].map(String);
  const rows = values.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { o[h] = r[j]; });
    return o;
  });
  return { sh, headers, rows };
}

function writeRow_(table, row, obj) {
  const values = table.headers.map((h) => (h in obj ? obj[h] : ''));
  table.sh.getRange(row, 1, 1, values.length).setValues([values]);
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- Settings & members

function getSetting_(key) {
  const sh = ss_().getSheetByName(SETTINGS);
  if (!sh || sh.getLastRow() < 2) return '';
  const row = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().find((r) => String(r[0]) === key);
  return row ? String(row[1]).trim() : '';
}

function removeSetting_(key) {
  const sh = sheet_(SETTINGS);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  const i = rows.findIndex((r) => String(r[0]) === key);
  if (i >= 0) sh.deleteRow(i + 2);
}

function setSetting_(key, value) {
  const sh = sheet_(SETTINGS);
  const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
  const i = rows.findIndex((r) => String(r[0]) === key);
  if (i >= 0) sh.getRange(i + 2, 2).setValue(value);
  else sh.appendRow([key, value, '']);
}

const yes_ = (v) => /^(yes|y|true|1)$/i.test(String(v).trim());

function members_() {
  return table_(MEMBERS).rows.filter((r) => String(r.Name).trim()).map((r) => ({
    row: r._row,
    name: String(r.Name).trim(),
    email: String(r.Email).trim().toLowerCase(),
    emailReminders: yes_(r['Email reminders']),
    emailUpdates: yes_(r['Email updates']),
    morningSummary: yes_(r['Morning summary']),
    calendarInvites: yes_(r['Calendar invites']),
  }));
}

function findMember_(email) {
  if (!email) return null;
  return members_().find((m) => m.email === String(email).toLowerCase()) || null;
}

function memberByName_(name) {
  if (!name) return null;
  return members_().find((m) => m.name.toLowerCase() === String(name).trim().toLowerCase()) || null;
}

/** The person using the web app, or null if they aren't in the Members tab yet. */
function currentMember_() {
  return findMember_(Session.getActiveUser().getEmail());
}

function requireMember_() {
  const me = currentMember_();
  if (!me) throw new Error('You are not in the Members tab yet. Reload the app to join.');
  return me;
}

// ---------------------------------------------------------------- Value conversion

function dateStr_(v) {
  if (v instanceof Date && !isNaN(v)) return fmt_(v, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function timeStr_(v) {
  if (v instanceof Date && !isNaN(v)) return fmt_(v, 'HH:mm');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(v || '').trim());
  if (!m) return '';
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return h > 23 ? '' : `${String(h).padStart(2, '0')}:${m[2] || '00'}`;
}

const iso_ = (v) => (v instanceof Date && !isNaN(v) ? v.toISOString() : '');

const REMINDER_WORDS = [[10080, '1 week'], [2880, '2 days'], [1440, '1 day'], [120, '2 hours'], [60, '1 hour'], [30, '30 minutes'], [0, 'at the time']];

function parseReminders_(text) {
  const out = [];
  String(text || '').toLowerCase().split(/[,;\n]+/).forEach((part) => {
    const p = part.trim();
    if (!p) return;
    if (/at (the )?time|on time/.test(p)) { out.push(0); return; }
    const m = /(\d+)\s*(week|day|hour|hr|minute|min)/.exec(p);
    if (m) out.push(Number(m[1]) * { week: 10080, day: 1440, hour: 60, hr: 60, minute: 1, min: 1 }[m[2]]);
  });
  return [...new Set(out)].sort((a, b) => b - a);
}

function formatReminders_(minutes) {
  return (minutes || []).map((m) => {
    const known = REMINDER_WORDS.find(([v]) => v === m);
    if (known) return known[1];
    if (m % 1440 === 0) return `${m / 1440} days`;
    if (m % 60 === 0) return `${m / 60} hours`;
    return `${m} minutes`;
  }).join(', ');
}

// Prep steps live in one cell, one per line: "☐ Clear the cupboard (1 day before)".
function parsePrep_(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const done = /^(☑|✅|\[x\])/i.test(line);
    let title = line.replace(/^(☐|☑|✅|\[ ?\]|\[x\]|-|•)\s*/i, '');
    let daysBefore = 0;
    const m = /\s*\((?:(\d+) days? before|same day)\)\s*$/i.exec(title);
    if (m) {
      daysBefore = m[1] ? Number(m[1]) : 0;
      title = title.slice(0, m.index);
    }
    return { title: title.trim(), daysBefore, done };
  }).filter((s) => s.title);
}

function formatPrep_(steps) {
  return (steps || []).map((s) => {
    const when = s.daysBefore > 0 ? `${s.daysBefore} day${s.daysBefore === 1 ? '' : 's'} before` : 'same day';
    return `${s.done ? '☑' : '☐'} ${s.title} (${when})`;
  }).join('\n');
}

function toTask_(r) {
  const owner = String(r.Owner || '').trim();
  return {
    row: r._row,
    id: Number(r.ID) || null,
    done: r.Done === true || String(r.Done).toUpperCase() === 'TRUE',
    title: String(r.Task || '').trim(),
    dueDate: dateStr_(r['Due date']),
    time: timeStr_(r.Time),
    owner: owner && owner !== OWNER_ANYONE ? owner : '',
    repeats: REPEATS[String(r.Repeats || '').trim()] !== undefined ? String(r.Repeats).trim() : 'Never',
    prep: parsePrep_(r['Prep steps']),
    notes: String(r.Notes || ''),
    category: CATEGORIES.includes(String(r.Category)) ? String(r.Category) : 'other',
    reminders: r.Reminders === '' || r.Reminders == null ? parseReminders_(getSetting_('Default reminders')) : parseReminders_(r.Reminders),
    createdBy: String(r['Created by'] || ''),
    created: r.Created,
    updated: r.Updated,
    completed: r.Completed,
    calendarEvent: String(r['Calendar event'] || ''),
    nextId: Number(r['Next ID']) || null,
  };
}

function fromTask_(t) {
  return {
    ID: t.id,
    Done: Boolean(t.done),
    Task: t.title,
    'Due date': t.dueDate ? parseLocal_(t.dueDate, 'yyyy-MM-dd') : '',
    Time: t.time || '',
    Owner: t.owner || OWNER_ANYONE,
    Repeats: t.repeats || 'Never',
    'Prep steps': formatPrep_(t.prep),
    Notes: t.notes || '',
    Category: t.category || 'other',
    Reminders: formatReminders_(t.reminders),
    'Created by': t.createdBy || '',
    Created: t.created || '',
    Updated: t.updated || '',
    Completed: t.completed || '',
    'Calendar event': t.calendarEvent || '',
    'Next ID': t.nextId || '',
  };
}

/** When the task happens (a Date), or null if it has no date. */
function dueAt_(t) {
  return t.dueDate ? parseLocal_(`${t.dueDate} ${t.time || NO_TIME_DEFAULT}`, 'yyyy-MM-dd HH:mm') : null;
}

/** Prep "N days before" is due at 6pm that day; same-day prep two hours before the task. */
function prepDueAt_(t, step) {
  const due = dueAt_(t);
  if (!due) return null;
  if (step.daysBefore <= 0) return new Date(due.getTime() - 2 * 3600000);
  return parseLocal_(`${shiftDate_(t.dueDate, 'day', -step.daysBefore)} 18:00`, 'yyyy-MM-dd HH:mm');
}

/** Calendar arithmetic on "yyyy-MM-dd" strings; months clamp to the end of short months. */
function shiftDate_(dateStr, unit, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  let date;
  if (unit === 'day' || unit === 'week') {
    date = new Date(Date.UTC(y, m - 1, d + n * (unit === 'week' ? 7 : 1)));
  } else {
    const months = (m - 1) + n * (unit === 'year' ? 12 : 1);
    const year = y + Math.floor(months / 12);
    const month = ((months % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    date = new Date(Date.UTC(year, month, Math.min(d, last)));
  }
  return date.toISOString().slice(0, 10);
}

function when_(t) {
  const due = dueAt_(t);
  if (!due) return '';
  const sameYear = fmt_(due, 'yyyy') === fmt_(new Date(), 'yyyy');
  return fmt_(due, sameYear ? 'EEE d MMM' : 'EEE d MMM yyyy') + (t.time ? `, ${t.time}` : '');
}

// ---------------------------------------------------------------- Task operations

function tasks_() {
  return table_(TASKS).rows.map(toTask_).filter((t) => t.title);
}

function taskById_(id) {
  const t = tasks_().find((x) => x.id === Number(id));
  if (!t) throw new Error('That task no longer exists. It may have been deleted.');
  return t;
}

function saveTaskRow_(t) {
  const table = table_(TASKS);
  writeRow_(table, t.row, fromTask_(t));
}

function nextId_() {
  return tasks_().reduce((max, t) => Math.max(max, t.id || 0), 0) + 1;
}

function log_(who, what, t, details) {
  sheet_(ACTIVITY).appendRow([new Date(), who, what, t ? t.id : '', t ? t.title : '', t ? (t.owner || OWNER_ANYONE) : '', t ? when_(t) : '', details || '', '']);
}

function cleanTask_(data) {
  const title = String(data.title || '').trim();
  if (!title) throw new Error('Give the task a title.');
  const repeats = data.repeats && REPEATS[data.repeats] !== undefined ? data.repeats : 'Never';
  const dueDate = dateStr_(data.dueDate);
  if (repeats !== 'Never' && !dueDate) throw new Error('A repeating task needs a date to start from.');
  const owner = data.owner && data.owner !== OWNER_ANYONE ? data.owner : '';
  if (owner && !memberByName_(owner)) throw new Error(`"${owner}" isn't in the Members tab.`);
  return {
    title,
    dueDate,
    time: timeStr_(data.time),
    owner: owner ? memberByName_(owner).name : '',
    repeats,
    prep: (data.prep || []).filter((s) => s && String(s.title || '').trim())
      .map((s) => ({ title: String(s.title).trim(), daysBefore: Math.max(0, Number(s.daysBefore) || 0), done: Boolean(s.done) })),
    notes: String(data.notes || ''),
    category: CATEGORIES.includes(data.category) ? data.category : 'other',
    reminders: Array.isArray(data.reminders) ? data.reminders.map(Number).filter((n) => n >= 0) : parseReminders_(getSetting_('Default reminders')),
  };
}

function createTask_(data, actor) {
  const t = insertTask_(data, actor);
  log_(actor, 'added', t, '');
  return t;
}

/** Writes a new task under the last row that has a title. */
function insertTask_(data, actor) {
  const now = new Date();
  const t = { ...cleanTask_(data), id: nextId_(), done: false, createdBy: actor, created: now, updated: now, completed: '', calendarEvent: '', nextId: null };
  const table = table_(TASKS);
  const used = table.rows.filter((r) => String(r.Task || '').trim() || r.ID);
  t.row = used.length ? used[used.length - 1]._row + 1 : 2;
  writeRow_(table, t.row, fromTask_(t));
  return t;
}

function updateTask_(id, data, actor) {
  const before = taskById_(id);
  const clean = cleanTask_({ ...before, ...data });
  const t = { ...before, ...clean, updated: new Date() };
  saveTaskRow_(t);
  if (t.owner !== before.owner) log_(actor, 'assigned', t, '');
  if (t.dueDate !== before.dueDate || t.time !== before.time) log_(actor, 'moved', t, '');
  if (data.done !== undefined && Boolean(data.done) !== before.done) return setDone_(t, Boolean(data.done), actor);
  return t;
}

/** Marks a task done or not done. Completing a repeating task schedules the next one. */
function setDone_(t, done, actor) {
  t.done = done;
  t.updated = new Date();
  t.completed = done ? new Date() : '';
  let next = null;
  if (done && REPEATS[t.repeats] && t.dueDate && !t.nextId) {
    const rule = REPEATS[t.repeats];
    let date = t.dueDate;
    const today = fmt_(new Date(), 'yyyy-MM-dd');
    // Skip occurrences already in the past (e.g. done very late).
    for (let i = 0; i < 1000; i++) {
      date = shiftDate_(date, rule.unit, rule.interval);
      if (date > today) break;
    }
    next = insertTask_({ ...t, dueDate: date, prep: t.prep.map((s) => ({ ...s, done: false })) }, actor);
    t.nextId = next.id;
  }
  saveTaskRow_(t);
  log_(actor, done ? 'finished' : 'reopened', t, next ? `The next one is set for ${when_(next)}.` : '');
  return t;
}

function deleteTask_(id, actor) {
  const t = taskById_(id);
  log_(actor, 'deleted', t, t.calendarEvent ? `calendar:${t.calendarEvent}` : '');
  sheet_(TASKS).deleteRow(t.row);
}

// ---------------------------------------------------------------- Web app

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Household')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Everything the app needs to draw itself. */
function getState() {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return { error: 'signin', message: 'Open this app from the link that ends in /exec while signed in to Google.' };
  }
  let sheetUrl;
  try {
    sheetUrl = ss_().getUrl();
  } catch (err) {
    return { error: 'access', message: `${email} doesn't have access to the household's Google Sheet yet. Ask the owner to share it with you as an Editor.` };
  }
  const appLink = ScriptApp.getService().getUrl();
  if (appLink && !getSetting_('App link')) setSetting_('App link', appLink);

  const me = findMember_(email);
  const members = members_();
  return {
    me: me ? { name: me.name, email: me.email, prefs: prefsOf_(me) } : null,
    email,
    household: { name: getSetting_('Household name') || 'Our household', timezone: tz_(), sheetUrl, appUrl: getSetting_('App link') || appLink },
    members: members.map((m) => ({ name: m.name, email: m.email })),
    tasks: me ? tasks_().map(clientTask_) : [],
    categories: CATEGORIES,
    repeats: Object.keys(REPEATS),
    defaultReminders: parseReminders_(getSetting_('Default reminders')),
    assistant: claudeKey_() ? 'claude' : 'rules',
    now: fmt_(new Date(), "yyyy-MM-dd'T'HH:mm"),
  };
}

function clientTask_(t) {
  const due = dueAt_(t);
  return {
    id: t.id, done: t.done, title: t.title, dueDate: t.dueDate, time: t.time, dueAt: due ? due.toISOString() : '',
    when: when_(t), owner: t.owner, repeats: t.repeats, notes: t.notes, category: t.category, reminders: t.reminders,
    prep: t.prep.map((s) => {
      const at = prepDueAt_(t, s);
      return { ...s, dueAt: at ? at.toISOString() : '', when: at ? fmt_(at, 'EEE d MMM, HH:mm') : '' };
    }),
    completed: iso_(t.completed), createdBy: t.createdBy,
  };
}

function prefsOf_(m) {
  return { emailReminders: m.emailReminders, emailUpdates: m.emailUpdates, morningSummary: m.morningSummary, calendarInvites: m.calendarInvites };
}

/** Adds the signed-in person to the Members tab. */
function joinHousehold(name) {
  const email = Session.getActiveUser().getEmail();
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Enter your first name.');
  return withLock_(() => {
    if (findMember_(email)) return getState();
    if (memberByName_(clean)) throw new Error(`Someone called ${clean} is already in the household. Add an initial, e.g. "${clean} B".`);
    sheet_(MEMBERS).appendRow([clean, email, 'Yes', 'Yes', 'No', 'Yes']);
    refreshOwnerChoices_();
    log_(clean, 'joined', null, '');
    return getState();
  });
}

function savePreferences(prefs) {
  const me = requireMember_();
  const yn = (v) => (v ? 'Yes' : 'No');
  sheet_(MEMBERS).getRange(me.row, 3, 1, 4).setValues([[yn(prefs.emailReminders), yn(prefs.emailUpdates), yn(prefs.morningSummary), yn(prefs.calendarInvites)]]);
  return getState();
}

/** Turns a sentence into a draft task (nothing is saved). */
function parseText(text, history) {
  const me = requireMember_();
  const draft = parseWithRules({
    text: String(text || ''), now: fmt_(new Date(), "yyyy-MM-dd'T'HH:mm"),
    members: members_().map((m) => ({ name: m.name })), speaker: me.name, history: history || [],
  });
  const repeats = Object.keys(REPEATS).find((k) => REPEATS[k] && draft.recurrence
    && REPEATS[k].unit === draft.recurrence.unit && REPEATS[k].interval === draft.recurrence.interval) || 'Never';
  return {
    title: draft.title, notes: draft.notes, category: draft.category, dueDate: draft.due_date || '', time: draft.due_time || '',
    owner: draft.owner || '', repeats, reminders: draft.reminder_offsets_minutes,
    prep: draft.prep_steps.map((s) => ({ title: s.title, daysBefore: s.days_before, done: false })),
    questions: draft.questions,
  };
}

function saveTask(data) {
  const me = requireMember_();
  withLock_(() => (data.id ? updateTask_(data.id, data, me.name) : createTask_(data, me.name)));
  return getState();
}

function setTaskDone(id, done) {
  const me = requireMember_();
  const t = withLock_(() => setDone_(taskById_(id), Boolean(done), me.name));
  const state = getState();
  state.next = t.nextId ? clientTask_(taskById_(t.nextId)) : null;
  return state;
}

function setPrepDone(id, index, done) {
  requireMember_();
  withLock_(() => {
    const t = taskById_(id);
    if (!t.prep[index]) throw new Error('That prep step no longer exists.');
    t.prep[index].done = Boolean(done);
    t.updated = new Date();
    saveTaskRow_(t);
  });
  return getState();
}

function deleteTask(id) {
  const me = requireMember_();
  withLock_(() => deleteTask_(id, me.name));
  return getState();
}

function getActivity() {
  requireMember_();
  const rows = table_(ACTIVITY).rows.slice(-40).reverse();
  return rows.map((a) => ({ when: a.When instanceof Date ? fmt_(a.When, 'EEE d MMM, HH:mm') : '', text: describeActivity_(a, null) }));
}

// ---------------------------------------------------------------- Chat assistant (in the app)

// The key lives in Apps Script's Script properties (Project Settings), never in the sheet or the page.
const CLAUDE_KEY_PROPERTY = 'ANTHROPIC_API_KEY';
const CLAUDE_MODEL = 'claude-opus-5-5';
const CHAT_HISTORY_MESSAGES = 6;
const OPERATION_TYPES = ['create', 'complete', 'reopen', 'reschedule', 'assign', 'unassign', 'rename', 'add_note', 'list'];

const CHAT_SYSTEM_PROMPT = `You are the assistant inside a shared household task app. Household members message you to manage their shared tasks. Reply with ONLY a JSON object, no other text, in this shape:
{"operations": [ ... ], "message": "..."}

Operations (use only these types):
- "create": a new task. Put its details in "draft": {"title", "due_date" (YYYY-MM-DD or null), "due_time" (HH:MM 24h or null), "owner" (exact member name or null), "repeats" (one of: Never, Daily, Weekly, Every 2 weeks, Monthly, Quarterly, Every 6 months, Yearly), "category" (one of: ${CATEGORIES.join(', ')}), "notes" (phone numbers, names, quotes from the message, or ""), "prep_steps" ([{"title", "days_before"}]: things to do beforehand, only when clearly needed, usually 0 to 4), "reminders_minutes_before" (e.g. [1440, 60])}.
- "complete" or "reopen": task_id.
- "reschedule": task_id, plus due_date and/or due_time for the new value (null keeps the current one).
- "assign": task_id and owner (exact member name). "I", "me" and "mine" mean the person speaking.
- "unassign": task_id.
- "rename" or "add_note": task_id and text.

Use only the task ids listed. Resolve relative dates ("next Tuesday", "in two weeks") from the current local date. If the message refers to the task being discussed ("it", "that one", "the reminder"), use the current task. If you can't tell which task is meant, or a needed detail is missing (such as the date for a new task), return no operations and ask one short question in "message". For questions about the list, answer in "message" and return no operations.

"message" is read on a phone and may be read aloud: keep it to one or two short, friendly sentences, addressed to the person who sent the message. Never invent tasks or members.`;

function claudeKey_() {
  return PropertiesService.getScriptProperties().getProperty(CLAUDE_KEY_PROPERTY) || '';
}

/** Handles a chat message such as "done", "I'll take the gutters" or "move it to Friday". */
function chat(text) {
  const me = requireMember_();
  const userProps = PropertiesService.getUserProperties();
  const context = JSON.parse(userProps.getProperty('chatContext') || '{}');
  const contextTaskId = context.at && Date.now() - context.at < 86400000 ? context.taskId : null;
  const history = JSON.parse(userProps.getProperty('chatHistory') || '[]');
  const message = String(text || '').slice(0, 2000);
  const reply = withLock_(() => runChat_(message, me.name, contextTaskId, history));
  userProps.setProperty('chatContext', JSON.stringify({ taskId: reply.taskId || contextTaskId, at: Date.now() }));
  const kept = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply.text }];
  userProps.setProperty('chatHistory', JSON.stringify(kept.slice(-CHAT_HISTORY_MESSAGES)));
  return reply.text;
}

function runChat_(text, speaker, contextTaskId, history) {
  const members = members_();
  const open = tasks_().filter((t) => !t.done || t.id === contextTaskId);
  const now = fmt_(new Date(), "yyyy-MM-dd'T'HH:mm");
  let plan = null;
  let notice = '';
  if (claudeKey_()) {
    try {
      plan = askClaude_({ text, speaker, members, tasks: open, contextTaskId, now, history });
    } catch (err) {
      console.error('Claude chat failed:', err);
      notice = `Claude is unavailable right now, so I used the simple rules (${err.message}).`;
    }
  }
  if (!plan) {
    plan = interpretWithRules({
      text, speaker, members: members.map((m) => ({ name: m.name })),
      tasks: open.map((t) => ({ id: t.id, title: t.title })), contextTaskId, now,
    });
  }
  const lines = [];
  let taskId = contextTaskId;
  plan.operations.forEach((op) => {
    try {
      const r = applyOperation_(op, speaker, contextTaskId);
      if (r.line) lines.push(r.line);
      if (r.taskId) taskId = r.taskId;
    } catch (err) {
      lines.push(`Couldn't do that: ${err.message}`);
    }
  });
  if (plan.message) lines.push(plan.message);
  if (notice) lines.push(notice);
  return { text: lines.join('\n') || 'OK.', taskId };
}

/** Asks Claude for a plan. Throws on any failure so the caller can fall back to the rules. */
function askClaude_({ text, speaker, members, tasks, contextTaskId, now, history }) {
  const taskLines = tasks.slice(0, 80).map((t) => `- id ${t.id}: "${t.title}" | ${t.done ? 'done' : 'open'} | ${when_(t) || 'no date'} | owner: ${t.owner || 'nobody'}${t.repeats !== 'Never' ? ` | repeats ${t.repeats.toLowerCase()}` : ''}`);
  const content = [
    `Current local date/time: ${now}`,
    `Household members: ${members.map((m) => m.name).join(', ')}`,
    `Open tasks:\n${taskLines.join('\n') || '(none)'}`,
    `Current task: ${contextTaskId ? `id ${contextTaskId}` : 'none'}`,
    history.length ? `Recent conversation:\n${history.map((h) => `${h.role === 'user' ? 'Person' : 'Assistant'}: ${h.content}`).join('\n')}` : '',
    `Message from ${speaker}:\n${text}`,
  ].filter(Boolean).join('\n\n');

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      'x-api-key': claudeKey_(),
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      fallbacks: 'default',
      system: CHAT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    }),
  });
  if (res.getResponseCode() !== 200) throw new Error(`service returned ${res.getResponseCode()}`);
  const body = JSON.parse(res.getContentText());
  if (body.stop_reason === 'refusal') throw new Error('the request was declined');
  const reply = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  return parseChatPlan_(reply, tasks);
}

/** Checks Claude's JSON before anything is changed: unknown types and unknown task ids are dropped. */
function parseChatPlan_(reply, tasks) {
  const match = /\{[\s\S]*\}/.exec(reply);
  if (!match) throw new Error('no plan in the reply');
  const raw = JSON.parse(match[0]);
  const ids = new Set(tasks.map((t) => t.id));
  const proposed = (Array.isArray(raw.operations) ? raw.operations : []).filter((op) => op && OPERATION_TYPES.includes(op.type));
  // A task id that doesn't exist is dropped, not guessed at. A missing id means "the current task".
  const usable = proposed.filter((op) => op.task_id == null || ids.has(Number(op.task_id)));
  const operations = usable.map((op) => ({
      type: op.type,
      task_id: ids.has(Number(op.task_id)) ? Number(op.task_id) : null,
      due_date: dateStr_(op.due_date) || null,
      due_time: timeStr_(op.due_time) || null,
      owner: typeof op.owner === 'string' ? op.owner : null,
      text: typeof op.text === 'string' ? op.text.slice(0, 500) : null,
      draft: op.type === 'create' && op.draft ? cleanDraft_(op.draft) : null,
    }));
  let message = typeof raw.message === 'string' ? raw.message.slice(0, 500) : '';
  if (proposed.length && !operations.length && !message) message = "I'm not sure which task you mean. Could you say part of its name?";
  return { operations, message };
}

function cleanDraft_(d) {
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    title: String(d.title || '').trim().slice(0, 200),
    dueDate: dateStr_(d.due_date),
    time: timeStr_(d.due_time),
    owner: typeof d.owner === 'string' ? d.owner : '',
    repeats: Object.keys(REPEATS).includes(d.repeats) ? d.repeats : 'Never',
    category: CATEGORIES.includes(d.category) ? d.category : 'other',
    notes: String(d.notes || '').slice(0, 5000),
    prep: list(d.prep_steps).filter((s) => s && String(s.title || '').trim())
      .map((s) => ({ title: String(s.title).trim().slice(0, 200), daysBefore: Math.max(0, Number(s.days_before) || 0) })),
    // Undefined (not []) when Claude gave none, so the household default applies.
    reminders: list(d.reminders_minutes_before).map(Number).filter((n) => n >= 0 && n <= 525600).length
      ? list(d.reminders_minutes_before).map(Number).filter((n) => n >= 0 && n <= 525600) : undefined,
  };
}

/** The simple rules' reading of a sentence, in the same shape as a Claude draft. */
function draftFromRules_(text, speaker) {
  const draft = parseWithRules({
    text: text || '', now: fmt_(new Date(), "yyyy-MM-dd'T'HH:mm"), members: members_().map((m) => ({ name: m.name })), speaker,
  });
  const repeats = Object.keys(REPEATS).find((k) => REPEATS[k] && draft.recurrence
    && REPEATS[k].unit === draft.recurrence.unit && REPEATS[k].interval === draft.recurrence.interval) || 'Never';
  return {
    title: draft.title, dueDate: draft.due_date || '', time: draft.due_time || '', owner: draft.owner || '', repeats,
    category: draft.category, notes: '', reminders: draft.reminder_offsets_minutes,
    prep: draft.prep_steps.map((s) => ({ title: s.title, daysBefore: s.days_before })),
  };
}

function describeTask_(t) {
  return `"${t.title}", ${when_(t) || 'no date'}, ${t.owner || 'unassigned'}${t.repeats !== 'Never' ? `, repeats ${t.repeats.toLowerCase()}` : ''}`;
}

function applyOperation_(op, speaker, contextTaskId) {
  if (op.type === 'list') {
    const open = tasks_().filter((t) => !t.done).sort(byDue_).slice(0, 12);
    return { line: open.length ? `Coming up:\n${open.map((t) => `• ${describeTask_(t)}`).join('\n')}` : 'Nothing on the list.' };
  }
  if (op.type === 'create') {
    const d = op.draft || draftFromRules_(op.text, speaker);
    const t = createTask_({ ...d, repeats: d.dueDate ? d.repeats : 'Never' }, speaker);
    return { taskId: t.id, line: `Added ${describeTask_(t)}.${t.prep.length ? ` Prep: ${t.prep.map((s) => s.title).join('; ')}.` : ''}${t.dueDate ? '' : ' No date yet. Reply with one to set it.'}` };
  }

  const id = op.task_id || contextTaskId;
  const t = id ? tasks_().find((x) => x.id === Number(id)) : null;
  if (!t) return { line: 'Which task do you mean? Say part of its name.' };
  switch (op.type) {
    case 'complete': {
      const done = setDone_(t, true, speaker);
      const next = done.nextId ? taskById_(done.nextId) : null;
      return { taskId: next ? next.id : t.id, line: `Marked "${t.title}" as done.${next ? ` Next one: ${when_(next)}.` : ''}` };
    }
    case 'reopen':
      setDone_(t, false, speaker);
      return { taskId: t.id, line: `Reopened "${t.title}".` };
    case 'reschedule': {
      const updated = updateTask_(t.id, { dueDate: op.due_date || t.dueDate || fmt_(new Date(), 'yyyy-MM-dd'), time: op.due_time || t.time }, speaker);
      return { taskId: t.id, line: `Moved "${t.title}" to ${when_(updated)}.` };
    }
    case 'assign': {
      const who = /^(me|i|myself)$/i.test(op.owner || '') ? memberByName_(speaker) : memberByName_(op.owner);
      if (!who) return { line: `I don't know who "${op.owner}" is.` };
      updateTask_(t.id, { owner: who.name }, speaker);
      const others = members_().filter((m) => m.name !== speaker).map((m) => m.name).join(' and ');
      return { taskId: t.id, line: who.name === speaker ? `"${t.title}" is yours.${others ? ` I'll let ${others} know.` : ''}` : `Assigned "${t.title}" to ${who.name}.` };
    }
    case 'unassign':
      updateTask_(t.id, { owner: '' }, speaker);
      return { taskId: t.id, line: `"${t.title}" is unassigned now.` };
    case 'rename':
      updateTask_(t.id, { title: op.text }, speaker);
      return { taskId: t.id, line: `Renamed to "${op.text}".` };
    case 'add_note':
      updateTask_(t.id, { notes: t.notes ? `${t.notes}\n${op.text}` : op.text }, speaker);
      return { taskId: t.id, line: `Added that to the notes on "${t.title}".` };
    default:
      return { line: '' };
  }
}

function byDue_(a, b) {
  const da = dueAt_(a);
  const db = dueAt_(b);
  if (!da && !db) return a.id - b.id;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

// ---------------------------------------------------------------- Edits made directly in the sheet

/** Installed by setup(): reacts to edits typed straight into the Tasks or Members tab. */
function onSheetEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() === MEMBERS) { refreshOwnerChoices_(); return; }
  if (sh.getName() !== TASKS) return;
  const editorEmail = e.user && e.user.getEmail ? e.user.getEmail() : '';
  const actor = (findMember_(editorEmail) || {}).name || 'Someone (in the sheet)';
  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  const header = e.range.getNumColumns() === 1 ? TASK_COLUMNS[e.range.getColumn() - 1] : null;

  withLock_(() => {
    const table = table_(TASKS);
    for (let row = firstRow; row <= lastRow; row++) {
      const r = table.rows.find((x) => x._row === row);
      if (!r || !String(r.Task || '').trim()) continue;
      const t = toTask_(r);
      if (!t.id) {
        // A task typed straight into the sheet: fill in the bookkeeping.
        Object.assign(t, { id: nextId_(), createdBy: actor, created: new Date(), updated: new Date() });
        if (!r.Reminders) t.reminders = parseReminders_(getSetting_('Default reminders'));
        saveTaskRow_(t);
        log_(actor, 'added', t, '');
        continue;
      }
      if (header === 'Done') {
        setDone_(t, t.done, actor);
        continue;
      }
      t.updated = new Date();
      saveTaskRow_(t);
      if (header === 'Owner') log_(actor, 'assigned', t, '');
      if (header === 'Due date' || header === 'Time') log_(actor, 'moved', t, '');
    }
  });
}

// ---------------------------------------------------------------- Reminders, emails, calendar

/** Runs every 5 minutes (installed by setup). */
function runScheduledJobs() {
  withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    const now = new Date();
    const last = new Date(props.getProperty('lastRun') || now.getTime() - 5 * 60000);
    const since = new Date(Math.max(last.getTime(), now.getTime() - 24 * 3600000));
    const members = members_();
    const tasks = tasks_();
    const inbox = {};
    members.forEach((m) => { inbox[m.email] = { member: m, reminders: [], updates: [], summary: null }; });

    // 1. Reminders that fell due since the last run.
    tasks.filter((t) => !t.done && t.dueDate).forEach((t) => {
      const due = dueAt_(t);
      t.reminders.forEach((offset) => {
        const at = new Date(due.getTime() - offset * 60000);
        if (at > since && at <= now) members.forEach((m) => inbox[m.email].reminders.push(reminderText_(t, null, offset, m)));
      });
      t.prep.filter((s) => !s.done).forEach((s) => {
        const at = prepDueAt_(t, s);
        if (at > since && at <= now) members.forEach((m) => inbox[m.email].reminders.push(reminderText_(t, s, null, m)));
      });
    });

    // 2. Changes made by someone else.
    const activity = table_(ACTIVITY);
    const pending = activity.rows.filter((a) => !a.Emailed && a.What);
    pending.forEach((a) => {
      members.filter((m) => m.name !== a.Who).forEach((m) => inbox[m.email].updates.push(describeActivity_(a, m.name)));
    });

    // 3. Morning summary, once a day.
    const today = fmt_(now, 'yyyy-MM-dd');
    const summaryTime = timeStr_(getSetting_('Morning summary time')) || '07:00';
    if (props.getProperty('lastSummary') !== today && fmt_(now, 'HH:mm') >= summaryTime) {
      members.forEach((m) => { inbox[m.email].summary = summaryText_(tasks, m, today); });
      props.setProperty('lastSummary', today);
    }

    Object.values(inbox).forEach((box) => sendDigest_(box));
    pending.forEach((a) => activity.sh.getRange(a._row, ACTIVITY_COLUMNS.indexOf('Emailed') + 1).setValue(now));

    // 4. Google Calendar.
    if (yes_(getSetting_('Calendar sync') || 'No')) syncCalendar_(tasks, members, last, pending);

    props.setProperty('lastRun', now.toISOString());
  });
}

function ownerPhrase_(t, member) {
  if (!t.owner) return 'Nobody has taken it yet. Open the app to claim it.';
  return t.owner === member.name ? "You're on it." : `${t.owner} is on it.`;
}

function reminderText_(t, step, offset, member) {
  const what = step
    ? `Prep for "${t.title}" (${when_(t)}): ${step.title}.`
    : offset === 0 ? `"${t.title}" is due now.` : `"${t.title}" is due in ${formatReminders_([offset])} (${when_(t)}).`;
  return `${what} ${ownerPhrase_(t, member)}`;
}

/** One line about a change, worded for the person reading it (null = neutral). */
function describeActivity_(a, reader) {
  const who = a.Who;
  const task = `"${a.Task}"`;
  const owner = a.Owner && a.Owner !== OWNER_ANYONE ? String(a.Owner) : '';
  switch (a.What) {
    case 'added':
      return `${who} added ${task}${a.Due ? ` for ${a.Due}` : ''}. ${!owner ? 'Nobody has taken it yet.' : owner === reader ? "It's assigned to you." : `${owner} is on it.`}`;
    case 'assigned':
      if (!owner) return `${who} unassigned ${task}.`;
      if (owner === reader) return `${who} assigned ${task} to you.`;
      if (owner === who) return `${who} is taking care of ${task}.`;
      return `${task} is now with ${owner}.`;
    case 'moved': return `${who} moved ${task} to ${a.Due || 'no date'}.`;
    case 'finished': return `${who} finished ${task}.${a.Details ? ` ${a.Details}` : ''}`;
    case 'reopened': return `${who} reopened ${task}.`;
    case 'deleted': return `${who} deleted ${task}.`;
    case 'joined': return `${who} joined the household.`;
    default: return `${who} changed ${task}.`;
  }
}

function summaryText_(tasks, member, today) {
  const open = tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= shiftDate_(today, 'day', 1)).sort(byDue_);
  if (!open.length) return '';
  return open.map((t) => `• ${t.dueDate < today ? 'OVERDUE: ' : ''}${t.title} (${when_(t)}). ${ownerPhrase_(t, member)}`).join('\n');
}

function sendDigest_(box) {
  const m = box.member;
  const reminders = m.emailReminders ? box.reminders : [];
  const updates = m.emailUpdates ? box.updates : [];
  const summary = m.morningSummary ? box.summary : '';
  if (!reminders.length && !updates.length && !summary) return;

  const household = getSetting_('Household name') || 'Household';
  const link = getSetting_('App link');
  const sections = [];
  if (reminders.length) sections.push(['Reminders', reminders]);
  if (summary) sections.push(['Today and tomorrow', summary.split('\n').map((l) => l.replace(/^• /, ''))]);
  if (updates.length) sections.push(['Updates', updates]);

  const subject = reminders.length === 1 && !updates.length && !summary
    ? `Reminder: ${reminders[0].split('.')[0]}`
    : `${household}: ${[reminders.length && `${reminders.length} reminder${reminders.length > 1 ? 's' : ''}`,
      updates.length && `${updates.length} update${updates.length > 1 ? 's' : ''}`, summary && 'your day'].filter(Boolean).join(', ')}`;
  const body = sections.map(([title, lines]) => `${title}\n${lines.map((l) => `• ${l}`).join('\n')}`).join('\n\n') + (link ? `\n\nOpen the app: ${link}` : '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = sections.map(([title, lines]) => `<h3 style="margin:16px 0 6px;font:600 15px sans-serif;color:#2f6f5e">${esc(title)}</h3><ul style="margin:0;padding-left:18px;font:15px/1.5 sans-serif">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`).join('')
    + (link ? `<p style="margin-top:18px"><a href="${esc(link)}" style="font:600 15px sans-serif;color:#2f6f5e">Open the app</a></p>` : '');
  MailApp.sendEmail({ to: m.email, subject, body, htmlBody: html, name: household });
}

function syncCalendar_(tasks, members, lastRun, activityRows) {
  const calendar = CalendarApp.getDefaultCalendar();
  const ownerEmail = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const guests = members.filter((m) => m.calendarInvites && m.email !== ownerEmail).map((m) => m.email).join(',');
  const remove = (id) => { try { const ev = calendar.getEventById(id); if (ev) ev.deleteEvent(); } catch (err) { /* already gone */ } };

  activityRows.filter((a) => a.What === 'deleted' && String(a.Details).startsWith('calendar:'))
    .forEach((a) => remove(String(a.Details).slice('calendar:'.length)));

  tasks.forEach((t) => {
    if ((t.done || !t.dueDate) && t.calendarEvent) {
      remove(t.calendarEvent);
      t.calendarEvent = '';
      saveTaskRow_(t);
      return;
    }
    if (t.done || !t.dueDate) return;
    const changed = !t.calendarEvent || (t.updated instanceof Date && t.updated >= lastRun);
    if (!changed) return;
    if (t.calendarEvent) remove(t.calendarEvent);
    const title = `${t.title}${t.owner ? ` (${t.owner})` : ''}`;
    const description = [t.prep.length ? `Prep:\n${t.prep.map((s) => `- ${s.title}`).join('\n')}` : '', t.notes].filter(Boolean).join('\n\n');
    const options = { description, guests, sendInvites: false };
    const event = t.time
      ? calendar.createEvent(title, dueAt_(t), new Date(dueAt_(t).getTime() + 3600000), options)
      : calendar.createAllDayEvent(title, parseLocal_(t.dueDate, 'yyyy-MM-dd'), options);
    event.removeAllReminders();
    t.reminders.slice(0, 5).forEach((m) => event.addPopupReminder(Math.min(m, 40320)));
    t.calendarEvent = event.getId();
    saveTaskRow_(t);
  });
}
