# Melody epics

Melody is organised into **epics** (big areas of the app), each split into **features** that can be built, tested on the phone and shipped one at a time. Ideas and smaller items still live in `BACKLOG.md`; this file says which epic and feature each one belongs to, and what to build next.

Status: **Built** (live), **Next** (ready to build, in order), **Later** (agreed, not scheduled), **Idea** (to discuss).

Rules for every feature, in every epic:

- Google Sheets edition only: `docs/index.html`, `google-sheets/Code.gs`, `google-sheets/Parser.gs`.
- Every write goes through the one data layer (`mutate`), so it feels instant and rolls back on failure.
- Look and feel follows `docs/design/hearth.md`; use ui-ux-pro-max alongside it.
- Use Nas and Sandi in examples, mockups and test data.
- Web-app limits get tagged **Native only** or **Better native** (see `BACKLOG.md`).
- One feature per pull request, branched off `claude/household-task-app-mfl3pq` (never push to it: it's the live site). Say at the top of the pull request if `Code.gs` or `Parser.gs` changed, and end with steps to test on the iPhone.

---

## Epic 1: To-dos

Everything that exists today. Open items for each feature are in `BACKLOG.md`.

| # | Feature | Status | Open items in BACKLOG.md |
|---|---|---|---|
| T1 | **Capture**: voice (mic) and typing (+), understood by simple rules or Claude | Built | "In 1 hour" sets the time; who it's for defaults to the speaker; microphone dot and prompt (watching) |
| T2 | **Review**: after each recording, check, fix and save | Built | Change several tasks by voice; edit title, owner and date on Review |
| T3 | **Tasks list**: day cards, filters, swipe, long-press, pull to refresh | Built | Empty states; separate Done from the person filters; "Late" in words; tap targets; long names |
| T4 | **Task page**: when, who, repeats, prep steps, note, Save changes | Built | Make Done the main action; one title limit; Arabic meta direction |
| T5 | **Owners and people**: Nas, Sandi, Shared, Unassigned; personal links | Built | Replace a person's link from the app; more than two people |
| T6 | **Repeats** | Built | Smarter repeats ("every other Thursday") |
| T7 | **Reminders and emails**: timed, prep-step and evening nudges | Built | Melody email design; per-person nudge time; push notifications (**Better native**); location reminders (**Native only**) |
| T8 | **Settings**: text size, haptics, sound, people, the sheet | Built | Group and use switches; long email hides "Send link" |
| T9 | **Look and feel**: Hearth, dark mode, icon | Built | Neutral dark-mode shadows; live transcript contrast |

---

## Epic 2: Shopping

A shared shopping list for Nas and Sandi, in its own tab, filled by voice or typing like tasks. Start small, then grow.

### Phase 1: start small (Next, in this order)

| # | Feature | What it does | Done when |
|---|---|---|---|
| S1 | **Shopping tab with one shared list** | A Tasks / Shopping switch in the bottom bar. One list both people see. Add an item (name, optional quantity and note), tick it bought, swipe to delete with Undo, a "Bought" section that can be cleared. Shows who added each item with the owner colours. New `Shopping` tab in the sheet; refreshes like tasks. | Both phones see the same list; ticking is instant and survives a refresh; works with old and new `Code.gs` during the deploy gap |
| S2 | **Add items by voice and typing** | The same mic and + as tasks. On the Shopping tab, what you say becomes items ("milk, eggs and two loaves of bread" → 3 items with quantities). On Tasks, a recording that's clearly shopping ("we need milk and eggs") offers to put it on the list; a mixed recording splits into tasks and items on Review. Simple rules and Claude both handle it. | "Milk, eggs and two loaves of bread" gives 3 items; "Cook the ragu tonight, and we need milk" gives 1 task and 1 item on Review; nothing said is lost |
| S3 | **Stores** | Keep a short list of stores (Carrefour, Spinneys, pharmacy…). Tag an item with the stores that have it (one or more). Filter the list by store ("I'm at Spinneys" shows only what you can get there). Voice: "eggs from Spinneys". New `Stores` tab in the sheet. | Filtering by a store shows only its items plus untagged ones |

### Phase 2 (Later)

| # | Feature | What it does |
|---|---|---|
| S4 | **Lists by store** | A view grouped by store, each like its own list, with an item shown under every store that has it |
| S5 | **Linked to tasks** | A task's prep step ("Get groceries at the supermarket") holds shopping items. Ticking them all off ticks the step; "Cook the ragu" puts its ingredients on the list |
| S6 | **Repeat staples** | Mark regulars (milk, eggs). Once bought, they come back after a while, or with one tap from "Add again" |

### Ideas (to discuss)

- Item preferences: brand, size, "the one Sandi likes"; remembered next time.
- "I'm going shopping": tell the other person, so they can add things in time.
- Item history and suggestions as you type.
- Aisle or category order within a store.
- Prices and a link to the household ledger.
- Reminder when near a store (**Native only**: web apps can't watch your location in the background).
