# Household: Google Sheets edition (free)

The same household task app, running entirely on a Google account at no cost:

- **The Google Sheet is the database**, and you can edit it directly. Tabs: `Tasks`, `Members` (each person's notification preferences), `Settings` and `Activity` (a log of every change).
- **The app** is a Google Apps Script web app attached to the sheet. It's phone-friendly: plain-language task entry with prep-step detection, owners, repeating tasks, prep checklists, an in-app chat assistant ("I'll take the gutters", "move it to Friday 10am", "done"), and an activity feed.
- **Reminders and updates go by email** from a 5-minute timer. Each person gets them worded for them ("You're on it" / "Sara is on it" / "Nobody has taken it yet"), plus an optional morning summary.
- **Google Calendar sync** (optional): tasks with a date become calendar events with alerts, and partners are added as guests.
- **Claude in the app (optional):** the chat and the microphone understand full sentences by calling the Claude API from the script. The API key is kept in the script's Script Properties, so it's never in the sheet or the page. Without a key, the app uses the simple rules, and says so.
- **Microphone:** speech becomes text in the task box or chat. You check it and tap Send. Replies can be read aloud, per phone.

Only people the sheet is shared with (as Editors) can use the app. Each person signs in with their own Google account.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Everything server-side: sheet setup, task logic, repeats, reminder emails, calendar sync, the chat (Claude or simple rules) |
| `Parser.gs` | The offline language parser. **Generated** from `src/ai/rulesParser.js` and `src/chat/rulesInterpreter.js` by `npm run build:sheets`, so both editions understand the same phrases |
| `Index.html` | The web app page |
| `appsscript.json` | Manifest, only needed if you use `clasp` |
| `test/` | An in-memory imitation of the Apps Script services plus tests (`npm test`), and a local preview (`npm run preview:sheets`, then open `http://localhost:3200/?as=naser@example.com`) |

## Installing

The non-technical step-by-step guide is linked from the project conversation. In short:

1. Create a Google Sheet, then open **Extensions → Apps Script**.
2. Replace `Code.gs` with this folder's `Code.gs`. Add a script file named `Parser` (paste `Parser.gs`) and an HTML file named `Index` (paste `Index.html`). Save.
3. Choose `setup` in the function menu and click **Run**. Approve the permissions; Google warns that the app is unverified because it's your own script, so use **Advanced → Go to … (unsafe)**.
4. **Deploy → New deployment → Web app**, with *Execute as: User accessing the web app* and *Who has access: Anyone with Google account*. Open the `/exec` link it gives you.
5. Share the sheet with your partner as an **Editor** and send them the link.

**Updating the code later:** paste the new files, then use **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The link stays the same.

### Turning on Claude in the app (optional)

1. Create a developer key at platform.claude.com (API keys), and add a small credit with auto-reload **off**. This is billed separately from a Claude Pro subscription.
2. In the script editor, click the gear icon (Project Settings), then **Script Properties → Add script property**. Name it `ANTHROPIC_API_KEY` and paste the key.
3. Open the app, approve the "connect to an external service" permission when Google asks, and check the chat header says **Powered by Claude**.

Changes to Claude's behaviour are made in `askClaude_`'s prompt (the `CHAT_SYSTEM_PROMPT` constant in `Code.gs`). Claude's answers are checked before anything changes: unknown actions and task numbers that don't exist are dropped, and a failed request falls back to the simple rules with a note saying so. The model is `claude-opus-5-5`; it can be changed in `CLAUDE_MODEL`.

## Limits

- Reminders can be up to 5 minutes late, because the timer runs every 5 minutes.
- Free Gmail accounts can send about 100 emails a day from scripts, which is plenty for a household.
- When a task is edited directly in the sheet by someone other than the sheet's owner, Google may not reveal who made the edit, so it's logged as "Someone (in the sheet)".
- Google shows a small "created by a Google Apps Script user" banner above the app.
- There's no WhatsApp in this edition. Telegram is the free option for a two-way group chat if you want one later.
