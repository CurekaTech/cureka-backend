# Output Format & Preservation

These rules govern how agents structure their output to ensure clarity, traceability, and developer trust.

## File Modification Rules
- Always show a **before/after diff summary** at Phase 3 before modifying any file.
- When editing an existing file, modify **only the targeted section** — preserve all surrounding code.
- Never reformat, reorganize, or rename identifiers that are not part of the current task scope.
- Preserve existing import order, newline conventions, and comment blocks.

## Communication Format
- Phase output must be labeled clearly: `## Phase N — <Phase Name>`.
- Code blocks must specify the language: ` ```typescript `, ` ```bash `, ` ```sql `.
- File paths must be workspace-relative and wrapped in inline code: `modules/users/services/users.service.ts`.
- Findings and recommendations use this structure:
  ```
  **[Severity]** `path/to/file.ts` — Short description
  > Detail and recommended fix
  ```

## Prohibited Output Patterns
- Do NOT output entire unchanged files to show a small edit.
- Do NOT include `// ... existing code ...` placeholders inside generated code blocks that will be used as-is.
- Do NOT speculate on file contents — use `codebase` or `search` tools to read first.
- Do NOT produce ambiguous "you could also..." alternatives inside a phase output — produce one canonical recommendation.

## Report Artifacts
- Code review reports are saved to `reports/<YYYY-MM-DD>-<feature-or-pr-name>.md`.
- Reports include: summary table, phase-by-phase findings, and a final pass/fail verdict with blockers listed.
