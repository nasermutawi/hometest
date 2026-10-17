# Melody: notes for Claude

- The live app is the Google Sheets edition: `docs/index.html` (served by GitHub Pages from the branch `claude/household-task-app-mfl3pq`) and `google-sheets/Code.gs` + `Parser.gs` (pasted into Apps Script and deployed by hand). Work on a new branch and open a pull request.
- The household is **Nas** and **Sandi**. Use these names in examples, mockups and test data.
- Look and feel follows `docs/design/hearth.md`. The previous look is recorded in `docs/design/style-original-green.md`.
- Ideas go in `BACKLOG.md`. Whenever something runs into a limit of the web app (iOS Safari, home-screen apps, Apps Script), tag the backlog item **Native only** or **Better native** and say the limit in one line. See "Native app tags" at the top of the backlog.
- Shared skills live in a separate repo, `nasermutawi/claude-skills` (under `.claude/skills/`). For any UI or UX work, attach that repo and use its **ui-ux-pro-max** skill alongside `docs/design/hearth.md`. Hearth wins where they disagree.
