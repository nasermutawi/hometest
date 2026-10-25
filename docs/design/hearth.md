# Melody design system: Hearth

**Mood:** the notepad on the kitchen table, if it were kind and well organised. Oat paper, a soft serif for headings, pebble-shaped checks, and colour that means *who*.

Every screen and every new feature uses these tokens. All colours live in CSS custom properties in `docs/index.html`; components never use raw hex values.

## People

| Who | Ring / fill | Pill background | Pill text | Dark ring | Dark pill bg / text |
|---|---|---|---|---|---|
| Nas (first member) | `#2F6F78` teal | `#DCEBEC` | `#1F4E55` | `#6FB3B8` | `#1E3538` / `#A9D3D6` |
| Sandi (second member) | `#D98A3F` apricot (fill `#EFA35C`) | `#FBE7D2` | `#8A4E14` | `#F4B57A` | `#3D2A17` / `#F7CB9F` |
| Both | split ring, half teal, half apricot | split pill | `#4A3F36` | split | split / `#E5DACD` |
| Anyone | dashed `#A89F94` ring | no fill, dashed border | `#75685C` | dashed `#7D7369` | dashed / `#B9AC9E` |

The two person colours differ in lightness as well as hue, so they still read apart in greyscale and for colour-blind eyes. Ownership is always shown by shape too (solid, split, dashed), not by colour alone.

## Colour tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6EFE4` oat | `#1C1714` | page |
| `--surface` | `#FFFBF4` paper | `#28211C` | cards, sheets, list groups |
| `--soft` | `#EFE6D8` | `#221C18` | quiet panels |
| `--chip` | `#F0E6D8` | `#332A24` | chips, segmented control |
| `--line` | `#EBE1D3` | `#352C26` | dashed row dividers |
| `--text` | `#2E2620` cocoa | `#F3EADF` | |
| `--muted` | `#75685C` | `#B9AC9E` | meta text |
| `--accent` | `#8E3B52` damson | `#E08AA0` | primary buttons, mic, links |
| `--danger` | `#A63A2B` | `#EF8A7A` | overdue, delete |
| `--done` | `#557A4A` sage | `#7FA571` | swipe-to-done |
| attention | bg `#F3E2E6`, text `#6F2C40` | bg `#3A2229`, text `#F2C6D2` | "Add a date" and other missing details |

## Type

- **Fraunces** (Google Fonts, `SOFT` 100) for screen titles and section headings. Section headings are italic ("*Today*") with a small hand-drawn underline.
- **Figtree** 400–700 for everything else: rows 16px/600, meta 13px, labels 12–13px.
- Inputs are at least 16px, so iPhone never zooms in on focus.

## Shape

- Checks are pebbles: 26px with a 40% radius, a 2.5px ring in the owner's colour, filled with the owner's colour when done.
- List sections are paper cards (radius 22) on the oat page, with dashed dividers between rows.
- Chips have a 10px radius. Buttons are 54–56px tall with an 18px radius. Sheets have a 28px top radius.
- Mic buttons are damson pebbles.

## Motion

Short and soft: 120 ms taps, 220 ms UI changes, gentle springs on sheets. Everything respects "reduce motion".

- Two curves, shared by everything: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for presses and things arriving, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` for sheets. No `ease-in`.
- Press: buttons and chips shrink to 0.97 in 120 ms; text links and full-width rows dim instead. Hover styles only on a real pointer.
- Tick: the box fills and the mark draws (240 ms), the row holds 600 ms, then folds away (220 ms).
- Sheets rise from the bottom edge (400 ms) and leave the same way at the speed they were flicked (150 to 320 ms).
- Toasts rise 8 px and fade in (200 ms) and leave the same way (150 ms).
- Lists and navigation never animate: they are used too often.
- Text size (Standard, Larger 1.12x, Largest 1.25x) is a per-phone setting. Pinch zoom stays off.

## Screen space

The top and bottom of every screen stay minimal so the content gets the room.

- Headers: about 50–56px. Tasks uses a large title that turns into a 44px one-line title (blurred oat) once you scroll. Back and ✕ stay pinned on long pages.
- Bottom bar: 56px plus the home-indicator area, 44px buttons, the microphone a 56px damson pebble sitting up out of the bar. On Tasks it steps aside while scrolling down.
- No loading bars for background work; a thin bar only for a save still going after 5 seconds.

## Gestures and feedback

- Swipe rows (right: done, left: Delete), drag sheets down, swipe back from the left edge, long-press a task for quick actions, pull down on Tasks to refresh. Every gesture also has a visible button.
- Light haptic taps on commits (done, a swipe passing its point, mic start/stop, long-press, back). On by default, per phone.
- Completion chime: off by default, per phone.
- Saving: the task page collects changes until **Save changes** (with **Discard** beside it); changed parts say "Not saved", and leaving asks first. Ticks and voice edits act at once. Sheets that create or review tasks have their own Save.
