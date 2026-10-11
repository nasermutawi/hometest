// Household front end: plain JS, no build step. Talks to the JSON API in src/app.js.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const REMINDER_CHOICES = [
  [10080, '1 week before'], [1440, '1 day before'], [120, '2 hours before'], [60, '1 hour before'], [0, 'At the time'],
];
const DAY = 86400_000;

const state = {
  me: null,
  tasks: [],
  notifications: [],
  status: 'open',
  ownerFilter: 'all',
  editing: null, // task being edited, or null for a new one
  draft: null,   // { text, history, questions } while turning text into a task
};

// ---------------------------------------------------------------- API

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------------------------------------------------------------- Dates

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fromLocal = (date, time) => new Date(`${date}T${time || '09:00'}`);

function friendlyDate(iso) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  let day;
  if (days === 0) day = 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days === -1) day = 'Yesterday';
  else if (days > 1 && days < 7) day = d.toLocaleDateString([], { weekday: 'long' });
  else day = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  return `${day}, ${time}`;
}

// A prep step "N days before" lands at 6pm on that day; same-day prep lands 2 hours before the task.
function prepDueAt(taskDue, daysBefore) {
  if (!taskDue) return null;
  if (daysBefore <= 0) return new Date(taskDue.getTime() - 2 * 3600_000);
  const d = startOfDay(new Date(taskDue.getTime() - daysBefore * DAY));
  d.setHours(18);
  return d;
}

function daysBefore(taskDueIso, stepDueIso) {
  if (!taskDueIso || !stepDueIso) return 0;
  return Math.max(0, Math.round((startOfDay(new Date(taskDueIso)) - startOfDay(new Date(stepDueIso))) / DAY));
}

// ---------------------------------------------------------------- Auth

let authMode = 'login';

function showAuth() {
  $('#app-view').hidden = true;
  $('#auth-view').hidden = false;
  setAuthMode(authMode);
}

function setAuthMode(mode) {
  authMode = mode;
  $$('[data-auth-tab]').forEach((b) => b.classList.toggle('active', b.dataset.authTab === mode));
  $$('[data-register]').forEach((el) => { el.hidden = mode !== 'register'; });
  $('#auth-form [name=name]').required = mode === 'register';
  $('#auth-form [name=password]').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-submit').textContent = mode === 'register' ? 'Create account' : 'Sign in';
  $('#auth-error').hidden = true;
}

$$('[data-auth-tab]').forEach((b) => b.addEventListener('click', () => setAuthMode(b.dataset.authTab)));

// Invite links look like /?invite=CODE
const inviteFromUrl = new URLSearchParams(location.search).get('invite');
if (inviteFromUrl) {
  authMode = 'register';
  $('#auth-form [name=inviteCode]').value = inviteFromUrl;
}

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const body = Object.fromEntries(form);
  if (authMode === 'login') { delete body.name; delete body.inviteCode; }
  if (!body.inviteCode) delete body.inviteCode;
  $('#auth-submit').disabled = true;
  try {
    await api(`/api/auth/${authMode}`, { method: 'POST', body });
    if (inviteFromUrl) history.replaceState(null, '', '/');
    await boot();
  } catch (err) {
    $('#auth-error').textContent = err.message;
    $('#auth-error').hidden = false;
  } finally {
    $('#auth-submit').disabled = false;
  }
});

// ---------------------------------------------------------------- Rendering

function memberName(id) {
  return state.me.members.find((m) => m.id === id)?.name;
}

function renderHeader() {
  $('#household-name').textContent = state.me.household.name;
  $('#engine-label').textContent = state.me.assistant === 'claude' ? 'Understood by Claude' : 'Offline parser';
  $('#engine-label').title = state.me.assistant === 'claude' ? '' : 'Set ANTHROPIC_API_KEY on the server for full natural-language understanding';

  const filters = [['all', 'Everyone'], ['me', 'Mine'],
    ...state.me.members.filter((m) => m.id !== state.me.user.id).map((m) => [String(m.id), m.name]),
    ['none', 'Unassigned']];
  $('#owner-filter').innerHTML = filters.map(([k, label]) =>
    `<button type="button" class="chip ${state.ownerFilter === k ? 'active' : ''}" data-owner="${esc(k)}">${esc(label)}</button>`).join('');
}

function filteredTasks() {
  return state.tasks.filter((t) => {
    if (t.status !== state.status) return false;
    switch (state.ownerFilter) {
      case 'all': return true;
      case 'me': return t.owner_id === state.me.user.id;
      case 'none': return t.owner_id == null;
      default: return t.owner_id === Number(state.ownerFilter);
    }
  });
}

function groupTasks(tasks) {
  if (state.status === 'done') {
    return [['Recently done', [...tasks].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')).slice(0, 50)]];
  }
  const now = new Date();
  const today = startOfDay(now);
  const groups = { Overdue: [], Today: [], Tomorrow: [], 'Next 7 days': [], Later: [], 'No date': [] };
  for (const t of tasks) {
    if (!t.due_at) { groups['No date'].push(t); continue; }
    const due = new Date(t.due_at);
    const days = Math.round((startOfDay(due) - today) / DAY);
    if (due < now && days < 0) groups.Overdue.push(t);
    else if (days <= 0) groups.Today.push(t);
    else if (days === 1) groups.Tomorrow.push(t);
    else if (days < 7) groups['Next 7 days'].push(t);
    else groups.Later.push(t);
  }
  return Object.entries(groups).filter(([, list]) => list.length);
}

function renderTask(t) {
  const owner = memberName(t.owner_id);
  const overdue = t.status === 'open' && t.due_at && new Date(t.due_at) < new Date();
  const steps = t.prep_steps.map((s) => `
    <li class="${s.done ? 'done-step' : ''}">
      <input type="checkbox" data-step="${s.id}" ${s.done ? 'checked' : ''} aria-label="Mark prep step done">
      <span>${esc(s.title)}</span>
      ${s.due_at ? `<span class="when">${esc(friendlyDate(s.due_at))}</span>` : ''}
    </li>`).join('');
  return `
    <article class="task card ${t.status}" id="task-${t.id}">
      <input type="checkbox" class="check" data-complete="${t.id}" ${t.status === 'done' ? 'checked' : ''} aria-label="Mark task done">
      <div class="task-title" data-edit="${t.id}">${esc(t.title)}</div>
      <div class="task-meta">
        ${t.due_at ? `<span class="${overdue ? 'late' : ''}">${esc(friendlyDate(t.due_at))}</span>` : ''}
        <span class="pill ${owner ? '' : 'none'}">${esc(owner ?? 'Anyone')}</span>
        <span>${esc(t.category)}</span>
      </div>
      ${t.notes ? `<p class="task-notes">${esc(t.notes)}</p>` : ''}
      ${steps ? `<ul class="prep"><li class="prep-label">Prep</li>${steps}</ul>` : ''}
    </article>`;
}

function renderTasks() {
  const groups = groupTasks(filteredTasks());
  $('#task-list').innerHTML = groups.length
    ? groups.map(([name, list]) => `<h2 class="group-title ${name === 'Overdue' ? 'overdue' : ''}">${esc(name)}</h2>${list.map(renderTask).join('')}`).join('')
    : `<p class="empty">${state.status === 'open' ? 'Nothing to do. Add a task above.' : 'No finished tasks yet.'}</p>`;
}

function renderBell() {
  const unread = state.notifications.filter((n) => !n.read).length;
  $('#bell-count').hidden = unread === 0;
  $('#bell-count').textContent = unread > 9 ? '9+' : unread;
}

// ---------------------------------------------------------------- Data loading

async function refresh() {
  if (!state.me) return;
  try {
    const [tasks, notifications] = await Promise.all([api('/api/tasks'), api('/api/notifications')]);
    state.tasks = tasks;
    state.notifications = notifications;
    renderTasks();
    renderBell();
  } catch (err) {
    if (err.status === 401) { state.me = null; showAuth(); }
  }
}

async function boot() {
  try {
    state.me = await api('/api/me');
  } catch {
    state.me = null;
    showAuth();
    return;
  }
  $('#auth-view').hidden = true;
  $('#app-view').hidden = false;
  renderHeader();
  await refresh();
  if (location.hash.startsWith('#task-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
}

// Keep both partners' screens in sync without websockets.
setInterval(refresh, 20_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

// ---------------------------------------------------------------- List interactions

$('#owner-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-owner]');
  if (!btn) return;
  state.ownerFilter = btn.dataset.owner;
  renderHeader();
  renderTasks();
});

$$('[data-status]').forEach((b) => b.addEventListener('click', () => {
  state.status = b.dataset.status;
  $$('[data-status]').forEach((x) => x.classList.toggle('active', x === b));
  renderTasks();
}));

$('#task-list').addEventListener('change', async (e) => {
  const complete = e.target.dataset.complete;
  const step = e.target.dataset.step;
  try {
    if (complete) {
      await api(`/api/tasks/${complete}`, { method: 'PATCH', body: { status: e.target.checked ? 'done' : 'open' } });
      toast(e.target.checked ? 'Nice, task done' : 'Task reopened');
    } else if (step) {
      await api(`/api/prep-steps/${step}`, { method: 'PATCH', body: { done: e.target.checked } });
    }
  } catch (err) {
    toast(err.message);
  }
  refresh();
});

$('#task-list').addEventListener('click', (e) => {
  const id = e.target.closest('[data-edit]')?.dataset.edit;
  if (id) openEditor(state.tasks.find((t) => t.id === Number(id)));
});

// ---------------------------------------------------------------- Composer & voice

$('#compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#compose-text').value.trim();
  if (!text) { $('#compose-text').focus(); return; }
  state.draft = { text, history: [], questions: [] };
  await runParse();
});

async function runParse() {
  const btn = $('#compose-submit');
  btn.disabled = true;
  btn.textContent = 'Thinking...';
  try {
    const now = new Date();
    const draft = await api('/api/parse', {
      method: 'POST',
      body: { text: state.draft.text, now: `${localDate(now)}T${localTime(now)} (${now.toLocaleDateString('en', { weekday: 'long' })})`, history: state.draft.history },
    });
    state.draft.questions = draft.questions;
    openEditor(null, draft);
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create task';
  }
}

$('#manual-btn').addEventListener('click', () => { state.draft = null; openEditor(null); });

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
  const mic = $('#mic-btn');
  mic.hidden = false;
  let rec = null;
  mic.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new Recognition();
    rec.lang = navigator.language || 'en-GB';
    rec.interimResults = true;
    rec.continuous = false;
    const base = $('#compose-text').value.trim();
    rec.onresult = (ev) => {
      const said = [...ev.results].map((r) => r[0].transcript).join('');
      $('#compose-text').value = base ? `${base} ${said}` : said;
    };
    rec.onerror = (ev) => toast(ev.error === 'not-allowed' ? 'Microphone permission denied' : 'Could not hear that');
    rec.onend = () => { mic.classList.remove('listening'); rec = null; };
    mic.classList.add('listening');
    rec.start();
  });
}

// ---------------------------------------------------------------- Task editor

const dialog = $('#task-dialog');
const form = $('#task-form');

function prepRow(step = { title: '', days: 1 }) {
  const li = document.createElement('li');
  if (step.id) li.dataset.id = step.id;
  if (step.done) li.dataset.done = '1';
  li.innerHTML = `
    <input class="prep-title" value="${esc(step.title)}" placeholder="e.g. Clear access to the boiler" aria-label="Prep step">
    <span class="days"><input class="prep-days" type="number" min="0" max="60" value="${Number(step.days) || 0}" aria-label="Days before"> days before</span>
    <button type="button" class="icon-btn remove" aria-label="Remove step">&times;</button>`;
  li.querySelector('.remove').addEventListener('click', () => li.remove());
  return li;
}

$('#add-prep').addEventListener('click', () => {
  const li = prepRow();
  $('#prep-list').append(li);
  li.querySelector('input').focus();
});

function renderReminderChecks(selected) {
  const choices = [...REMINDER_CHOICES];
  for (const m of selected) {
    if (!choices.some(([v]) => v === m)) choices.push([m, m >= 1440 ? `${Math.round(m / 1440)} days before` : m >= 60 ? `${Math.round(m / 60)} hours before` : `${m} min before`]);
  }
  choices.sort((a, b) => b[0] - a[0]);
  $('#reminder-checks').innerHTML = choices.map(([v, label]) =>
    `<label><input type="checkbox" value="${v}" ${selected.includes(v) ? 'checked' : ''}> ${esc(label)}</label>`).join('');
}

function renderQuestions() {
  const qs = state.draft?.questions ?? [];
  const box = $('#questions');
  box.hidden = qs.length === 0;
  if (!qs.length) return;
  box.innerHTML = `<p>A couple of things to check:</p>
    ${qs.map((q, i) => `<label>${esc(q)}<input data-question="${i}" placeholder="Your answer"></label>`).join('')}
    <div class="row-gap"><button type="button" id="answer-btn">Update draft</button>
    <span class="muted small">or just fill in the form below</span></div>`;
  $('#answer-btn').addEventListener('click', async () => {
    const answers = $$('[data-question]', box)
      .map((input) => ({ question: qs[Number(input.dataset.question)], answer: input.value.trim() }))
      .filter((a) => a.answer);
    if (!answers.length) return;
    state.draft.history.push(...answers);
    $('#answer-btn').disabled = true;
    await runParse();
  });
}

function openEditor(task, draft = null) {
  state.editing = task ?? null;
  $('#task-error').hidden = true;
  $('#task-dialog-title').textContent = task ? 'Edit task' : draft ? 'Check the details' : 'New task';
  $('#delete-task').hidden = !task;

  const { members, categories, user } = state.me;
  form.elements.owner_id.innerHTML = `<option value="">Anyone</option>${members.map((m) => `<option value="${m.id}">${esc(m.name)}${m.id === user.id ? ' (me)' : ''}</option>`).join('')}`;
  form.elements.category.innerHTML = categories.map((c) => `<option>${esc(c)}</option>`).join('');

  let values;
  if (task) {
    const due = task.due_at ? new Date(task.due_at) : null;
    values = {
      title: task.title, notes: task.notes, category: task.category,
      date: due ? localDate(due) : '', time: due ? localTime(due) : '',
      owner_id: task.owner_id ?? '', reminders: task.reminder_offsets,
      steps: task.prep_steps.map((s) => ({ id: s.id, title: s.title, done: s.done, days: daysBefore(task.due_at, s.due_at) })),
    };
  } else if (draft) {
    values = {
      title: draft.title, notes: draft.notes, category: draft.category,
      date: draft.due_date ?? '', time: draft.due_time ?? '',
      owner_id: draft.owner_id ?? '', reminders: draft.reminder_offsets_minutes?.length ? draft.reminder_offsets_minutes : [1440, 60],
      steps: draft.prep_steps.map((s) => ({ title: s.title, days: s.days_before })),
    };
  } else {
    values = { title: '', notes: '', category: 'other', date: '', time: '', owner_id: user.id, reminders: [1440, 60], steps: [] };
  }

  form.elements.title.value = values.title;
  form.elements.notes.value = values.notes;
  form.elements.category.value = values.category;
  form.elements.date.value = values.date;
  form.elements.time.value = values.time;
  form.elements.owner_id.value = String(values.owner_id);
  $('#prep-list').replaceChildren(...values.steps.map(prepRow));
  renderReminderChecks(values.reminders);
  if (!draft) state.draft = null;
  renderQuestions();
  if (!dialog.open) dialog.showModal();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const due = form.elements.date.value ? fromLocal(form.elements.date.value, form.elements.time.value) : null;
  const steps = $$('#prep-list li').map((li) => {
    const title = li.querySelector('.prep-title').value.trim();
    const days = Number(li.querySelector('.prep-days').value) || 0;
    return {
      ...(li.dataset.id ? { id: Number(li.dataset.id) } : {}),
      title,
      due_at: prepDueAt(due, days)?.toISOString() ?? null,
    };
  }).filter((s) => s.title);
  const body = {
    title: form.elements.title.value.trim(),
    notes: form.elements.notes.value,
    category: form.elements.category.value,
    due_at: due ? due.toISOString() : null,
    owner_id: form.elements.owner_id.value ? Number(form.elements.owner_id.value) : null,
    reminder_offsets: $$('#reminder-checks input:checked').map((i) => Number(i.value)),
    prep_steps: steps,
  };
  if (!state.editing && state.draft) body.source_text = state.draft.text;
  try {
    if (state.editing) await api(`/api/tasks/${state.editing.id}`, { method: 'PATCH', body });
    else await api('/api/tasks', { method: 'POST', body });
    dialog.close();
    if (!state.editing) $('#compose-text').value = '';
    state.draft = null;
    toast(state.editing ? 'Task updated' : 'Task added');
    refresh();
  } catch (err) {
    $('#task-error').textContent = err.message;
    $('#task-error').hidden = false;
  }
});

$('#delete-task').addEventListener('click', async () => {
  if (!state.editing || !confirm(`Delete "${state.editing.title}"?`)) return;
  await api(`/api/tasks/${state.editing.id}`, { method: 'DELETE' });
  dialog.close();
  toast('Task deleted');
  refresh();
});

$$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

// ---------------------------------------------------------------- Notifications

$('#bell-btn').addEventListener('click', async () => {
  $('#notes-list').innerHTML = state.notifications.length
    ? state.notifications.map((n) => `<li class="${n.read ? '' : 'unread'}">${esc(n.title)}: ${esc(n.body)}<time>${esc(friendlyDate(n.created_at))}</time></li>`).join('')
    : '<li class="muted">Nothing yet. Reminders and updates from your household show up here.</li>';
  $('#notes-dialog').showModal();
  if (state.notifications.some((n) => !n.read)) {
    await api('/api/notifications/read', { method: 'POST' });
    state.notifications.forEach((n) => { n.read = true; });
    renderBell();
  }
});

// ---------------------------------------------------------------- Settings & push

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function pushStatus() {
  const el = $('#push-status');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.textContent = /iPhone|iPad/.test(navigator.userAgent)
      ? 'On iPhone, first tap Share > Add to Home Screen, then open the app from your home screen to enable notifications.'
      : 'This browser does not support push notifications. You will still see reminders in the bell.';
    $('#enable-push').hidden = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  el.textContent = Notification.permission === 'denied'
    ? 'Notifications are blocked for this site in your browser settings.'
    : sub ? 'Notifications are on for this device.' : 'Turn on notifications to get reminders on this device.';
  $('#enable-push').hidden = Boolean(sub) || Notification.permission === 'denied';
}

$('#enable-push').addEventListener('click', async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { toast('Notifications not allowed'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(state.me.vapidPublicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
    toast('Notifications enabled');
  } catch (err) {
    toast(`Could not enable notifications: ${err.message}`);
  }
  pushStatus();
});

$('#test-push').addEventListener('click', async () => {
  await api('/api/push/test', { method: 'POST' });
  toast('Test sent');
  refresh();
});

$('#settings-btn').addEventListener('click', () => {
  const { household, members, user } = state.me;
  $('#household-form [name=name]').value = household.name;
  $('#invite-code').textContent = household.invite_code;
  $('#member-list').innerHTML = members.map((m) => `<li>${esc(m.name)} <span class="muted small">${esc(m.email)}</span></li>`).join('');
  $('#signed-in-as').textContent = `Signed in as ${user.email}`;
  pushStatus();
  $('#settings-dialog').showModal();
});

$('#copy-invite').addEventListener('click', async () => {
  const code = state.me.household.invite_code;
  const link = `${location.origin}/?invite=${code}`;
  try {
    await navigator.clipboard.writeText(`Join our household app: ${link} (invite code ${code})`);
    toast('Invite link copied');
  } catch {
    toast(link);
  }
});

$('#household-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  state.me.household = await api('/api/household', { method: 'PATCH', body: { name: e.target.elements.name.value } });
  renderHeader();
  toast('Renamed');
});

$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const inviteCode = e.target.elements.inviteCode.value.trim();
  if (!inviteCode || !confirm('Move to that household? Your tasks come with you if nobody else is left in this one.')) return;
  try {
    await api('/api/household/join', { method: 'POST', body: { inviteCode } });
    $('#settings-dialog').close();
    await boot();
    toast('Joined household');
  } catch (err) {
    toast(err.message);
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  $('#settings-dialog').close();
  state.me = null;
  showAuth();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
boot();
