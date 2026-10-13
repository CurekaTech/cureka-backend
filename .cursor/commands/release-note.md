---
description: Draft a read-only release playbook and business email
---

Load `.github/skills/release-note/SKILL.md` and follow every phase.

Ask for the release name, deployment window, selected repositories, source branch, production branch, comparison baseline, and target commit before generating files. Use `TBD` for unknown optional fields. Do not guess.

Build with:

```bash
npm run release-note:build -- --input <release.json>
```

Add `--collect` to resolve the manifest with read-only Git. Add `--refresh` when a version of this release id already exists. Add `--allow-fetch` only if the user explicitly allowed `git fetch`.

Write only under `reports/releases/<release-id>/`. Do not deploy, send the email, run migrations, or change Git history.
