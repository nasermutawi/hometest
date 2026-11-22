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

A Melody Duet for building our online orders: a cart backed by a catalogue of the things we buy. Everything lives in the **Home – Groceries** Sheet (its link goes in the Settings tab's `Groceries sheet` row). Claude learns prices, usual stores and how often we buy things from Order history; the app never places an order.

### Phase 1: start small

| # | Feature | Status | What it does | Done when |
|---|---|---|---|---|
| S1 | **Cart and item catalogue** | Built | A To-dos / Shopping switch (Melody Duets). The Shopping tab is a cart: one find-or-add field with the mic inside, a "Usually by now" prompt, lines grouped by aisle with − / + and who added them, and a bar with "N in the cart · About AED X last time · Get prices". Typing searches our things (In cart or Add), things Claude saw in past orders, and offers to add the text as something new; Enter puts it in the cart in one step. Tapping an item opens its page: what it is, size, brand (empty means any), heart, and what Claude has learned (shown, never typed). "Get prices" parks a request in the Requests tab for a Claude to pick up. New tabs `Items` and `Requests`; the existing `Shopping list` tab is the cart. No ticks (still an open question). | Both phones see the same cart; changes are instant and survive a refresh; works with old and new `Code.gs` during the deploy gap |
| S2 | **Add items by voice and typing** | Next | Today the mic fills the search field. Next: what you say becomes items ("milk, eggs and two loaves of bread" → 3 items with quantities). On To-dos, a recording that's clearly shopping offers to put it in the cart; a mixed recording splits into tasks and items on Review. | "Milk, eggs and two loaves of bread" gives 3 cart lines; "Cook the ragu tonight, and we need milk" gives 1 task and 1 item on Review; nothing said is lost |
| S8 | **Whose Claude hunts for prices** | Built | A Settings switch, "My Claude" or "Sandi's Claude", for whose Claude picks up "Get prices" and fills the baskets. Only the admin (the person who deployed the app, Naser) can change it; Sandi sees it read-only. It never swaps on its own: if that computer is off, the run waits. Saved as `baskets.runner` in the Groceries sheet's Settings tab (key in column A, name in column B, as set up by hand before). While nothing is set, it's the admin's. | Naser switches it and Sandi's phone shows the change after a refresh; Sandi can't change it; a hand-typed `baskets.runner` row (even "Nas") still reads right |
| S3 | ~~Stores~~ | Replaced | No store field: which store has what, and at what price, is learned by Claude from Order history and Item insights (decided 22 Nov 2026). | |

### Phase 2 (Later)

| # | Feature | What it does |
|---|---|---|
| S4 | **Lists by store** | A view grouped by store, each like its own list, with an item shown under every store that has it |
| S5 | **Linked to tasks** | A task's prep step ("Get groceries at the supermarket") holds shopping items. Ticking them all off ticks the step; "Cook the ragu" puts its ingredients on the list |
| S6 | **Repeat staples** | Mark regulars (milk, eggs). Once bought, they come back after a while, or with one tap from "Add again" |
| S7 | **Baskets in the app** | When Claude has finished a price run, show its basket options (store, total after fees and credit, what's missing, the specific reason it wins) in the Shopping tab, instead of "Open the Sheet" |

### Ideas (to discuss)

- "I'm going shopping": tell the other person, so they can add things in time.
- Ticks on the cart (open question: what they'd mean when we order online).
- Prices and a link to the household ledger.
- Reminder when near a store (**Native only**: web apps can't watch your location in the background).
