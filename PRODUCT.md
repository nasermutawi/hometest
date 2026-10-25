# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two adults who share a home: Nas and Sandi. Each has their own tasks and reminders, and some are shared. They use Melody equally on the go (one hand, in a car park or the supermarket, capturing something quickly) and at home in the evening, planning the coming days together.

## Product Purpose

Melody is a shared to-do list and reminder app for one household. The main way in is speaking: say what needs doing, when and for whom, and Melody turns it into tasks with an owner, a date and time, and prep steps for the errands that lead up to it. Success is that nothing said out loud gets lost, and each person can see at a glance what is theirs, what is the other's, and what is shared.

## Positioning

A to-do list for two, spoken rather than typed. Ownership (mine, yours, ours, anyone) is the first thing every task shows, and a single sentence can become a task with its prep steps ("cook the ragu on Friday, so I need to go to the supermarket and the shop next door for the sauce").

## Operating Context

- Saved to the iPhone home screen as a web app from a personal link; also opened on Android.
- Data lives in a Google Sheet behind a Google Apps Script server; reminders arrive by email; tasks can go into Google Calendar.
- Speech is understood by simple rules, or by Claude when a key is set.
- Lives in Dubai; some task titles may be in Arabic.

## Capabilities and Constraints

- Capture by voice (the microphone) or by typing (the + button); Review after each recording; a task page with when, who, repeats, prep steps and a note, whose changes wait for Save changes (leaving with unsaved changes asks first); filters by person and Done; swipe rows to complete or delete; long-press quick actions; swipe back; pull to refresh.
- Owners: each person, Shared (both), or Unassigned (anyone).
- Per-phone settings: text size (Standard, Larger, Largest), haptics, completion sound.
- The page never zooms or scrolls sideways; text size is how text gets bigger.
- Web-app limits on iPhone (microphone prompts, haptics, notifications) are tracked in BACKLOG.md as "Native only" or "Better native". A native app may come later.

## Brand Commitments

- Name: Melody. App icon: a ticked round checkbox ringed half teal (Nas), half apricot (Sandi), in a mic stand (`docs/design/icon-us.svg`).
- Current look: Hearth (`docs/design/hearth.md`). The owners like the current card layout; new colour and contrast variants of it (and wider design directions) have been explored on a design canvas, and none is chosen yet. Until one is, Hearth is the look.

## Evidence on Hand

- Realistic content: the household's own kind of tasks (cook the ragu with prep steps, pick up the dry cleaning, pay the DEWA bill, book the car service, call the plumber about the water heater).
- No testimonials, metrics or marketing claims exist; none should be invented.

## Product Principles

1. Speaking a task is faster than typing it; the microphone is always one tap away.
2. Whose task it is shows at a glance, by shape as well as colour.
3. Nothing said out loud gets lost; every capture can be checked and fixed quickly.
4. Screen space goes to the tasks; the top and bottom stay slim.
5. Familiar phone gestures, each with a visible button as well.

## Accessibility & Inclusion

Text at least 4.5:1 contrast; tap targets at least 44px; respects reduce motion and reduce transparency; three text sizes; Arabic titles shown right-to-left; ownership never shown by colour alone.
