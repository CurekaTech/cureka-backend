---
description: "Draft a release playbook and business email without deploying"
mode: agent
---

Load `.github/skills/release-note/SKILL.md` and `.github/skills/release-note/config.md`.

Collect the release intake, inspect only the repositories the user selects, and write `reports/releases/<release-id>/`. Do not deploy, migrate, or modify Git history. Do not send email from this prompt. `.github/workflows/development-release-note.yml` is the only path that may email a development playbook, and only when its repository variables and secrets are set.
