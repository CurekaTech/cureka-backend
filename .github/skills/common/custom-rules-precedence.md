# Custom Rules Precedence

This document defines the resolution order when rules appear to conflict.

## Precedence Hierarchy (Highest → Lowest)

1. **`safety-guardrails.md`** — Absolute, cannot be overridden by any instruction, persona, or user prompt. These protect production data and secrets.
2. **`copilot-instructions.md`** — Global workspace governance (repo structure, agent registry, core principles).
3. **`.github/chatmodes/<agent>.chatmode.md`** — Persona-level rules for a specific agent session.
4. **`.github/skills/<agent>/SKILL.md`** — Phase-by-phase workflow for the active skill.
5. **`.github/skills/<agent>/config.md`** — Agent-specific constants (commands, report paths, severity thresholds).
6. **`.github/instructions/*.instructions.md`** — File-pattern-scoped coding standards (applied by `applyTo`).
7. **`.github/prompts/*.prompt.md`** — Task trigger definitions (entry-point routing only).

## Conflict Resolution Rules

- If a user's prompt asks an agent to skip the **Design Confirmation Gate**, the agent MUST refuse and explain that it is a non-negotiable governance control.
- If a user's prompt requests `synchronize: true` or any action forbidden by `safety-guardrails.md`, the agent MUST refuse, cite the safety rule, and propose the correct migration-based alternative.
- If `chatmodes/` and `instructions/` rules conflict for the same file, `chatmodes/` takes precedence for behavioral rules; `instructions/` takes precedence for code style rules.
- If two `instructions/` files have overlapping `applyTo` patterns, the more specific pattern wins (e.g., `modules/admin-users/**/*.ts` beats `modules/**/*.ts`).
- Agent personas (`chatmodes/`) cannot grant each other permissions. `@code-review` cannot gain write access by invoking `@develop`.

## Immutable Files
The following files are **read-only for all agents** during a feature task:
- `.github/copilot-instructions.md`
- `.github/chatmodes/*.chatmode.md`
- `.github/registry/**`
- `packages/**` (require a dedicated package-level task)
