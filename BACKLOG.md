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
| **Reminders go only to the person the task is for** (Oct 25). A task assigned to Nas reminds only Nas; one assigned to Sandi reminds only Sandi. Shared tasks remind both, and so do Unassigned ones until someone takes them. Today the timed reminders (before a task with a time) and the prep-step reminders go to **both** people whoever the task is for; only the evening "no time set" nudge already goes to the owner alone. Fix in `Code.gs`: use the nudge's recipient rule for those two reminders too. Leave as they are: the "what changed" updates (they tell the other person what you did) and the daily summary. | Each person hears about their own tasks, not the other's | Small | — |
| **A proper Melody email design.** Give every email the app sends one consistent, designed format and layout (requested Oct 2026; design still to be agreed). Covers the evening nudge and other reminders, plus the emails sent when a person is added or gets a new link. Starting points: Hearth look (oat background, paper card, Fraunces heading, damson button, owner colours shown as pills/pebbles as in the app); a short subject that says what's due ("3 things for tomorrow"); tasks grouped like the app (Today, Tomorrow, Overdue) with owner, time and prep steps; one clear button that opens the app (ideally the task itself); a quiet footer. Build it as one shared email template in `Code.gs` so every email uses it. Technical: inline styles and simple tables (email apps ignore most CSS), web-safe font fallbacks, works in Gmail and iPhone Mail, light and dark mode, always with a plain-text version. Keep sending from the timed trigger only. Design it first on the design canvas, then spec it. | Reminders that look like Melody, are quick to read, and lead straight back into the app | Small to medium | — |
| Choose your own evening-nudge time per person (today it's one household time, 18:00, in the Settings tab) | Fits each person's evening routine | Small | — |
| Choose who gets the evening nudge (today: the owner only, or both people for Shared and Unassigned tasks) | Some couples want both to hear about everything | Small | — |
| Choose your own quick times per person (today 9:00, 13:00 and 19:00 for the household, in the Settings tab) | Matches each person's day | Small | — |
| Pop-up phone notifications instead of emails | Reminders that can't be missed in an inbox; needs a hosted server or a native app | Large | **Better native**: iPhone web apps can get push only when saved to the home screen and with a hosted server; native notifications are more reliable and can have actions ("Done", "Snooze") |
| Location reminders, e.g. "when I'm at the supermarket" | Errands remembered at the right place | Large | **Native only**: web apps can't watch your location in the background |

## Using the app

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **"In 1 hour" sets the time** (Oct 25). Saying "test the mic in 1 hour" came back with no date or time. "In an hour", "in 2 hours", "in half an hour", "in 45 minutes" should take the time now, add that much, and round to the nearest quarter (:00, :15, :30, :45), so "in 1 hour" said at 18:35 becomes today at 19:30. If that passes midnight, it's tomorrow. Today the simple rules only understand clock times ("at 5", "5pm") and day words; Claude's rules need the same instruction. | Quick reminders are said this way, and a task without a time gets no reminder | Small | — |
| **Who it's for: default to whoever said it** (Oct 25). Today a task with no name and no "I" or "me" in it is Unassigned ("test the mic functionality" was). New rules, the same for both phones: nobody named → the person speaking (Nas on Nas's phone, Sandi on Sandi's); "Sandi needs to…" → Sandi; "Nas" or "Nasser needs to…" → Nas; "we need to…" / "we should…" / "us" → Shared. Unassigned only when someone says so ("anyone", "whoever"). Needs: "Nasser" accepted as another name for Nas (a Members alias), "we" checked before the default, and the same rules for Claude. Unassigned still exists for tasks made by hand. | Most things you say are for yourself; fewer taps fixing the owner on Review | Small | — |
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

## From the UX audit (Oct 24, 2026)

Found by running the app locally at iPhone size (390 and 320px, light and dark) with the repo's skills: **impeccable** (audit, critique and its automated scan), **ui-ux-pro-max**, **mobile-native**, **apple-design** and **break-ui** (worst-case data: long names, Arabic, emoji, 8 prep steps, 50 tasks, an empty filter). Hearth (`docs/design/hearth.md`) wins where a skill disagrees; those cases are under "Decisions" below rather than in the table.

| Idea | Why it matters | Effort | Native |
|---|---|---|---|
| **Task page: make Done the main action.** Today the big button at the bottom is "Say what to change"; marking the task done is the 30px pebble beside the title at the top, out of thumb reach, and Delete is behind "…". Put **Mark done** as the primary bottom button, with the mic as a smaller round button beside it (as on Tasks), and keep the pebble too. (impeccable critique: thumb zone; apple-design: the most common action is the most obvious.) | Finishing a task is the thing you do most on that page | Small | — |
| **Empty states** (small bug). With nothing done, the Done filter shows an empty "Recently done" card instead of its "Nothing finished yet." message: `groupsOf()` returns the Done group even when it's empty, so `emptyHtml()` never runs (`docs/index.html`, around line 1331). Also make the other empty filters specific: Mine, Sandi's and Shared say only "Nothing here."; better "Nothing for Sandi right now. Tap the mic to add one." The first-visit message ("Nothing here yet. Tap the microphone or + to add a task.") is already good. (break-ui; ui-ux-pro-max: empty states) | A blank card looks broken; a sentence explains it | Small | — |
| **Filters: separate "Done" from "whose".** All / Mine / Sandi's / Shared answer *whose*; Done answers *finished or not*, so it sits oddly in the same row, and with a longer name it scrolls off the right edge. Move Done to a "Show done" row at the end of the list (or a small toggle), leaving the chips for people only. (impeccable: cognitive load) | Simpler choices; Done is never hidden off-screen | Small | — |
| **Tap targets under 44px.** Filter chips are 36px tall, Who on the task page 32px, text-size and Repeats controls 36px, "My link" 36px. Raise them to 44px (or give them a bigger invisible tap area, as the pebbles already have). (ui-ux-pro-max: touch; impeccable audit) | Fewer missed taps, especially one-handed | Small | — |
| **Settings: group and use switches.** One long page mixes your own settings, the household and help: the microphone fix tip sits under "Sound and touch". Group as **You** (email, text size, sound and touch), **Household** (people, links, the sheet) and **Help** (microphone tip, last error, how speech is understood), and use iPhone-style switches instead of square checkboxes. (impeccable: clarify; apple-design: familiarity) | Easier to find things; looks like an iPhone app | Small | — |
| **Live transcript text is too faint.** While recording, the grey placeholder and the not-yet-final words use `--faint`: 2.3:1 contrast in light mode and 3.8:1 in dark, below the 4.5:1 minimum. Use `--muted` (4.7:1) and show unfinished words in italic instead of paler. (impeccable scan; ui-ux-pro-max: contrast) | You can read what the app heard while you speak | Small | — |
| **"Late" in words, not only red.** A time that has passed today (e.g. 13:00 under Today) turns red with no word. Add "Late" before the time, as the Overdue section already does in words. (ui-ux-pro-max: colour alone) | Readable for colour-blind eyes and at a glance | Small | — |
| **Long names squeeze the task title.** The owner pill never shrinks: with a name like "Alexandra-Catherine", the title gets two words per line at 320px, and the task page's Who control cuts it to "Alexandra…". Cap pills at about 10 characters (first part of the name), let the title take priority, and let Who show full names. Matters most with "More than two people"; Nas and Sandi fit today. (break-ui) | Titles stay readable whatever the names | Small | — |
| **Settings → People: a long email hides "Send link"** (bug, found checking sideways scrolling). The page itself never scrolls sideways (checked at 320, 375 and 390px with all three text sizes, on every screen), but in People a long email address pushes the person's **Send link** button past the right edge, where it can't be tapped. Let the email wrap or shorten in the middle (`alexandra.cath…@northwind-holdings.example.com`) and keep the button in view. (break-ui) | Every person's link can always be sent | Small | — |
| **One title limit everywhere.** Typing caps titles at 120 characters and voice at 200, but saving straight to the server has no limit; a long title fills six lines at the top of the task page. Use one limit (120) on the server, and step the task page title down a size after three lines. (break-ui) | Nothing can save a title the layout can't hold | Small | — |
| **Arabic titles: line up the time too.** An Arabic title is correctly right-aligned, but its date and time stay left-aligned under it. Give the row's meta the same direction as the title. (break-ui) | Arabic tasks look as tidy as English ones | Small | — |
| **Dark mode: neutral shadows.** The mic and primary buttons cast a damson-coloured glow in dark mode. Use a neutral dark shadow there. (impeccable scan) | Calmer, less "glowing" dark mode | Small | — |
| **Android back button.** Opening a task or Review doesn't add a step to the browser history, so Android's back gesture leaves the app instead of going back to the list. Add history steps for task, Review and Settings. Not an issue on iPhone. (ui-ux-pro-max: predictable back) | Back behaves as expected on Android | Small | — |

**Decisions (the skills disagree with Hearth; nothing changes unless you say so):**

- **A card per day on Tasks.** Hearth makes each day a paper card with its own italic heading and underline. On an iPhone this shows about 4 to 5 tasks per screen; the skills (impeccable layout, apple-design simplicity) would use one continuous list with slim sticky day headings, which fits about twice as many. Recommendation: try it on the Design canvas side by side before deciding.
- **Pinch zoom: decided Oct 24, keep it off.** Text size (Standard, Larger, Largest) is how text gets bigger; the page itself must never zoom or scroll sideways. Any change must keep every screen within the phone's width at all three text sizes.
- **Screens switch without movement.** Hearth says navigation never animates; apple-design would slide the task page in from the right and out the same way, matching swipe back. Recommendation: keep Hearth's rule; swipe back already gives the sense of direction.

**Checked and fine:** safe areas and the notch, 16px inputs, no tap flash, hover only on real pointers, reduce-motion and reduce-transparency, the 46px pebble tap area, ownership shown by shape as well as colour, long titles clamped to two lines in the list, emoji titles, 50 tasks scrolling smoothly, eight prep steps, URLs in notes wrapping, dark mode tokens. Not counted as problems: the scan's "cream background", "label above heading" and "Fraunces is overused" flags, which are Hearth's deliberate choices.

## Done

| Item | Shipped | What was built | Native |
|---|---|---|---|
| Save button on the task page | Oct 25, 2026 | Changes on a task's page (who, when, repeats, new prep steps, the note) no longer save one by one: each changed part shows "Not saved", and the bottom shows **Discard** and **Save changes**. Leaving with unsaved changes (Back, swipe back) asks: Save, Don't save, or Keep editing. Ticking the task or a saved prep step, and changes said by voice, still happen at once (voice is available again once the changes are saved or discarded). The new-task sheet and Review already had Save; quick actions from the list (long-press, the who and date sheets there) still save as soon as you pick. | — |
| Prep steps only from what was said | Oct 24, 2026 | The simple rules no longer add built-in steps ("check the fridge and pantry", "confirm the appointment" and the like). "…which means I need to…" now works like "…so I need to…", and "go to the grocery store, get the groceries" becomes one step, "Get the groceries at the grocery store". Claude's instructions already said never to invent steps. **Server change: needs a deploy.** | — |
| Go straight to Review after recording | Oct 24, 2026 | No more "Got it" sheet: after speaking (or typing) the Review screen opens at once, showing what was said as "Understanding…" until the tasks arrive. **Save** is always at the bottom. ✕ and swipe-back keep the tasks; Discard still works, even while it's understanding. | — |
| Same + button on the home screen | Oct 24, 2026 | "or type it" is gone. Home has the same slim bar as Tasks: the + (opens the same new-task sheet) and Settings, with the big microphone above. | — |
| Remove the home screen; open straight to Tasks | Oct 25, 2026 | The screen with the big microphone is gone. The app opens on Tasks, which has the microphone and + in its bar. Closing Review, saving, going back from a task and swiping back all land on Tasks. The ✕ on Tasks is gone; today's date sits in its place in the header. The home screen's code and styles were deleted, not hidden. | — |
| Slimmer bottom bar | Oct 24, 2026 | 56px plus the home-indicator area (was about 103px). 44px buttons; the microphone is a 56px pebble that sits up out of the bar. On Tasks the bar steps aside while you scroll down and comes back when you scroll up. | — |
| Slimmer top area | Oct 24, 2026 | Tighter headers on every screen. Tasks has a large title that turns into a small one-line title at the top once you scroll. Back/✕ on a task and on Review stay pinned at the top. | — |
| No loading bar at the top | Oct 24, 2026 | It was the app's own refresh/save bar. Now nothing shows for background refreshes or saves; the thin bar appears only if a save is still going after 5 seconds. Errors are toasts as before. | — |
| Fix "recording failed / not available" errors | Oct 24, 2026 | When the microphone fails, the app quietly tries once more with a fresh recognizer (for a lost connection, a busy microphone or speech switched off), and keeps whatever was already heard. If it still fails, a sheet says what happened and what to do (allow the microphone, turn on Dictation, finish the call in another app, check the connection), with **Try again** and **Add it manually**, which opens the same sheet as the + button (Oct 25: renamed from "Type it instead"; "Didn't hear anything" offers it too; when changing a task by voice it says **Edit it manually** and opens that task's edit sheet). Every problem is logged on the phone; Settings → Sound and touch shows the latest one with its code, so it can be reported. | **Better native** |
| Ask for the microphone only once | Oct 24, 2026 (to check on the phone) | The page never reloads itself (checked), and one speech recognizer is reused for the whole visit, since some iPhones ask again for every new one. Settings has the tip: Settings → Apps → Safari → Microphone → Allow. See "Microphone prompt: check on the phone" above. | **Better native** |
| Swipe back from a task | Oct 24, 2026 | Drag from the left edge on a task, on Review or in Settings: the page follows the finger with the previous one underneath, goes back past a third of the width or on a quick flick, otherwise springs back. The list keeps its scroll position. | **Better native**: native apps get this for free |
| Gesture check across the app | Oct 24, 2026 | Added: swipe back (above), long-press a task for quick actions (Open, Mark done, Change who, Change date, Delete; right-click does the same on a computer) and pull down on Tasks to refresh. Already there: swipe rows, drag sheets down. Swiping between filter tabs is left out (see Gestures). | **Better native** |
| Haptic taps | Oct 24, 2026 | A light tap on completing a task or a prep step, swiping a row past the point where it acts, starting and stopping the microphone, long-press, swipe-back and pull-to-refresh. On by default, switch off in Settings → Sound and touch. Android uses vibration; iPhone uses an unofficial iOS 18 trick (a hidden switch control), so older iPhones feel nothing and a future iOS may stop it. | **Better native** |
| Completion sound (off by default) | Oct 24, 2026 | A soft two-note chime when a task is done, switched on in Settings → Sound and touch (per phone). Made in the app, no sound file; it mixes with music and asks to obey the silent switch. | **Better native**: web audio respects the silent switch unevenly |
