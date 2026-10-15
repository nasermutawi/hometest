# Spec: An instant, smooth app (app-wide) and swipe gestures

**Edition:** Google Sheets edition only — `docs/index.html` (the app on GitHub Pages) and `google-sheets/Code.gs` (the Apps Script server). The Node.js edition (`src/`, `public/`) is out of scope.

**Goal:** the whole app feels instant and smooth — every screen and every action, not just the task list. The app opens straight onto the tasks, nothing waits on the network unless it truly has to, and task rows support swipe gestures. The user will test performance across the app, so this must be one consistent approach, not a fix for one button.

**Sync expectations:** the two people use the app on their own time, not side by side. It's fine if the other person's changes only appear when the app is opened or brought back to the front. Instant sync between phones is **not** needed.

## Why it feels slow today

- `toggleDone()` in `docs/index.html` calls `run('setTaskDone', …)` and only updates the screen when the reply arrives. An Apps Script web-app request takes roughly 1–4 seconds (redirect, cold start, sheet reads), so the tick lags.
- Every write (`saveTask`, `setTaskDone`, `setPrepDone`, `deleteTask`) does the same, and every server write ends with `getState()`, which re-reads the Settings, Members and Tasks tabs and returns the whole household state.
- On open, the app shows nothing until the first `getState` returns.
- The 30-second refresh (`setInterval(… load …, 30000)`) can land while a write is in flight and overwrite what the user just did.

## 0. One app-wide approach

Build a single data layer that every screen goes through, instead of patching individual buttons.

- **One write path:** a helper (for example `mutate(applyLocally, serverCall)`) that applies the change to local state, re-renders, queues the server call, reconciles the reply, and rolls back on failure. No screen calls `run()` directly for a write.
- **Audit every server call** and put it in one of two groups. List the result in the pull request. Today's calls are:
  - **Instant (optimistic):** `setTaskDone`, `deleteTask`, `setPrepDone`, `saveTask` (every place that uses it: task page fields, date/time sheet, owner and repeat choosers, the edit form, the review screen), `discardCapture`, `savePreferences`.
  - **Needs the server's answer:** `capture` and `editByVoice` (the server understands the words), `addPerson` and `linkFor` (the server creates links and sends email), `getActivity`. These must **never freeze the screen**: respond to the tap at once, show progress where the result will appear, and keep the rest of the app usable. For example, after a recording, show the spoken text straight away as an "Understanding…" row that turns into the real task(s) when the reply arrives.
- **Navigation never waits:** opening a task, switching filters, going back, and opening sheets and dialogs all render from local state with no network wait.
- **Any new feature** added later must use the same write path. Note this in a comment at the top of the data layer.

## 1. Optimistic updates (the main fix)

Change the local state and re-render first; send to the server in the background. This applies to everything in the "Instant" group above.
- **Done animation:** the tick fills immediately (target under 100 ms from tap), the row shows as done (strike-through or fade), then the row leaves the open list after about 400 ms. Respect `prefers-reduced-motion`.
- **Repeating tasks:** show "Done" straight away. When the reply arrives with `next`, insert the next occurrence and show the "Next one on …" toast.
- **Write queue:** send writes one at a time, in order. Quick repeated taps on the same task (done → undo → done) must end in the right final state; collapse them where possible.
- **Reconciling replies:** a server reply must never overwrite a local change that is still queued. Apply server data once the queue is empty, or merge task by task.
- **Failure:** if a write fails after the existing retry, revert that change, re-render, and show a toast: "Couldn't save. Check your connection." with a **Retry** action.

## 2. Instant open

- Keep the last good `getState` result in `localStorage`, keyed by the person's link key. Wrap every read and write in try/catch, since storage can be unavailable.
- On launch, render the cached state immediately, then refresh in the background and re-render quietly.
- Clear the cache on a link error (`err.code === 'link'`), and never render cached data for a different key.

## 3. Refresh behaviour

- Refresh when the app opens and whenever it comes back to the front (`visibilitychange`). That's the main way the other person's changes arrive.
- Keep a gentle periodic refresh only while the app is visible, at 60 seconds instead of 30. That's fewer server calls, and live sync isn't needed.
- Skip any refresh while writes are queued and for about 3 seconds after the last one finishes.
- A background refresh must never jump the screen: keep the scroll position, any open swipe, open sheets, and anything being typed.

## 4. Lighter server work (Code.gs)

- **Slim replies:** the write functions accept an optional last argument `{ slim: true }`. When it's present, return only what changed, for example `{ slim: true, task, next, deletedId, now }`, instead of the full `getState()`.
- **Compatibility, which is important:** GitHub Pages updates as soon as the repo changes, but Code.gs only updates when the user pastes it in and deploys a new version. So the new `index.html` must work with **both** the old server (full-state replies) and the new one (slim replies). The old server ignores the extra argument, so the client just needs to handle both reply shapes.
- **Cache Settings and Members** in `CacheService` (for example, 5 minutes), cleared whenever the app writes to those tabs. Make sure manual edits to the sheet still take effect within that time.
- **Don't read the Tasks tab twice** in one request (for example, `taskById_` and then `getState`).
- **Keep slow services out of requests:** confirm that no request path calls `CalendarApp` or `MailApp`. Calendar sync and emails should only run from the timed trigger, which appears to be the case today.
- **Measure:** time the main calls before and after the change (for example `getState`, `setTaskDone`, `deleteTask`) and report the numbers.

## 5. Swipe gestures on task rows

On the Tasks list, in every group:

- **Swipe right → Done** (green, tick icon). On a done task it shows **Reopen** instead. A full swipe (past about 60% of the row width) completes it. A shorter swipe springs back.
- **Swipe left → Delete** (red, bin icon). A full swipe deletes it. A partial swipe snaps open to show a **Delete** button. Tapping anywhere else closes it.
- **Only one row open at a time.**
- **Delete without a confirmation popup:** the row collapses straight away and a "Deleted" toast shows **Undo** for about 6 seconds.
  - Hold the server delete until the undo window ends. If the app is hidden or closed before then, send it right away (`visibilitychange` / `pagehide`, using `fetch` with `keepalive`).
  - Undo puts the row back without anything reaching the server.
  - Deleting a repeating task keeps whatever the task page's Delete does today.
- **Feel:** the row follows the finger. Lock to horizontal or vertical after about 10 px, so scrolling the list never triggers a swipe. Give a short vibration where supported (`navigator.vibrate(10)`) when crossing the full-swipe point. Respect `prefers-reduced-motion`.
- **Accessibility:** swipes are extra. The tick button and the Delete on the task page stay as they are.
- Use pointer events so it works on both iPhone and Android, plus mouse on desktop.

## 6. Small touches

- Visible pressed state on rows and buttons.
- A subtle indicator (not a blocking spinner) while a background refresh or save is in progress.

## 7. Performance testing aid

The user wants to test performance on their own phone, so build a simple way to see it:

- Opening the app with `?perf=1` in the link (remembered until turned off) shows a small panel listing recent actions: what was tapped, **time until the screen changed**, **server time**, and whether it succeeded or failed.
- The panel has a **Copy** button that copies the log as text, so it can be pasted into a chat.
- In the preview, add switches for **slow server** (about 3 seconds) and **failing server**, so rollbacks and progress states can be checked.
- Hidden completely when `perf` is off, with no cost to normal use.

## Not in this change

- Live updates between phones (needs the hosted backend; see `BACKLOG.md`).
- The Node.js edition.
- Moving off Google Sheets.

## How to work

- Work on a new branch off `claude/household-task-app-mfl3pq` and open a pull request. Don't push to the live branch, since GitHub Pages serves from it.
- Use the existing preview stand-in server (`window.householdApi`, `google-sheets/test/preview-server.mjs`) to try it out. Add a way to simulate slow and failed requests in the preview.
- Keep the existing tests passing (`google-sheets/test`, `test/`) and add tests for the slim replies and the Settings/Members cache.

## Done when

- [ ] Every server call is listed in the pull request as "instant" or "needs the server", and every write goes through the one data layer.
- [ ] No action anywhere in the app freezes the screen while waiting for the server.
- [ ] Tapping the tick shows the change in under 100 ms, including on a slow connection.
- [ ] Changing owner, date, repeat, notes or a prep step shows instantly, both on the task page and back on the list.
- [ ] After a recording, the spoken text appears immediately and turns into the task(s) when the server replies.
- [ ] A background refresh never moves the scroll position or closes what's open.
- [ ] The `?perf=1` panel shows timings and the log can be copied.
- [ ] With the connection off, tapping done reverts with a clear message, and Retry works once it's back on.
- [ ] Tapping done, undo, done quickly ends with the task done on both the screen and the sheet.
- [ ] Swipe right completes a task; swipe left deletes it; Undo brings it back and the sheet never loses it.
- [ ] Scrolling the list up and down never triggers a swipe.
- [ ] Reopening the app shows the task list immediately from the cache.
- [ ] The new `index.html` works against both the old and the new `Code.gs`.
- [ ] Before/after timings for the main calls are reported.
- [ ] All tests pass.

## Hand-back to the user

When finished, give the user plain steps for:

1. Trying the preview on their phone, including how to turn on the `?perf=1` panel.
2. Updating the server: paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
3. Merging the pull request so the app on GitHub Pages updates.
