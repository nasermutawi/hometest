# Household: Google Sheets edition (free)

The household task app, running entirely on a Google account at no cost:

- **The Google Sheet is the database**, and you can edit it directly. Tabs: `Tasks`, `Members` (each person's notification preferences), `Settings` and `Activity` (a log of every change).
- **The app** is a Google Apps Script web app attached to the sheet, designed for phones:
  - It **opens on a big microphone**. Say one or several things ("On Friday I need to pick up the dry cleaning and buy a present for Mum. Also we need to book the dentist"). Each becomes its own task, and they're saved the moment you stop talking. A sheet shows what was understood with **Review** and **Save**. If you do nothing it closes after 5 seconds; **Discard** or **Undo** removes them again.
  - **Who owns it** comes from the words: a name → that person, "I/me" → whoever is speaking, "you" → the other person, "we/us/let's" → **Shared**, nothing said → **Unassigned**.
  - **Tasks** (the list) has filters (All, Mine, the other person's, Shared, Done), an amber strip for tasks that need a date, and a bottom bar with **+** (type a task with date and time chips), the microphone and settings.
  - **A task's page** shows when, who, repeats, prep steps and notes, all tappable. **Say what to change** edits that task by voice ("make it Tuesday at 4 and remind me to find the insurance card the day before"); what changed is highlighted, with Undo.
  - No microphone (or it's blocked)? A typing box opens instead, and the keyboard's own microphone works there.
- **Reminders and updates go by email** from a 5-minute timer, worded for each person ("You're on it" / "Sara is on it" / "It's shared" / "Nobody has taken it yet"), plus an optional morning summary.
  - A task with a time gets its usual reminders (default 1 day and 1 hour before) to both people.
  - A task with a **date but no time** gets one **evening-before nudge** at 18:00 instead, with a **Pick a time** link that opens the app on that task with one-tap times (9:00, 13:00, 19:00). It goes to the owner only, or to both people when the task is Shared or Unassigned.
  - The nudge time and the quick times are in the `Settings` tab.
- **Google Calendar sync** (optional): tasks with a date become calendar events with alerts, and partners are added as guests.
- **Claude (optional):** with an API key the app understands free-form speech (splitting, owners, dates, edits) by calling the Claude API from the script. The key is kept in Script Properties, never in the sheet or the page. Without a key, simple rules are used: they work best with one thing per sentence, or words like "also" between things.

Only people the sheet is shared with (as Editors) can use the app. Each person signs in with their own Google account.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Everything server-side: sheet setup, task logic, capture and voice edits, repeats, reminder emails, calendar sync, Claude or the simple rules |
| `Parser.gs` | The offline language parser. **Generated** from `src/ai/rulesParser.js` and `src/chat/rulesInterpreter.js` by `npm run build:sheets` |
| `Index.html` | The web app page |
| `appsscript.json` | Manifest, only needed if you use `clasp` |
| `test/` | An in-memory imitation of the Apps Script services plus tests (`npm test`), and a local preview (`npm run preview:sheets`, then open `http://localhost:3200/?as=naser@example.com` and, in another window, `?as=sara@example.com`) |

## Installing

The non-technical step-by-step guide is linked from the project conversation. In short:

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace `Code.gs` with this folder's `Code.gs`. Add a script file named `Parser` (paste `Parser.gs`) and an HTML file named `Index` (paste `Index.html`). Save.
3. Choose `setup` in the function menu and click **Run**. Approve the permissions; Google warns that the app is unverified because it's your own script, so use **Advanced → Go to … (unsafe)**.
4. **Deploy → New deployment → Web app**, with *Execute as: User accessing the web app* and *Who has access: Anyone with Google account*. Open the `/exec` link it gives you.
5. Share the sheet with your partner as an **Editor** and send them the link.

**Updating the code later:** paste the new files, run `setup` once more (it adds new settings and keeps your data), then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The link stays the same.

### Testing with two people

Use two Google accounts, each in its own browser profile or one in a private (incognito) window. Google Apps Script web apps get confused when several Google accounts are signed in to the same browser window. On phones, each person uses their own phone.

### Turning on Claude (optional)

1. Create a developer key at platform.claude.com (API keys), and add a small credit with auto-reload **off**. This is billed separately from a Claude Pro subscription.
2. In the script editor, click the gear icon (Project Settings), then **Script Properties → Add script property**. Name it `ANTHROPIC_API_KEY` and paste the key.
3. Open the app and approve the "connect to an external service" permission when Google asks. **Settings → More** says which one is in use.

Claude's instructions are in `capturePrompt_`, `editPrompt_` and `chatPrompt_` in `Code.gs`. Its answers are checked before anything changes (unknown people become Unassigned, unknown tasks and actions are dropped), and a failed request falls back to the simple rules. The model is set in `CLAUDE_MODEL`.

## Limits

- Reminders can be up to 5 minutes late, because the timer runs every 5 minutes.
- Free Gmail accounts can send about 100 emails a day from scripts, which is plenty for a household.
- Whether the in-app microphone works depends on the browser: Chrome on Android and desktop usually works. If it doesn't, the app opens a typing box, where the keyboard's microphone does the same job.
- Without Claude, dictation that has no pauses or punctuation may come out as one task. Say "also" between things, or edit afterwards.
- When a task is edited directly in the sheet by someone other than the sheet's owner, Google may not reveal who made the edit, so it's logged as "Someone (in the sheet)".
- Google shows a small "created by a Google Apps Script user" banner above the app.
- There's no WhatsApp in this edition. Telegram is the free option for a two-way group chat if you want one later.
