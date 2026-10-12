# Household

A shared to-do app for a household (spouses, partners, housemates). Each person has their own account on their own device, and everyone in the household sees and edits the same tasks.

You describe a task in plain language, typed or spoken, for example:

> Plumber coming Thursday at 10am to fix the kitchen leak, Sara to handle it. We need to empty the cupboard under the sink before they arrive.

The app turns that into a task with a title, a date and time, an owner, a category, and **prep steps**: the things that have to happen beforehand. It picks up prep you mention ("empty the cupboard") and prep the task implies ("confirm the appointment the day before", "clear access to the work area"). If something essential is missing, like the date or who owns it, it asks. You check the draft, adjust it if needed, and save.

> **Two editions.** This README covers the full Node.js app (`src/`, `public/`). For a **free version that runs on a Google account**, with a Google Sheet as the database, email reminders, Google Calendar sync and optional Claude chat, see [google-sheets/README.md](google-sheets/README.md).

## Features (MVP)

- **Accounts and households.** Sign up, then share the invite code or link (Settings → Invite your partner) so the other person can join.
- **Plain-language task entry** with a microphone button (browser speech recognition) and follow-up questions for missing details.
- **Tasks** with date/time, owner (a member or "Anyone"), category, notes and editable prep steps. Each prep step is set as "N days before" the task.
- **Repeating tasks:** weekly, every 2 weeks, monthly, quarterly, every 6 months or yearly ("annual boiler service", "bins every Monday"). Completing one schedules the next, with the same owner and fresh prep steps, at the same local time even across clock changes.
- **Reminders go to everyone in the household**, worded for each person:
  - the owner: *"Boiler service" is due in 1 day (Tue 3 Nov, 09:00). You're on it.*
  - the other person: *... Sara is on it.*
  - when unassigned: *... Nobody has taken it yet. Reply "I'll take it" to claim it.*

  They fire at the chosen offsets before the task (1 week, 1 day, 2 hours, 1 hour, at the time) and when each prep step is due. Delivery is in-app (bell), **web push**, **WhatsApp** and **email** (when configured).
- **Household updates:** when one person adds, claims, reassigns, moves or finishes a task, the others are told ("Sara is taking care of 'Clear the gutters'").
- **Chat assistant**, in the app (speech-bubble icon) and **on WhatsApp**: "done", "I'll take it", "move it to Friday 10am", "give the bins to Sara", "add: water filter every 6 months", "what's due?". With Claude enabled it understands free-form sentences too. See [docs/whatsapp-setup.md](docs/whatsapp-setup.md).
- Filters (Everyone / Mine / partner / Unassigned) and grouping (Overdue, Today, Tomorrow, Next 7 days, Later).
- Installable as a home-screen app (PWA). Open screens refresh every 20 seconds so both people stay in sync. The household timezone is picked up from the browser automatically.

## Running it

Requires Node.js 22.13 or later. It uses the built-in `node:sqlite`, so there's nothing native to compile.

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start     # http://localhost:3000
npm test                                   # API, reminder and parser tests
```

To try it with two people, open the app in two browsers (or one normal and one private window), create an account in the first, and register in the second using the invite code from Settings.

### Configuration (environment variables)

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on Claude for understanding tasks. Without it the app uses a built-in offline parser that handles common phrasing (dates, times, names, common task types). |
| `CLAUDE_MODEL` | Override the model (default `claude-opus-5-5`). |
| `PORT` | HTTP port (default 3000). |
| `DATABASE_PATH` | SQLite file (default `data/household.db`). |
| `PUBLIC_URL` | Link used in reminder emails. |
| `SMTP_URL`, `MAIL_FROM` | Turns on email reminders, e.g. `smtps://user:pass@smtp.example.com`. |
| `WHATSAPP_*` | WhatsApp channel; see [docs/whatsapp-setup.md](docs/whatsapp-setup.md). |
| `VAPID_SUBJECT` | Contact for web push, e.g. `mailto:you@example.com`. VAPID keys are generated on first run and stored in the database. |
| `NODE_ENV=production` | Marks the session cookie as Secure (needs HTTPS). |

## Hosting

GitHub holds the code and runs the tests on every push (`.github/workflows/test.yml`), but it can't run the app itself. GitHub Pages only serves static files, and this app needs a server that's always on to send reminders, store data and receive WhatsApp replies. So deploy from GitHub to a small host that redeploys automatically on every push.

**Recommended: [Railway](https://railway.com)** (Hobby plan, about $5/month):

1. Sign in to Railway with GitHub → *New Project* → *Deploy from GitHub repo* → pick this repo. It builds from the `Dockerfile`.
2. In the service, add a **Volume** mounted at `/data`, where the database lives.
3. Under *Variables*, add `ANTHROPIC_API_KEY`, `PUBLIC_URL` (your app's address) and `VAPID_SUBJECT=mailto:you@example.com`, plus the WhatsApp variables when you get to them.
4. Under *Settings → Networking*, click *Generate Domain* to get an HTTPS address like `household-production.up.railway.app`.

Every push to the main branch then redeploys automatically.

Alternatives: **Fly.io** (deploy the same Dockerfile, add a volume at `/data`) or any VPS with Docker. Avoid free tiers that put the app to sleep (e.g. Render's free plan), because reminders won't fire while it's asleep, and those tiers usually don't keep the database between deploys.

### Testing on phones

Web push and the microphone only work on **HTTPS** (or `localhost`). Use the deployed address, or tunnel your laptop with `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

- **Android / desktop Chrome, Edge, Firefox:** Settings → Enable notifications.
- **iPhone (iOS 16.4+):** push only works once the app is added to the Home Screen (Share → Add to Home Screen) and opened from there. Speech input works in Safari.

## How the assistant works

`POST /api/parse` sends the text, the person's local date and time, the household member names, and any answers to earlier questions to Claude (`src/ai/claudeParser.js`). Claude returns structured output that matches a Zod schema (`src/ai/schema.js`): title, notes, category, date, time, owner, prep steps with "days before", reminder offsets, and clarifying questions. The request turns on Anthropic's server-side refusal fallback. If Claude errors or no key is set, the app uses the offline rules parser (`src/ai/rulesParser.js`), so adding a task always works.

The parser only produces a **draft**. Nothing is saved until a person confirms it in the form.

Chat messages (in-app or WhatsApp) go through `src/chat/engine.js`. Claude receives the message, the household's open tasks and the task the conversation is about (the reminder you replied to, or the last task discussed). It returns a list of operations (complete, reschedule, assign, create, and so on). The app applies them through the same task service the web UI uses, so the other members get the same notifications however a change was made. The confirmation text is generated from what was actually applied, not by the model.

## Project layout

```
src/
  server.js          entry point: DB, parser, notifier, reminder loop
  app.js             Express JSON API (auth, households, tasks, prep steps, parse, chat, notifications, push)
  tasks.js           task operations shared by the API and chat: recurrence, household notifications
  time.js            timezone-aware dates, recurrence steps, message formatting
  chat/              chat interpreter (Claude + offline rules) and the engine that applies operations
  channels/          WhatsApp Cloud API: outbound messages, inbound webhook
  db.js              SQLite schema
  auth.js            password hashing, sessions (cookie or Bearer token)
  reminders.js       reminder planning, delivery loop, web push and email
  ai/                Claude parser, offline rules parser, shared draft schema
public/              front end (plain HTML/CSS/JS, no build step), service worker, manifest
test/                node:test suites (two-user flows, reminders, recurrence, chat, WhatsApp webhook, parser)
docs/                WhatsApp setup guide
Dockerfile           production image (used by Railway/Fly)
```

## Road to a native app

The API is already client-agnostic: login returns a token that works as `Authorization: Bearer <token>`, so a React Native or Swift/Kotlin app can reuse every endpoint unchanged. Things a native app would improve over the web version:

- **Reliable push on iOS** without needing Home Screen install (APNs/FCM in place of web push). This would add a device-token table next to `push_subscriptions`.
- **Always-available voice:** hands-free capture, Siri/Google Assistant shortcuts, share-sheet capture ("add this message as a task").
- **Live updates** over websockets or push-triggered refresh instead of 20-second polling.
- **Calendar sync** (Google/Apple) and location reminders ("when I'm at the supermarket").

## Known MVP limitations

- No password reset or email verification yet.
- One timezone per household (picked up from the first browser that signs in).
- WhatsApp voice notes aren't transcribed yet.
- A date with no time defaults to 09:00.
