# Style snapshot: Original (green)

The app's look before the Hearth reskin (October 2026), kept so it can be restored.

**Saved copy:** the branch `style/original-green` holds the whole app exactly as it was (commit `573c3ad`).

## How to roll back

- **Whole app, quickest:** revert the "Hearth reskin" pull request on GitHub (open the merged PR → **Revert**), then merge the revert PR.
- **Look only, keep later features:** ask Claude Code: *"Restore the original green style from `docs/design/style-original-green.md` (the tokens and fonts below), keeping all current features."*
- **Copy one file back:** `git checkout style/original-green -- docs/index.html docs/icon.svg docs/apple-touch-icon.png` (this also removes any features added since).

## Character

Clean white app, forest-green accent, Manrope everywhere, heavy 800-weight titles, soft grey chips, round checkboxes in neutral grey, owner shown only as a coloured pill (blue / pink).

## Fonts

- Manrope 400–800 from Google Fonts, for everything.
- `--font: 'Manrope', 'Segoe UI', system-ui, -apple-system, sans-serif`
- Titles: `.title-xl` 26px/800, `.title-l` 22px/800, detail title 28px/800. Labels (`.eyebrow`) 12px/700 uppercase.

## Colour tokens: light

```css
--bg: #ffffff; --soft: #f5f6f4; --chip: #eef1ef; --line: #eef0ee; --border: #e3e7e4; --border-strong: #d5dad6;
--text: #16201b; --muted: #5f6b65; --faint: #8c978f;
--accent: #24614f; --accent-hover: #1a4a3c; --accent-soft: #e4f0eb; --accent-ink: #1a4a3c; --on-accent: #ffffff;
--amber-bg: #fdf3e1; --amber-ink: #7a4a00; --amber-dot: #c77c00; --amber-line: #e8c27a;
--p1-bg: #dce8f5; --p1-ink: #1f3b63; --p2-bg: #f3e3ec; --p2-ink: #6b2448;
--shared-bg: #e4f0eb; --shared-ink: #1a4a3c; --none-bg: #f1f2f1; --none-ink: #5f6b65;
--danger: #b23b2e; --toast-bg: #16201b; --toast-ink: #ffffff; --toast-link: #9dc3b6; --scrim: rgb(22 32 27 / 0.45);
```

## Colour tokens: dark

```css
--bg: #121715; --soft: #0d1210; --chip: #1e2622; --line: #222a26; --border: #2c3631; --border-strong: #3a4540;
--text: #e8ede9; --muted: #a3aea8; --faint: #6f7a74;
--accent: #5db597; --accent-hover: #7cc9ae; --accent-soft: #1b3029; --accent-ink: #bfe3d5; --on-accent: #08130f;
--amber-bg: #3a2c12; --amber-ink: #f3cf8a; --amber-dot: #e0a23a; --amber-line: #7a5a1e;
--p1-bg: #1e2b3d; --p1-ink: #b9cdea; --p2-bg: #3a2230; --p2-ink: #ebc0d5;
--shared-bg: #1b3029; --shared-ink: #bfe3d5; --none-bg: #222a26; --none-ink: #a3aea8;
--danger: #ef7d70; --toast-bg: #e8ede9; --toast-ink: #121715; --toast-link: #24614f; --scrim: rgb(0 0 0 / 0.6);
```

## Shapes and other details

- Buttons: primary 56px tall, radius 16; secondary 52px, radius 14. Chips 40px (36 small), radius 20 (fully round). Segmented control radius 22.
- Checkbox: 24px circle, 2px `--faint` border, fills `--accent` when done. Prep-step box: 22px, radius 6.
- Bottom sheets: radius 24 on top. Review cards: radius 16 on `--soft`.
- Swipe: done = `#2f7d5d`, delete = `--danger`.
- Mic: 132px green circle with a soft green shadow on the home screen; 68px in the bar.
- App icon: green `#24614f` rounded square with a white microphone. `theme-color` `#24614f`. Page title "Household".
