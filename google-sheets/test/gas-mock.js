// A small in-memory stand-in for the Google Apps Script services Code.gs uses, so the
// Sheets edition can be tested with node:test. It mimics the behaviour that matters
// (cell values, dates in the spreadsheet's timezone, users, email, calendar) and
// treats formatting calls as no-ops.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { zonedToUtc } from '../../src/time.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Any method not modelled returns the same object, so chained formatting calls work.
function chainable(target = {}) {
  const proxy = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === 'then') return undefined;
      return () => proxy;
    },
  });
  return proxy;
}

function localParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    weekday: 'long', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), weekday: get('weekday') };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function createGas({ timeZone = 'Europe/London', owner = 'naser@example.com', start = '2026-10-12T09:00:00Z' } = {}) {
  const clock = { now: new Date(start).getTime() };
  let activeUser = owner;
  const deniedUsers = new Set();
  const outbox = [];
  const triggers = [];
  const userProps = {};
  const scriptProps = {};
  const events = new Map();
  // Outgoing web requests (the Claude API). Tests set http.responder; by default the network is off.
  const http = {
    calls: [],
    responder: () => { throw new Error('network disabled in tests'); },
  };
  let eventSeq = 0;

  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(clock.now);
      else super(...args);
    }

    static now() { return clock.now; }
  }

  const toCtxDate = (d) => new FakeDate(d.getTime());

  // ---- Spreadsheet
  function makeSheet(name) {
    const data = [];
    const sheet = chainable({
      name,
      data,
      getName: () => name,
      getMaxRows: () => 1000,
      getLastRow() {
        for (let r = data.length; r > 0; r--) if ((data[r - 1] || []).some((v) => v !== '' && v != null)) return r;
        return 0;
      },
      getLastColumn: () => data.reduce((m, row) => Math.max(m, (row || []).length), 0),
      appendRow(values) { data[sheet.getLastRow()] = [...values]; return sheet; },
      deleteRow(r) { data.splice(r - 1, 1); return sheet; },
      getRange(row, col, numRows = 1, numCols = 1) {
        if (typeof row === 'string') return chainable({}); // A1 ranges are only used for formatting
        return makeRange(sheet, row, col, numRows, numCols);
      },
    });
    return sheet;
  }

  function makeRange(sheet, row, col, numRows, numCols) {
    const { data } = sheet;
    const cell = (r, c) => { const v = (data[r - 1] || [])[c - 1]; return v === undefined || v === null ? '' : v; };
    const set = (r, c, v) => { data[r - 1] = data[r - 1] || []; for (let i = data[r - 1].length; i < c - 1; i++) data[r - 1][i] = ''; data[r - 1][c - 1] = v; };
    return chainable({
      getValues: () => Array.from({ length: numRows }, (_, i) => Array.from({ length: numCols }, (_, j) => cell(row + i, col + j))),
      getValue: () => cell(row, col),
      setValues(values) { values.forEach((r, i) => r.forEach((v, j) => set(row + i, col + j, v))); return this; },
      setValue(v) { set(row, col, v); return this; },
      getRow: () => row,
      getColumn: () => col,
      getNumRows: () => numRows,
      getNumColumns: () => numCols,
      getSheet: () => sheet,
    });
  }

  const sheets = [makeSheet('Sheet1')];
  const spreadsheet = chainable({
    getSheetByName: (n) => sheets.find((s) => s.name === n) || null,
    insertSheet(n) { const s = makeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet(s) { sheets.splice(sheets.indexOf(s), 1); },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/test',
    getSpreadsheetTimeZone: () => timeZone,
  });

  const builder = () => chainable({ build: () => ({}) });

  // ---- Utilities (Java-style date patterns, subset)
  function formatDate(date, tz, pattern) {
    const p = localParts(date, tz);
    return pattern.replace(/'([^']*)'|yyyy|MMM|MM|dd|d|HH|mm|EEEE|EEE/g, (tok, lit) => {
      if (lit !== undefined) return lit;
      switch (tok) {
        case 'yyyy': return p.year;
        case 'MMM': return MONTHS[Number(p.month) - 1];
        case 'MM': return p.month;
        case 'dd': return p.day;
        case 'd': return String(Number(p.day));
        case 'HH': return p.hour;
        case 'mm': return p.minute;
        case 'EEEE': return p.weekday;
        case 'EEE': return p.weekday.slice(0, 3);
        default: return tok;
      }
    });
  }

  function parseDate(text, tz, pattern) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(text);
    if (!m || (pattern.includes('HH') && m[4] === undefined)) throw new Error(`Unparseable date ${text} for ${pattern}`);
    return toCtxDate(zonedToUtc({ year: +m[1], month: +m[2], day: +m[3], hour: +(m[4] || 0), minute: +(m[5] || 0) }, tz));
  }

  const props = (store) => ({
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); },
  });

  // ---- Calendar
  function makeEvent(title, start, end, options, allDay) {
    const id = `event-${++eventSeq}@google.com`;
    const ev = {
      id, title, start, end, allDay, options, reminders: [],
      getId: () => id,
      deleteEvent: () => events.delete(id),
      removeAllReminders() { ev.reminders = []; return ev; },
      addPopupReminder(m) { ev.reminders.push(m); return ev; },
    };
    events.set(id, ev);
    return ev;
  }
  const calendar = {
    createEvent: (t, s, e, o) => makeEvent(t, s, e, o, false),
    createAllDayEvent: (t, d, o) => makeEvent(t, d, null, o, true),
    getEventById: (id) => events.get(id) || null,
  };

  const context = {
    console,
    Date: FakeDate,
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        if (deniedUsers.has(activeUser)) throw new Error('You do not have permission to access the requested document.');
        return spreadsheet;
      },
      newDataValidation: builder,
      newConditionalFormatRule: builder,
    },
    Utilities: {
      formatDate,
      parseDate,
      getUuid: () => 'f00dfeedf00dfeedf00dfeedf00dfeed',
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => activeUser }),
      getEffectiveUser: () => ({ getEmail: () => owner }),
    },
    PropertiesService: {
      getScriptProperties: () => props(scriptProps),
      getUserProperties: () => props(userProps[activeUser] ||= {}),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: {
      fetch(url, opts) {
        http.calls.push({ url, opts: { ...opts, payload: opts.payload } });
        const r = http.responder(url, opts);
        return { getResponseCode: () => r.status, getContentText: () => r.body };
      },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((t) => ({ getHandlerFunction: () => t.handler, _t: t })),
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t._t), 1),
      newTrigger(handler) {
        const spec = { handler };
        const b = chainable({ create: () => { triggers.push(spec); return spec; } });
        return b;
      },
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/test/exec' }),
    },
    MailApp: { sendEmail: (msg) => outbox.push(msg) },
    CalendarApp: { getDefaultCalendar: () => calendar },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (content) => chainable({ getContent: () => content }),
    },
    HtmlService: { createHtmlOutputFromFile: () => chainable({}) },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(dir, 'Parser.gs'), 'utf8'), context, { filename: 'Parser.gs' });
  vm.runInContext(readFileSync(join(dir, 'Code.gs'), 'utf8'), context, { filename: 'Code.gs' });

  const gas = {
    context,
    http,
    clock,
    outbox,
    triggers,
    events,
    spreadsheet,
    sheet: (name) => spreadsheet.getSheetByName(name),
    as(email) { activeUser = email; return gas; },
    deny(email) { deniedUsers.add(email); },
    advance(ms) { clock.now += ms; },
    // Calls a Code.gs function as the given user; values cross the vm boundary as JSON like google.script.run.
    call(email, fn, ...args) {
      activeUser = email;
      const out = context[fn](...args);
      return out === undefined ? out : JSON.parse(JSON.stringify(out));
    },
    // Simulates someone typing into a cell, then fires the installed onEdit trigger.
    edit(email, sheetName, row, header, value) {
      const sh = spreadsheet.getSheetByName(sheetName);
      const col = sh.data[0].indexOf(header) + 1;
      if (col < 1) throw new Error(`No column ${header}`);
      const range = makeRange(sh, row, col, 1, 1);
      range.setValue(value instanceof RealDate ? toCtxDate(value) : value);
      activeUser = owner; // installable triggers run as the person who installed them
      context.onSheetEdit({ range, value, user: { getEmail: () => email } });
    },
    rows(name) {
      const [headers, ...rest] = spreadsheet.getSheetByName(name).data;
      return rest.filter((r) => r && r.some((v) => v !== '' && v != null)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
    },
    localDate: (date) => formatDate(date, timeZone, 'yyyy-MM-dd'),
    toCtxDate,
  };
  return gas;
}
