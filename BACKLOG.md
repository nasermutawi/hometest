# Backlog

Ideas parked for later. None of them blocks the current version (the Google Sheets edition, with the app on GitHub Pages). Effort is a rough guide: **small** is under a day, **medium** a few days, **large** a project of its own.

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
| **Go straight to Review after recording.** Today, after speaking, a "Got it" sheet lists the tasks with Review and Save buttons, so making a change takes an extra tap (found on iPhone, Oct 2026). Skip that sheet: when the recording is understood, open the Review screen directly, with **Save** always visible at the bottom so a correct capture is still one tap. Quick edits (title, owner, date, prep steps) happen right there. Keep today's safety: the tasks are already saved, so closing Review (✕, edge-swipe back) keeps them, and **Discard** with Undo stays available. While waiting for the server, Review shows the spoken text as "Understanding…" and fills in when the reply arrives. Fold this into the redesigned multi-task review (being designed separately; see the "native feel and capture" spec). | One less step after every recording; fixing a capture becomes the natural next move | Small (or part of the review redesign) | — |
| **Prep steps come from what was said, never invented** (bug, found Oct 2026 testing the ragu sentence from the "native feel and capture" spec, §5). Result: one task, details in the note (fine), but the prep steps were generic "check the fridge and pantry"-style steps, which seem to be added by default to anything about cooking. The real errands (groceries, special sauce from the shop next door) did not become steps. Fix: (1) remove any default or template prep steps in `Parser.gs` / `Code.gs` — the spec says "don't invent steps that weren't said"; (2) check `checkSetup` to see whether a Claude key is set — if not, every recording goes through the simple rules, which is the likely cause; (3) with Claude on, the rewritten `capturePrompt_()` should link the errands to the goal and make them prep steps; (4) without Claude, the rules can only catch clear patterns ("so I need to… and then…") — if no safe split is found, add no steps rather than guessing. Recheck the ragu and 3-task test cases afterwards. | Prep steps the person actually needs; no made-up steps to delete | Small | — |
| **Ask for the microphone only once.** Today the phone asks for microphone permission every time voice is used (found on iPhone, home-screen app, Oct 2026). Signing in won't help: the permission belongs to the phone's browser and the website address, not to a user account. Investigate first: (1) does it ask once per app launch, or before every recording? (2) does iOS remember "Allow" for the GitHub Pages address (Safari: Settings → Apps → Safari → Microphone → Allow, or the website's own settings)? Note the raw.githack preview is a different address, so permission given there doesn't carry over. Then fix what's in the app's control: never reload the page (a reload resets the permission), and check whether `webkitSpeechRecognition` triggers a fresh prompt on each start on iOS and whether one approach (e.g. one microphone grant per session) avoids it, without bringing back the mic-chime bug. Add a one-line tip in the app on how to set "Allow" if the phone supports it. If iOS can't remember it for home-screen web apps, the full fix is the native app (see Platform). | Recording a task should be one tap, not a permission popup each time | Small to investigate; native app if needed | **Better native**: iOS may not remember microphone permission for home-screen web apps; a native app asks once |
| **Microphone stays on until you leave the app** (watching, Oct 2026). After dictating a task, the orange microphone dot stays on while the app is open, and only goes away when you leave the app. Earlier, leaving the app after dictating played the phone's microphone sound; after the "native feel" fix, the latest test was silent. The app already stops the recognizer and releases the mic the moment you stop talking, cancel or leave, so the dot is iOS holding on to the microphone for the web page. Keep reporting: if the sound comes back, options are (a) more release workarounds, (b) using iPhone's keyboard dictation instead, or (c) recording audio and transcribing it on the server. | Voice should feel like any app: mic on only while you talk, no stray sounds | Small (watch) | **Better native**: a web app can't fully control the iPhone's microphone session; a native app turns the mic on and off exactly when it wants |
| Change several tasks by voice from the Review screen (the design has a microphone there; today voice editing is on each task's page) | Fix a whole recording in one sentence | Small | — |
| Replace a person's link from the app (today: remove them from the Members tab, or run `linkFor(name, true)` in the script editor) | Quick fix if a phone is lost or a link is shared by mistake | Small | — |
| Merge separate tasks into one task with steps, and split them back | Fixes cases where a recording was split the wrong way | Medium | — |
| Live updates between phones (today the app refreshes every 30 seconds) | Changes appear instantly on the other phone | Medium | — (needs a hosted backend, not a native app) |
| More than two people in a household | "You" currently means "the other person" | Medium | — |

## Gestures

**Principle (Oct 2026):** use the gestures people already know from native phone apps wherever they fit, so the app feels natural without being learned. Every gesture is extra: there is always a visible button for the same thing. Gestures respect "reduce motion", lock to one direction after about 10px so they never fight scrolling, and use pointer events so they work on iPhone and Android.

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Swipe to go back from the task page.** Today the only way back to the list is the ✕ (found on iPhone, Oct 2026). Use the standard phone gesture: drag from the left edge of the screen towards the right. The task page follows the finger with the list visible underneath, goes back past about a third of the width or on a quick flick, and otherwise springs back. iPhone doesn't do this by itself for apps saved to the home screen, so the app must build it. Make sure it doesn't clash with sliders, text fields or the prep-step rows, and that it keeps the list's scroll position. Apply the same gesture to any other full-screen page (Review, settings). | Getting back feels like any other phone app; one hand, no reaching for the ✕ | Small | **Better native**: native apps get edge-swipe back for free; the web app has to imitate it |
| **Gesture check across the app.** Go through every screen and list where a common phone gesture is missing, then add the ones that fit. Already covered: swipe rows to complete/delete ("instant actions" spec, §5) and drag sheets down to close ("native feel" spec, §4). Candidates: edge-swipe back (above), pull down on the list to refresh, long-press a task for quick actions (owner, date, delete), swipe between filter tabs. | Consistent, native feel everywhere, not just on one screen | Small to medium | **Better native**: native gestures and long-press menus come built in |
| **Haptic taps** on completing a task, swiping past the threshold and starting/stopping the mic | Makes actions feel physical and finished | Small | **Better native**: iPhone web apps have no vibration support; only an unofficial workaround exists, which may break in any iOS update |

## Settings and permissions

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| Change the household time zone from the app (today it's the spreadsheet's time zone) | No trip to File → Settings in the sheet | Small | — |
| Option to switch off Google Calendar entirely, or use the narrower Calendar permission (Advanced Calendar service) | Google's calendar permission wording is broad and worried us during setup | Small | — |

## Claude (optional language understanding)

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Turn on Claude for recordings.** Set a Claude API key for the household so recordings are understood properly (goal + errands as prep steps, short titles, splitting unrelated things). The app already supports this; without a key it falls back to simple rules. Show in the app which one is active, so it's clear why results differ. | Most reliable way to get "Cook the ragu" with the right steps | Small (setup), plus a small cost per recording | — |
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
| Completion sound (off by default) | Structured, Things | Makes finishing feel finished | Small | **Better native**: web audio must be "unlocked" by a tap and respects the silent switch unevenly; native sound plus haptics is the real thing |

## Look and feel

**Principle (Oct 2026):** be economical with screen space across the whole app. The top and bottom of every screen stay minimal so the middle, where the content is, gets as much room as possible. Task cards and other content can stay as they are. Worth adding to the Hearth design system (`design/hearth.md`) when this is built.

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Slimmer top area, on every screen.** Same issue as the bottom bar, at the top (found on iPhone, Oct 2026). Header no taller than about 44–56px plus the status-bar safe area, with tight padding. Use the common phone pattern of a large title that shrinks into a small one-line title as you scroll. Filters/chips sit in one compact row and can scroll away with the list (or stay pinned compactly). Check each screen: Tasks, task page, Review, settings. Don't change the task cards themselves. | More room for the task list; feels like a native app | Small | — |
| **Slimmer bottom bar.** The bar with the microphone and options takes too much of the screen bottom (found on iPhone, Oct 2026). Bring it in line with common phone-app practice: the bar itself no taller than about 49–56px plus the home-indicator safe area, icons with small or no labels, and the mic as a compact damson pebble (about 56px) that sits in or floats just above the bar rather than a tall block. Optionally let the bar shrink or hide while scrolling down the list and come back on scroll up. Keep tap targets at least 44px and the mic easy to reach with a thumb. | More room for the task list; feels like a native app | Small | — |
| **"Or type it" becomes a clear "+ Add task" button.** On the home screen, "or type it" doesn't look tappable (found on iPhone, Oct 2026). Keep the mic as the primary action and turn "or type it" into a secondary button: a plus icon and the words "Add task", styled as a Hearth secondary button (outlined or `--chip` fill, damson text) so it clearly looks tappable but never competes with the mic. It opens the same typed new-task form as today. Fit it into the slimmer bottom bar (above), e.g. beside the mic, keeping the bar compact and tap targets at least 44px. | Typing a task is obvious for anyone who can't or doesn't want to speak | Small | — |
| **No loading bar at the top of the screen.** A loading animation shows across the top while the app refreshes or saves (found on iPhone, Oct 2026). It's distracting and makes the app feel like a web page. First check where it comes from: the app's own refresh/save indicator (spec "instant actions", §6) or the browser itself. If it's the app's: show nothing for background refreshes and optimistic saves; show progress only where a result will appear (e.g. the "Understanding…" row after a recording) or if something takes more than a few seconds; show errors as toasts as today. If it's the browser's: make sure the app runs full-screen from the home screen (web app manifest `display: standalone`, `apple-mobile-web-app-capable`) and that refreshes never reload the page. | Feels seamless, like a native app | Small | — |
| App icon updates only when the app is removed and re-added to the home screen (found Oct 2026, when the new B6 icon went live) | Future icon changes need a note to both of you to re-add the app | — (note) | **Better native**: native app icons update with the app |
| Possible icon tweak: B6's split-ring dot on a damson tile (B3's background), if the light oat tile gets lost on the home screen | Bolder on light wallpapers | Small | — |
