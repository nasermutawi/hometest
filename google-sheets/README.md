# Household: Google Sheets edition (free)

The household task app, running entirely on a Google account at no cost:

- **The Google Sheet is the database**, and you can edit it directly. Tabs: `Tasks`, `Members` (each person's notification preferences), `Settings` and `Activity` (a log of every change).
- **The app** is a web page on GitHub Pages (the repository's `docs/` folder), designed for phones. It talks to a small private server: the Google Apps Script attached to the sheet. Each person opens the app with a **personal link** that carries their key, so nobody signs in to Google on their phone. People are added from the app (**Settings → People → Add a person**), which gives you their link to send them.
  - It **opens on a big microphone**. Say one or several things ("On Friday I need to pick up the dry cleaning and buy a present for Mum. Also we need to book the dentist"). Each becomes its own task, and they're saved the moment you stop talking. A sheet shows what was understood with **Review** and **Save**. If you do nothing it closes after 5 seconds; **Discard** or **Undo** removes them again.
  - **Who owns it** comes from the words: a name → that person, "I/me" → whoever is speaking, "you" → the other person, "we/us/let's" → **Shared**, nothing said → **Unassigned**.
  - **Tasks** (the list) has filters (All, Mine, the other person's, Shared, Done), an amber strip for tasks that need a date, and a bottom bar with **+** (type a task with date and time chips), the microphone and settings. **Swipe a task right** to mark it done (or reopen it), **left** to delete it, with **Undo** for a few seconds.
  - **Everything is instant:** a tick, a new owner, a date or a note shows at once and is saved in the background, one change at a time. If saving fails, the change is undone on screen with a **Retry** button. The app opens straight away from the copy kept on the phone, then quietly fetches the latest. The other person's changes arrive when the app is opened or brought back to the front, and every minute while it's open.
  - **A task's page** shows when, who, repeats, prep steps and notes, all tappable. **Say what to change** edits that task by voice ("make it Tuesday at 4 and remind me to find the insurance card the day before"); what changed is highlighted, with Undo.
  - No microphone (or it's blocked)? A typing box opens instead, and the keyboard's own microphone works there.
- **Reminders and updates go by email** from a 5-minute timer, worded for each person ("You're on it" / "Sara is on it" / "It's shared" / "Nobody has taken it yet"), plus an optional morning summary.
  - A task with a time gets its usual reminders (default 1 day and 1 hour before) to both people.
  - A task with a **date but no time** gets one **evening-before nudge** at 18:00 instead, with a **Pick a time** link that opens the app on that task with one-tap times (9:00, 13:00, 19:00). It goes to the owner only, or to both people when the task is Shared or Unassigned.
  - The nudge time and the quick times are in the `Settings` tab.
- **Google Calendar sync** (optional): tasks with a date become calendar events with alerts, and partners are added as guests.
- **Claude (optional):** with an API key the app understands free-form speech (splitting, owners, dates, edits) by calling the Claude API from the script. The key is kept in Script Properties, never in the sheet or the page. Without a key, simple rules are used: they work best with one thing per sentence, or words like "also" between things.

Only people with a personal link can use the app, and each link acts as that one person. Removing someone from the Members tab switches their link off. If a link leaks, make a fresh one in the script editor (`linkFor('Sara', true)`): the old one stops working. Keys live in Script Properties, never in the sheet.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Everything server-side: sheet setup, the app's API (`doPost`) and personal links, task logic, capture and voice edits, repeats, reminder emails, calendar sync, Claude or the simple rules |
| `Parser.gs` | The offline language parser. **Generated** from `src/ai/rulesParser.js` and `src/chat/rulesInterpreter.js` by `npm run build:sheets` |
| `../docs/index.html` | The app itself, served by GitHub Pages |
| `appsscript.json` | Manifest, only needed if you use `clasp` |
| `test/` | An in-memory imitation of the Apps Script services plus tests (`npm test`), a local preview (`npm run preview:sheets`, then open `http://localhost:3200/?as=naser@example.com`; add Sara in Settings → People, then open `?as=sara@example.com` in another window), and `measure.mjs`, which counts the sheet reads and writes each call makes |

## Installing

The non-technical step-by-step guide is linked from the project conversation. In short:

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace `Code.gs` with this folder's `Code.gs`, and add a script file named `Parser` with `Parser.gs`. Save. (No HTML file is needed any more.)
3. Choose `setup` in the function menu and click **Run**, approving the permissions.
4. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*. The app's key, not a Google sign-in, decides who may use it.
5. Choose `myLink` and click **Run**. The log shows your personal link. (If it asks, paste the web app link, ending in `/exec`, into the **Server address** row of the Settings tab first.)
6. In GitHub: **Settings → Pages → Deploy from a branch**, branch `claude/household-task-app-mfl3pq`, folder `/docs`. The app appears at `https://nasermutawi.github.io/hometest/` (the **App address** setting).
7. Open your link on your phone, add it to the home screen, then add your partner in **Settings → People** and send them their link.

**Updating the code later:** paste the new `Code.gs`/`Parser.gs`, run `setup` once more (it adds new settings and keeps your data), then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The app on GitHub Pages updates by itself when the repository changes.

### Turning on Claude (optional)

1. Create a developer key at platform.claude.com (API keys), and add a small credit with auto-reload **off**. This is billed separately from a Claude Pro subscription.
2. In the script editor, click the gear icon (Project Settings), then **Script Properties → Add script property**. Name it `ANTHROPIC_API_KEY` and paste the key.
3. In the script editor, run `setup` once more and approve the "connect to an external service" permission. **Settings → More** in the app says whether Claude is in use.

Claude's instructions are in `capturePrompt_`, `editPrompt_` and `chatPrompt_` in `Code.gs`. Its answers are checked before anything changes (unknown people become Unassigned, unknown tasks and actions are dropped), and a failed request falls back to the simple rules. The model is set in `CLAUDE_MODEL`.

## Checking speed

Add `?perf=1` to the app's link (before the `#`), e.g. `https://nasermutawi.github.io/hometest/?perf=1#s=…`. A small bar at the top then shows each action: how long until the screen changed and how long the server took. Tap **+** for the full list and **Copy** to paste it into a message. `?perf=0` turns it off again. In the local preview the panel also has **Slow server** and **Failing server** switches, for trying out what happens on a bad connection.

## Limits

- Reminders can be up to 5 minutes late, because the timer runs every 5 minutes.
- Free Gmail accounts can send about 100 emails a day from scripts, which is plenty for a household.
- Whether the in-app microphone works depends on the browser: Chrome on Android and desktop, and Safari on iPhone, usually work; an iPhone home-screen icon may not. When it doesn't, the app opens a typing box, where the keyboard's microphone does the same job.
- Saving takes a second or two in the background, because Google's free servers start up for each request; the screen doesn't wait for it. Turning the speech into tasks, adding a person and making a link do wait for the server, with progress shown in place.
- Settings and the Members list are remembered by the server for up to 5 minutes. Edits typed into those tabs take effect at once; changes made any other way (by another script, say) within 5 minutes. Removing someone always switches their link off at once.
- Without Claude, dictation that has no pauses or punctuation may come out as one task. Say "also" between things, or edit afterwards.
- When a task is edited directly in the sheet by someone other than the sheet's owner, Google may not reveal who made the edit, so it's logged as "Someone (in the sheet)".
- Google shows a small "created by a Google Apps Script user" banner above the app.
- There's no WhatsApp in this edition. Telegram is the free option for a two-way group chat if you want one later.
