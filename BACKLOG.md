# Backlog

Ideas parked for later. None of them blocks the current version (the Google Sheets edition, with the app on GitHub Pages). Effort is a rough guide: **small** is under a day, **medium** a few days, **large** a project of its own. Finished items move to **Done** at the bottom.

## Native app tags

Melody is a web app saved to the home screen. A native iPhone app may come later, so every item says how the web app's limits affect it (column **Native**):

- **Native only**: can't be done, or can't be done reliably, as a web app. Wait for the native app.
- **Better native**: works here, but a native app does it better or more reliably. Worth doing now; revisit when going native.
- **—**: works just as well as a web app.

**Rule for everyone adding items (this Project, the backlog chat and Claude Code):** whenever feedback, testing or code runs into a limit of the web app (iOS Safari, home-screen apps, Google Apps Script), tag the item and say in one line what the limit is. When the native app is planned, filter by these two tags first.

## Reminders and notifications

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **A proper Melody email design.** Give every email the app sends one consistent, designed format and layout (requested Oct 2026; design still to be agreed). Covers the evening nudge and other reminders, plus the emails sent when a person is added or gets a new link. Starting points: Hearth look (oat background, paper card, Fraunces heading, damson button, owner colours shown as pills/pebbles as in the app); a short subject that says what's due ("3 things for tomorrow"); tasks grouped like the app (Today, Tomorrow, Overdue) with owner, time and prep steps; one clear button that opens the app (ideally the task itself); a quiet footer. Build it as one shared email template in `Code.gs` so every email uses it. Technical: inline styles and simple tables (email apps ignore most CSS), web-safe font fallbacks, works in Gmail and iPhone Mail, light and dark mode, always with a plain-text version. Keep sending from the timed trigger only. Design it first on the design canvas, then spec it. | Reminders that look like Melody, are quick to read, and lead straight back into the app | Small to medium | — |
| Choose your own evening-nudge time per person (today it's one household time, 18:00, in the Settings tab) | Fits each person's evening routine | Small | — |
| Choose who gets the evening nudge (today: the owner only, or both people for Shared and Unassigned tasks) | Some couples want both to hear about everything | Small | — |
| Choose your own quick times per person (today 9:00, 13:00 and 19:00 for the household, in the Settings tab) | Matches each person's day | Small | — |
| Pop-up phone notifications instead of emails | Reminders that can't be missed in an inbox; needs a hosted server or a native app | Large | **Better native**: iPhone web apps can get push only when saved to the home screen and with a hosted server; native notifications are more reliable and can have actions ("Done", "Snooze") |
| Location reminders, e.g. "when I'm at the supermarket" | Errands remembered at the right place | Large | **Native only**: web apps can't watch your location in the background |

## Using the app

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Microphone stays on until you leave the app** (watching, Oct 2026). After dictating a task, the orange microphone dot stays on while the app is open, and only goes away when you leave the app. Earlier, leaving the app after dictating played the phone's microphone sound; after the "native feel" fix, the latest test was silent. The app already stops the recognizer and releases the mic the moment you stop talking, cancel or leave, so the dot is iOS holding on to the microphone for the web page. Keep reporting: if the sound comes back, options are (a) more release workarounds, (b) using iPhone's keyboard dictation instead, or (c) recording audio and transcribing it on the server. Since Oct 24 the app reuses one recognizer per visit (for the microphone prompt): watch whether that changes the dot or the sound. | Voice should feel like any app: mic on only while you talk, no stray sounds | Small (watch) | **Better native**: a web app can't fully control the iPhone's microphone session; a native app turns the mic on and off exactly when it wants |
| **Microphone prompt: check on the phone** (follow-up to "ask for the microphone only once", Oct 24). Report whether the question still comes up every time after the fixes below and after setting Safari's microphone setting to Allow. If it does, iOS doesn't remember it for home-screen web apps and the real fix is the native app. | Recording should be one tap | Small (test) | **Better native**: iOS may not remember microphone permission for home-screen web apps; a native app asks once |
| Change several tasks by voice from the Review screen (the design has a microphone there; today voice editing is on each task's page) | Fix a whole recording in one sentence | Small | — |
| Edit a task's title, owner and date right on the Review screen (today the chips change date, time and owner; the title opens the task) | Fix a capture without leaving Review | Small | — |
| Replace a person's link from the app (today: remove them from the Members tab, or run `linkFor(name, true)` in the script editor) | Quick fix if a phone is lost or a link is shared by mistake | Small | — |
| Merge separate tasks into one task with steps, and split them back | Fixes cases where a recording was split the wrong way | Medium | — |
| Live updates between phones (today the app refreshes every 30 seconds, or when you pull down on Tasks) | Changes appear instantly on the other phone | Medium | — (needs a hosted backend, not a native app) |
| More than two people in a household | "You" currently means "the other person" | Medium | — |

## Gestures

**Principle (Oct 2026):** use the gestures people already know from native phone apps wherever they fit, so the app feels natural without being learned. Every gesture is extra: there is always a visible button for the same thing. Gestures respect "reduce motion", lock to one direction after about 10px so they never fight scrolling, and use pointer events so they work on iPhone and Android.

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| Swipe between filter tabs (All, Mine, Sandi's…) | Quicker switching | Small | — (left out for now: a sideways swipe on the list already completes or deletes a row, so the two would clash. Revisit if the filters move to their own strip) |

## Settings and permissions

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| Change the household time zone from the app (today it's the spreadsheet's time zone) | No trip to File → Settings in the sheet | Small | — |
| Option to switch off Google Calendar entirely, or use the narrower Calendar permission (Advanced Calendar service) | Google's calendar permission wording is broad and worried us during setup | Small | — |

## Claude (optional language understanding)

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Turn on Claude for recordings.** Set a Claude API key for the household so recordings are understood properly (goal + errands as prep steps, short titles, splitting unrelated things). The app already supports this; without a key it falls back to simple rules. Settings → More already says which one is active. | Most reliable way to get "Cook the ragu" with the right steps | Small (setup), plus a small cost per recording | — |
| A cheaper Claude model for short, simple messages | Lower running cost once real usage is measured | Small | — |
| Reuse Claude's instructions between requests (prompt caching) | Cuts the cost of each request | Small | — |
| Talk to tasks from the Claude app (connector) | Removed for now; kept only as a last resort, since the aim is one app | Parked | — |

## Messaging

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| Telegram group bot | Free, a real group chat both people can reply in | Medium | — |
| WhatsApp reminders and replies | Already built in the hosted Node.js version; needs a Meta business setup, costs per message, and can't post into a normal group | Medium | — |
| Transcribe voice notes sent over chat | Speak instead of type in Telegram or WhatsApp | Medium | — |

## Platform

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| Native phone app | Reliable notifications, a record button on the home or lock screen, the microphone always available (asked once, remembered for good); needs an Apple Developer account ($99 a year) and one of the existing backends. Start from every item tagged **Native only** or **Better native**. | Large | The native app itself |
| Home-screen widget, lock-screen record button, Siri ("Hey Siri, add to Melody") | Capture a task without opening the app | Medium | **Native only**: web apps can't add widgets, lock-screen buttons or Siri shortcuts |
| Hosted Node.js version as the backend (Railway, about $5 a month) | Real push notifications and its own database instead of the sheet | Medium | — |
| Web app manifest (`display: standalone`, icons, colours) | A tidier home-screen app on Android | Small | — (left out on purpose for now: a manifest's start address would drop the personal link from the home-screen icon, so it needs the link kept another way first) |

## Ideas from Todoist and Structured (to explore later)

| Idea | From | Why it might fit | Effort | Native |
|---|---|---|---|---|
| Day timeline view for timed tasks (optional "Today" view) | Structured | See the day's shape at a glance; keep the grouped list as default | Large | — |
| Inbox for captures that skipped review | Both | Nothing said out loud gets lost | Medium | — |
| Quick add that highlights dates and "for me / for you / for us" as you type | Todoist | Faster typed entry, owner set in the same sentence | Medium | — |
| Smarter repeats ("every other Thursday", "last Friday of the month") | Todoist | Chores and bins | Medium | — |
| "Move all overdue to today" in one tap | Structured | Quick reset after a busy day | Small | — |
| Areas (House, Trip, Kids) shared between both | Todoist | Group related tasks | Medium | — |
| One "note to partner" line on a task | Todoist | Context without a full comment thread | Small | — |
| Week view compressed to icons | Structured | Plan the weekend together | Medium | — |
| Icon per task, picked automatically from the title | Structured | Easier to skim; never required | Medium | — |
| Gentle shared moment when Today is cleared (no streaks or scores) | Todoist (karma), reworked | Feels good without turning chores into a scoreboard | Small | — |

## Look and feel

**Principle (Oct 2026):** be economical with screen space across the whole app. The top and bottom of every screen stay minimal so the middle, where the content is, gets as much room as possible. Task cards and other content can stay as they are. Recorded in `docs/design/hearth.md`.

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| App icon updates only when the app is removed and re-added to the home screen (found Oct 2026, when the new B6 icon went live) | Future icon changes need a note to both of you to re-add the app | — (note) | **Better native**: native app icons update with the app |
| Possible icon tweak: B6's split-ring dot on a damson tile (B3's background), if the light oat tile gets lost on the home screen | Bolder on light wallpapers | Small | — |

## Done

| Item | Shipped | What was built | Native |
|---|---|---|---|
| Prep steps only from what was said | Oct 24, 2026 | The simple rules no longer add built-in steps ("check the fridge and pantry", "confirm the appointment" and the like). "…which means I need to…" now works like "…so I need to…", and "go to the grocery store, get the groceries" becomes one step, "Get the groceries at the grocery store". Claude's instructions already said never to invent steps. **Server change: needs a deploy.** | — |
| Go straight to Review after recording | Oct 24, 2026 | No more "Got it" sheet: after speaking (or typing) the Review screen opens at once, showing what was said as "Understanding…" until the tasks arrive. **Save** is always at the bottom. ✕ and swipe-back keep the tasks; Discard still works, even while it's understanding. | — |
| Same + button on the home screen | Oct 24, 2026 | "or type it" is gone. Home has the same slim bar as Tasks: the + (opens the same new-task sheet) and Settings, with the big microphone above. | — |
| Slimmer bottom bar | Oct 24, 2026 | 56px plus the home-indicator area (was about 103px). 44px buttons; the microphone is a 56px pebble that sits up out of the bar. On Tasks the bar steps aside while you scroll down and comes back when you scroll up. | — |
| Slimmer top area | Oct 24, 2026 | Tighter headers on every screen. Tasks has a large title that turns into a small one-line title at the top once you scroll. Back/✕ on a task and on Review stay pinned at the top. | — |
| No loading bar at the top | Oct 24, 2026 | It was the app's own refresh/save bar. Now nothing shows for background refreshes or saves; the thin bar appears only if a save is still going after 5 seconds. Errors are toasts as before. | — |
| Fix "recording failed / not available" errors | Oct 24, 2026 | When the microphone fails, the app quietly tries once more with a fresh recognizer (for a lost connection, a busy microphone or speech switched off), and keeps whatever was already heard. If it still fails, a sheet says what happened and what to do (allow the microphone, turn on Dictation, finish the call in another app, check the connection), with **Try again** and **Type it instead**, which opens the same sheet as the + button. Every problem is logged on the phone; Settings → Sound and touch shows the latest one with its code, so it can be reported. | **Better native** |
| Ask for the microphone only once | Oct 24, 2026 (to check on the phone) | The page never reloads itself (checked), and one speech recognizer is reused for the whole visit, since some iPhones ask again for every new one. Settings has the tip: Settings → Apps → Safari → Microphone → Allow. See "Microphone prompt: check on the phone" above. | **Better native** |
| Swipe back from a task | Oct 24, 2026 | Drag from the left edge on a task, on Review or in Settings: the page follows the finger with the previous one underneath, goes back past a third of the width or on a quick flick, otherwise springs back. The list keeps its scroll position. | **Better native**: native apps get this for free |
| Gesture check across the app | Oct 24, 2026 | Added: swipe back (above), long-press a task for quick actions (Open, Mark done, Change who, Change date, Delete; right-click does the same on a computer) and pull down on Tasks to refresh. Already there: swipe rows, drag sheets down. Swiping between filter tabs is left out (see Gestures). | **Better native** |
| Haptic taps | Oct 24, 2026 | A light tap on completing a task or a prep step, swiping a row past the point where it acts, starting and stopping the microphone, long-press, swipe-back and pull-to-refresh. On by default, switch off in Settings → Sound and touch. Android uses vibration; iPhone uses an unofficial iOS 18 trick (a hidden switch control), so older iPhones feel nothing and a future iOS may stop it. | **Better native** |
| Completion sound (off by default) | Oct 24, 2026 | A soft two-note chime when a task is done, switched on in Settings → Sound and touch (per phone). Made in the app, no sound file; it mixes with music and asks to obey the silent switch. | **Better native**: web audio respects the silent switch unevenly |
