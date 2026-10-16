# Spec: Native feel fixes and smarter capture

**Edition:** Google Sheets edition (`docs/index.html`, `google-sheets/Code.gs`, `google-sheets/Parser.gs`). Keep using the one data layer from the last change (`mutate`) for anything that writes.

Found while testing on an iPhone, with the app saved to the home screen.

**Not in this change:** the redesigned multi-task review (one-at-a-time / save-or-discard each). That is being designed first and will be its own spec.

## 1. No mic chime when leaving the app

**Symptom:** swiping up to leave the app plays the phone's microphone/dictation sound.

**Likely cause:** the speech-recognition session (`webkitSpeechRecognition` in `listen()`) isn't fully released after recording, so the phone ends it, with its sound, when the app goes to the background.

- On `visibilitychange` (hidden) and `pagehide`, `abort()` any live recognition, close the recording sheet, and drop the reference.
- After each recording ends, make sure nothing keeps the microphone (no leftover recognizer, no `getUserMedia` stream; stop all tracks if one is used).
- First check whether the sound also happens when nothing was recorded since the app opened. If it does, find the other cause and report it.

## 2. No zooming

- Viewport: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- `touch-action: manipulation` on `html` to stop double-tap zoom.
- Block pinch on iOS Safari: `preventDefault()` on `gesturestart`, `gesturechange` and `gestureend`.
- Every input, select and textarea must be at least 16px font size, or iOS zooms when it's focused (`.prep-row select` is 14px today).

## 3. Date and time pickers that open

**Cause:** `#date-picker` and `#time-picker` sit outside every `<dialog>`. While a dialog is open, everything outside it is inert, so "Pick a date" and "Other" time do nothing. iOS also only opens a picker from a real tap on the input itself.

- Put a real, transparent `<input type="date">` / `<input type="time">` directly over the "Pick a date" and "Other" chips, inside the same dialog, so the tap lands on the input. Remove the shared hidden inputs.
- Must work in: the new-task form, the date/time sheet, the quick-time sheet, and the review cards.

## 4. Bottom sheets behave like native sheets

Applies to every `dialog.sheet` (heard, type, when, choose and any others) **and** the new-task form (`#d-form`), which slides up the same way. Test each one on a phone.

- **Drag down to close:** drag from the grab handle or the header area; the sheet follows the finger and closes past about 30% of its height or on a quick flick, otherwise springs back. Scrolling content inside the sheet must still scroll, and only drag the sheet when the content is at the top.
- **Tap the dimmed background to close.**
- **What closing means:** the "Got it" sheet closes as **Save** (the tasks are already safe, nothing is lost). Everything else closes as **Cancel**.
- The full-screen Review gets a close (✕) button at the top left, and a **Discard** option until the new review design lands. It removes the reviewed tasks with Undo, using the existing `discardCapture`.

## 5. Short titles, and breaking a recording down

**Test case** (spoken in one go):

> "I need to cook a ragu this evening, so I need to go to the grocery store, get the groceries, and then pick up the special sauce from the shop next to the grocery store, and then cook the meal."

**Expected:** one task, **"Cook the ragu"**, today in the evening, with prep steps **"Get groceries at the supermarket"** and **"Pick up the special sauce next door"**, both today.

**Today:** one task with a long title and no steps.

- Rewrite `capturePrompt_()`:
  - Titles are short: about 2–6 words, starting with a verb. Never the whole sentence. Details that don't fit go in the note.
  - When the person describes a goal and the errands it needs, make one task for the goal with the errands as prep steps (`days_before` 0 when they happen the same day).
  - Unrelated things become separate tasks.
  - Don't invent steps that weren't said.
  - Include 3–4 short examples in the prompt, including the ragu one and a mixed one ("Cook the ragu tonight… also book the car service next week and renew the gym membership" → 3 tasks).
- Check whether the household actually has a Claude key set (`checkSetup`). If it doesn't, the simple rules in `Parser.gs` handle every recording. Improve those too:
  - Cap titles at a sensible length and move the rest into the note.
  - Split on "so I need to… and then…" patterns into prep steps where it's safe.
- Add tests for the ragu sentence and the 3-task sentence, for both the Claude path (mock the reply) and the rules path.

## Done when

- [ ] Leaving the app makes no sound, with or without a recording beforehand.
- [ ] Double-tap and pinch never zoom; tapping into a field never zooms.
- [ ] "Pick a date" and "Other" time open the phone's own picker everywhere they appear.
- [ ] Every bottom sheet closes by dragging down and by tapping the background; scrolling inside a sheet still works.
- [ ] The Review screen can be closed, and its tasks discarded with Undo.
- [ ] The ragu sentence gives "Cook the ragu" with two prep steps; the 3-task sentence gives three tasks with short titles.
- [ ] All tests pass.

## How to work

New branch off `claude/household-task-app-mfl3pq`, then a pull request. Don't push to the live branch. At the end, give the plain steps to test on the phone (the raw.githack preview link) and, if `Code.gs` or `Parser.gs` changed, how to paste and deploy a new version.
