# Household

A shared to-do app for a household (spouses, partners, housemates). Each person has their own account on their own device, and everyone in the household sees and edits the same tasks.

You describe a task in plain language, typed or spoken, for example:

> Plumber coming Thursday at 10am to fix the kitchen leak, Sara to handle it. We need to empty the cupboard under the sink before they arrive.

The app turns that into a task with a title, a date and time, an owner, a category, and **prep steps**: the things that have to happen beforehand. It picks up prep you mention ("empty the cupboard") and prep the task implies ("confirm the appointment the day before", "clear access to the work area"). If something essential is missing, like the date or who owns it, it asks. You check the draft, adjust it if needed, and save.

## Features (MVP)

- **Accounts and households.** Sign up, then share the invite code or link (Settings → Invite your partner) so the other person can join.
- **Plain-language task entry** with a microphone button (browser speech recognition) and follow-up questions for missing details.
- **Tasks** with date/time, owner (a member or "Anyone"), category, notes and editable prep steps. Each prep step is set as "N days before" the task.
- **Reminders** go to the task owner, or to everyone when it's unassigned:
  - at chosen offsets before the task (1 week, 1 day, 2 hours, 1 hour, at the time)
  - when each prep step is due
  - delivered in-app (bell icon), by **web push** to phones and desktops, and by **email** if SMTP is configured
- **Household updates:** you get notified when someone assigns you a task, finishes a task, or joins the household.
- Filters (Everyone / Mine / partner / Unassigned) and grouping (Overdue, Today, Tomorrow, Next 7 days, Later).
- Installable as a home-screen app (PWA). Open screens refresh every 20 seconds so both people stay in sync.

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
| `VAPID_SUBJECT` | Contact for web push, e.g. `mailto:you@example.com`. VAPID keys are generated on first run and stored in the database. |
| `NODE_ENV=production` | Marks the session cookie as Secure (needs HTTPS). |

### Testing on phones

Web push and the microphone only work on **HTTPS** (or `localhost`). To test on real phones, deploy to any Node host with a persistent disk (Render, Fly.io, Railway, a small VPS), or tunnel your laptop with `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`.

- **Android / desktop Chrome, Edge, Firefox:** Settings → Enable notifications.
- **iPhone (iOS 16.4+):** push only works once the app is added to the Home Screen (Share → Add to Home Screen) and opened from there. Speech input works in Safari.

## How the task assistant works

`POST /api/parse` sends the text, the person's local date and time, the household member names, and any answers to earlier questions to Claude (`src/ai/claudeParser.js`). Claude returns structured output that matches a Zod schema (`src/ai/schema.js`): title, notes, category, date, time, owner, prep steps with "days before", reminder offsets, and clarifying questions. The request turns on Anthropic's server-side refusal fallback. If Claude errors or no key is set, the app uses the offline rules parser (`src/ai/rulesParser.js`), so adding a task always works.

The parser only produces a **draft**. Nothing is saved until a person confirms it in the form.

## Project layout

```
src/
  server.js          entry point: DB, parser, notifier, reminder loop
  app.js             Express JSON API (auth, households, tasks, prep steps, parse, notifications, push)
  db.js              SQLite schema
  auth.js            password hashing, sessions (cookie or Bearer token)
  reminders.js       reminder planning, delivery loop, web push and email
  ai/                Claude parser, offline rules parser, shared draft schema
public/              front end (plain HTML/CSS/JS, no build step), service worker, manifest
test/                node:test suites (two-user API flows, reminders, parser)
```

## Road to a native app

The API is already client-agnostic: login returns a token that works as `Authorization: Bearer <token>`, so a React Native or Swift/Kotlin app can reuse every endpoint unchanged. Things a native app would improve over the web version:

- **Reliable push on iOS** without needing Home Screen install (APNs/FCM in place of web push). This would add a device-token table next to `push_subscriptions`.
- **Always-available voice:** hands-free capture, Siri/Google Assistant shortcuts, share-sheet capture ("add this message as a task").
- **Live updates** over websockets or push-triggered refresh instead of 20-second polling.
- **Calendar sync** (Google/Apple) and location reminders ("when I'm at the supermarket").

## Known MVP limitations

- No password reset or email verification yet.
- No recurring tasks yet (e.g. "service the boiler every year").
- Times are stored in UTC and shown in each device's local timezone. A household spread across timezones would see the same moment at different clock times.
- A date with no time defaults to 09:00.
