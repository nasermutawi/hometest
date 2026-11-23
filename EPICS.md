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
| S2 | **Add items by voice and typing** | Part built | Built (Nov 23): the Shopping mic puts what you say straight in the cart, one line each ("milk, eggs and two loaves of bread" → 3 lines). Commas, "and" and numbers split it; names we already know stay whole and split dictation without commas; "two packs of" sets how many and "1.5 kilo" the size of a new item; one Undo takes it all back. Next: on To-dos, a recording that's clearly shopping offers to put it in the cart; a mixed recording splits into tasks and items on Review. | "Milk, eggs and two loaves of bread" gives 3 cart lines; "Cook the ragu tonight, and we need milk" gives 1 task and 1 item on Review; nothing said is lost |
| S8 | **Whose Claude hunts for prices** | Built | A Settings switch, "My Claude" or "Sandi's Claude", for whose Claude picks up "Get prices" and fills the baskets. Only the admin (the person who deployed the app, Naser) can change it; Sandi sees it read-only. It never swaps on its own: if that computer is off, the run waits. Saved as `baskets.runner` in the Groceries sheet's Settings tab (key in column A, name in column B, as set up by hand before). While nothing is set, it's the admin's. | Naser switches it and Sandi's phone shows the change after a refresh; Sandi can't change it; a hand-typed `baskets.runner` row (even "Nas") still reads right |
| S3 | ~~Stores~~ | Replaced | No store field: which store has what, and at what price, is learned by Claude from Order history and Item insights (decided 22 Nov 2026). | |

### Phase 2 (Later)

| # | Feature | What it does |
|---|---|---|
| S4 | **Lists by store** | A view grouped by store, each like its own list, with an item shown under every store that has it |
| S5 | **Linked to tasks** | A task's prep step ("Get groceries at the supermarket") holds shopping items. Ticking them all off ticks the step; "Cook the ragu" puts its ingredients on the list |
| S6 | **Repeat staples** | Mark regulars (milk, eggs). Once bought, they come back after a while, or with one tap from "Add again" |
| S7 | **Baskets in the app** | When Claude has finished a price run, show its basket options (store, total after fees and credit, what's missing, the specific reason it wins) in the Shopping tab, instead of "Open the Sheet" |
| S9 | **A full cart at every store** | Extends Smart baskets: the price run fills a cart at every store with the best match for each item (same pack sizes, fees, minimums and cashback counted), not only the winner's. One is marked Recommended with the real reason ("AED 12 cheaper after the HOP credit", "only Kibsons has egg whites"); Nas or Sandi can pick another store's basket instead, for any reason (speed, a slot, a mood). Today's shopping skills (`melody-shopping-run`, `melody-store-basket` in claude-skills) fill only the winner's cart, so they change too, and S7 shows the choice. Claude still never places an order: Naser confirms and pays |
| S10 | **Pull it back** | Sent the cart for prices, then remembered the yoghurt? Either of us can take a waiting "Get prices" request back out of Claude's queue, change the cart, and send it again. The button says **Pull it back**; the toast says "Pulled back. Tweak away, then hit Get prices again." It works while the request is waiting. Once a run has started it isn't cut off halfway: the button becomes "Redo with my changes", which lets the run finish and parks a fresh request for the new cart (the half-finished baskets are marked out of date). The request row keeps who pulled it back and when |
| S11 | **Claude's on it** | Shows where a "Get prices" request is, on both phones: waiting ("Queued for Nas's Claude"), running ("Claude's on it: hunting prices at Kibsons…", with which store it's on and when it started), ready, or failed (in plain words). It reads the status the Requests tab already keeps (waiting / running / ready / failed), so the run only needs to write the store it's on. It tells you whether S10's button is "Pull it back" or "Redo with my changes". A run with no update for a long while says so, instead of spinning forever |
| S12 | **Rules per person** | Today every Playbook and Store rules line applies to the whole house. Each rule gets a "Whose" value: Everyone (the default, so today's rules keep working), Nas or Sandi. A run reads Everyone's rules plus the rules of whoever sent "Get prices" (or whose Claude runs it, if nobody did). When two rules clash, the more specific one wins: a person's rule beats an Everyone rule, a rule for one item beats a rule for a whole store, and if two equally specific rules still clash, the newer one wins and the run notes the clash in its result ("Sandi prefers Kibsons, Nas avoids it: went with Sandi's, she sent the cart"). Hard limits (never place orders, stop at checkout) can't be overridden by anyone. The same pattern could later give other Melody Duets personal settings |
| S13 | **When to split an order** | For now a run always picks one winning store, with delivery and service fees counted. Later, optional rules say when a split is worth two orders, for example "only if we save more than AED 25 after both delivery fees" or "only if the winner is missing something we marked must-have". The run then shows a split alongside the single-store winner, never instead of it |
| S14 | **Things already in a store's cart** | A store cart may already hold items from before (a past test, something added by hand). The run spots them, keeps them out of the comparison, and reports them ("Kibsons already had 3 things in the cart: AED 41"), so the total shown matches what checkout will really say. In the app, the basket asks: "Clear them out" or "Keep them". Until that's built, the run leaves them alone and lists them in its result. It never removes them without asking |

### Ideas (to discuss)

- "I'm going shopping": tell the other person, so they can add things in time.
- Ticks on the cart (open question: what they'd mean when we order online).
- Prices and a link to the household ledger.
- Reminder when near a store (**Native only**: web apps can't watch your location in the background).
