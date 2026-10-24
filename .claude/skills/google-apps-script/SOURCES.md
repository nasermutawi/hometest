# How this skill was built

- **Raw material:** [Skill Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) v3.10.0, run on a local copy of [googleworkspace/apps-script-samples](https://github.com/googleworkspace/apps-script-samples) (October 2026). Kept from its output: `references/sample-docs/` (each sample's README, sorted by topic). Dropped as noise: config-file statistics, dependency graphs and the generic SKILL.md.
- **Enhancement:** written by Claude, because Skill Seekers' AI step couldn't run in the cloud workspace. On a personal computer, `skill-seekers enhance <folder> --agent claude` does this step with Claude Code.
- **Samples:** six files copied unchanged from Google's repository, under the Apache 2.0 licence (`references/samples/LICENSE-apache-2.0.txt`).
- **Limits and web app behaviour:** checked against Google's pages on 2026-10-18: [quotas](https://developers.google.com/apps-script/guides/services/quotas), [Content service](https://developers.google.com/apps-script/guides/content), [Cache](https://developers.google.com/apps-script/reference/cache/cache).

To refresh: re-run Skill Seekers on a new copy of the samples, keep `sample-docs/`, and re-check the quotas page.
