# Backlog

Ideas parked for later. None of them blocks the current version (the Google Sheets edition, with the app on GitHub Pages). Effort is a rough guide: **small** is under a day, **medium** a few days, **large** a project of its own.

## Reminders and notifications

| Idea | Why it matters | Effort |
|---|---|---|
| Choose your own evening-nudge time per person (today it's one household time, 18:00, in the Settings tab) | Fits each person's evening routine | Small |
| Choose who gets the evening nudge (today: the owner only, or both people for Shared and Unassigned tasks) | Some couples want both to hear about everything | Small |
| Choose your own quick times per person (today 9:00, 13:00 and 19:00 for the household, in the Settings tab) | Matches each person's day | Small |
| Pop-up phone notifications instead of emails | Reminders that can't be missed in an inbox; needs a hosted server or a native app | Large |
| Location reminders, e.g. "when I'm at the supermarket" | Errands remembered at the right place | Large |

## Using the app

| Idea | Why it matters | Effort |
|---|---|---|
| Change several tasks by voice from the Review screen (the design has a microphone there; today voice editing is on each task's page) | Fix a whole recording in one sentence | Small |
| Replace a person's link from the app (today: remove them from the Members tab, or run `linkFor(name, true)` in the script editor) | Quick fix if a phone is lost or a link is shared by mistake | Small |
| Merge separate tasks into one task with steps, and split them back | Fixes cases where a recording was split the wrong way | Medium |
| Live updates between phones (today the app refreshes every 30 seconds) | Changes appear instantly on the other phone | Medium |
| More than two people in a household | "You" currently means "the other person" | Medium |

## Settings and permissions

| Idea | Why it matters | Effort |
|---|---|---|
| Change the household time zone from the app (today it's the spreadsheet's time zone) | No trip to File → Settings in the sheet | Small |
| Option to switch off Google Calendar entirely, or use the narrower Calendar permission (Advanced Calendar service) | Google's calendar permission wording is broad and worried us during setup | Small |

## Claude (optional language understanding)

| Idea | Why it matters | Effort |
|---|---|---|
| A cheaper Claude model for short, simple messages | Lower running cost once real usage is measured | Small |
| Reuse Claude's instructions between requests (prompt caching) | Cuts the cost of each request | Small |
| Talk to tasks from the Claude app (connector) | Removed for now; kept only as a last resort, since the aim is one app | Parked |

## Messaging

| Idea | Why it matters | Effort |
|---|---|---|
| Telegram group bot | Free, a real group chat both people can reply in | Medium |
| WhatsApp reminders and replies | Already built in the hosted Node.js version; needs a Meta business setup, costs per message, and can't post into a normal group | Medium |
| Transcribe voice notes sent over chat | Speak instead of type in Telegram or WhatsApp | Medium |

## Platform

| Idea | Why it matters | Effort |
|---|---|---|
| Native phone app | Reliable notifications, a record button on the home or lock screen, the microphone always available; needs an Apple Developer account ($99 a year) and one of the existing backends | Large |
| Hosted Node.js version as the backend (Railway, about $5 a month) | Real push notifications and its own database instead of the sheet | Medium |

## Ideas from Todoist and Structured (to explore later)

| Idea | From | Why it might fit | Effort |
|---|---|---|---|
| Day timeline view for timed tasks (optional "Today" view) | Structured | See the day's shape at a glance; keep the grouped list as default | Large |
| Inbox for captures that skipped review | Both | Nothing said out loud gets lost | Medium |
| Quick add that highlights dates and "for me / for you / for us" as you type | Todoist | Faster typed entry, owner set in the same sentence | Medium |
| Smarter repeats ("every other Thursday", "last Friday of the month") | Todoist | Chores and bins | Medium |
| "Move all overdue to today" in one tap | Structured | Quick reset after a busy day | Small |
| Areas (House, Trip, Kids) shared between both | Todoist | Group related tasks | Medium |
| One "note to partner" line on a task | Todoist | Context without a full comment thread | Small |
| Week view compressed to icons | Structured | Plan the weekend together | Medium |
| Icon per task, picked automatically from the title | Structured | Easier to skim; never required | Medium |
| Gentle shared moment when Today is cleared (no streaks or scores) | Todoist (karma), reworked | Feels good without turning chores into a scoreboard | Small |
| Completion sound (off by default) | Structured, Things | Makes finishing feel finished | Small |

## Look and feel

| Idea | Why it matters | Effort |
|---|---|---|
| Possible icon tweak: B6's split-ring dot on a damson tile (B3's background), if the light oat tile gets lost on the home screen | Bolder on light wallpapers | Small |
