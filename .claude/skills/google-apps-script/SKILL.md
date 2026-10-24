---
name: google-apps-script
description: Write, fix or review Google Apps Script (.gs) code — Sheets as a database, web apps (doGet/doPost) serving JSON, time-driven triggers, LockService, CacheService, PropertiesService, MailApp and UrlFetchApp — staying inside Apps Script's quotas. Use for any Apps Script server code, such as Melody's Code.gs and Parser.gs.
---

# Google Apps Script

Apps Script runs JavaScript (V8) on Google's servers, tied to a Google account. It is slow per call, generous per day, and strict about quotas. Most bugs and slowness come from treating it like a normal server.

## The ten rules

1. **Read and write sheets in bulk.** One `getDataRange().getValues()` per request, then work on the array; write back with one `setValues()` per block. A `getValue()` or `setValue()` inside a loop is the most common cause of slow scripts.
2. **Cache what rarely changes.** `CacheService.getScriptCache()` for settings and member lists (default life 10 minutes, maximum 6 hours, 100KB per key, about 1,000 items). Clear the key whenever the app writes that data. People can still edit the sheet by hand, so keep cache lifetimes short.
3. **Lock around read-modify-write.** `LockService.getScriptLock()`, then `waitLock(ms)` (throws when it times out) or `tryLock(ms)` (returns false). Keep the locked section short; release it in `finally`. Two phones saving at the same moment is the case this guards.
4. **Keep secrets and small settings in Properties.** `PropertiesService.getScriptProperties()` for API keys and per-person link keys. Limits: 9KB per value, 500KB per store. Never put secrets in the sheet.
5. **Web apps answer through `doGet` / `doPost`.** Return JSON with `ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)`. Google redirects the response to a one-time `script.googleusercontent.com` URL, so the client must follow redirects (`fetch` does by default; `redirect: 'follow'`).
6. **Calls from another website must be "simple" requests.** Apps Script can't set CORS headers or answer preflight requests. POST a plain-text body (no custom headers, no `Content-Type: application/json`) and parse `e.postData.contents` with `JSON.parse`.
7. **A code change isn't live until you deploy a new version.** Deploy → Manage deployments → edit → Version: New version → Deploy. Keep the same deployment so the web app URL stays the same. Say this step to the user every time server code changes.
8. **Slow or heavy work goes to triggers, not requests.** Emails, calendar sync and clean-ups run from a time-driven trigger (`ScriptApp.newTrigger(name).timeBased().everyMinutes(n).create()`); requests stay quick. Check for an existing trigger before creating one, or they multiply.
9. **Handle outside calls defensively.** `UrlFetchApp.fetch(url, {muteHttpExceptions: true, ...})`, then check `getResponseCode()` before parsing; fall back gracefully if the service is down.
10. **Dates and times use the script's time zone.** `Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd')`; never rely on the runtime's local time.

## Quotas (consumer gmail.com accounts, checked October 2026)

| Limit | Value |
| --- | --- |
| Runtime per execution | 6 min |
| Simultaneous executions | 30 per user |
| Time-driven trigger runtime | 90 min per day in total |
| Triggers | 20 per user per script |
| Email recipients (MailApp) | 100 per day |
| URL Fetch calls | 20,000 per day |
| Properties | 9KB per value, 500KB per store |
| CacheService | 100KB per key, 6 hours max, about 1,000 items |

Source: [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas). Quotas change; check that page when a limit matters.

## Common traps

- `SpreadsheetApp.flush()` only when a later step must see writes (for example before sending an email that reads them back); it costs time.
- Deleting rows in a loop: go from the bottom up, or row numbers shift.
- `Session.getActiveUser().getEmail()` is often empty for web apps run "as me" and accessed by others; identify users another way (Melody uses a personal key in each request).
- Triggers run as the person who created them; their quota and permissions apply.
- `console.log` goes to the Executions log in the script editor; it's the only debugger for web app and trigger runs.
- A web app's first request after a while is slower (cold start). Design the client to stay responsive (optimistic updates) rather than wait.

## References in this skill

- `references/samples/`: short, real Google samples (Apache 2.0) for triggers (`triggers.gs`), sending emails (`sending-emails.gs`), locks and cache (`lock-and-cache.gs`, `properties-and-lock.gs`), a `doGet` web app (`webapp-doget.gs`) and calling a JSON API with `UrlFetchApp` (`urlfetch-json.gs`). Read the one that matches the task.
- `references/sample-docs/`: the README of every sample in Google's repository, sorted by topic by Skill Seekers. Use `documentation_index.json` to find one.
- Full samples: [googleworkspace/apps-script-samples](https://github.com/googleworkspace/apps-script-samples). Reference docs: [developers.google.com/apps-script](https://developers.google.com/apps-script).

See `SOURCES.md` for how this skill was built.
