# Household: Google Sheets edition (free)

The same household task app, running entirely on a Google account at no cost:

- **The Google Sheet is the database**, and you can edit it directly. Tabs: `Tasks`, `Members` (each person's notification preferences), `Settings` and `Activity` (a log of every change).
- **The app** is a Google Apps Script web app attached to the sheet. It's phone-friendly: plain-language task entry with prep-step detection, owners, repeating tasks, prep checklists, an in-app chat assistant ("I'll take the gutters", "move it to Friday 10am", "done"), and an activity feed.
- **Reminders and updates go by email** from a 5-minute timer. Each person gets them worded for them ("You're on it" / "Sara is on it" / "Nobody has taken it yet"), plus an optional morning summary.
- **Google Calendar sync** (optional): tasks with a date become calendar events with alerts, and partners are added as guests.
- **Claude connector (MCP), experimental:** a second deployment of the same script lets Claude read and change tasks. Claude does the language understanding, so there's no API bill.

Only people the sheet is shared with (as Editors) can use the app. Each person signs in with their own Google account.

## Files

| File | What it is |
|---|---|
| `Code.gs` | Everything server-side: sheet setup, task logic, repeats, reminder emails, calendar sync, the web app endpoints and the MCP endpoint |
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

### Connecting Claude (experimental)

1. **Deploy → New deployment → Web app**, with *Execute as: Me* and *Who has access: Anyone*. Copy the `/exec` link.
2. Copy the **Assistant key** from the sheet's `Settings` tab.
3. In Claude, add a custom connector with the URL `<that link>?key=<assistant key>`.

Tools: `get_household`, `list_tasks`, `add_task`, `update_task`, `delete_task`. Anyone with the full URL can change tasks, so keep it private. To revoke access, clear the key in `Settings` and run `setup` again.

This hasn't been verified against a live Claude connector yet. Apps Script answers POST requests with a redirect, and not every connector client follows that.

## Limits

- Reminders can be up to 5 minutes late, because the timer runs every 5 minutes.
- Free Gmail accounts can send about 100 emails a day from scripts, which is plenty for a household.
- When a task is edited directly in the sheet by someone other than the sheet's owner, Google may not reveal who made the edit, so it's logged as "Someone (in the sheet)".
- Google shows a small "created by a Google Apps Script user" banner above the app.
- There's no WhatsApp in this edition. Telegram is the free option for a two-way group chat if you want one later.
