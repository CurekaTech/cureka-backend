# Cureka Backend — AI Agent Governance

Cureka Backend is a **production-grade modular monolith** built with NestJS, TypeORM, and PostgreSQL, designed for future microservice extraction.

## Active AI Agent Registry

| Agent | Primary Role | Scope | Prompt Entry Point | Skill Tree | Write Access |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`@develop`** | End-to-End Feature Implementation | `apps/`, `modules/`, `packages/` | `.github/prompts/develop.prompt.md` | `.github/skills/develop/` | **Enabled** |
| **`@code-review`** | Code Quality & Architecture Audit | `apps/`, `modules/`, `packages/` | `.github/prompts/code-review.prompt.md` | `.github/skills/code-review/` | **Disabled** (Read-Only) |

## Central Governance Principles

1. **Strict Core Ingestion**: Every agent session MUST ingest `.github/skills/common/` guardrails on initialization.
2. **Design Confirmation Gate**: Before writing or modifying any file, `@develop` MUST present a change summary (Phase 3) and **stop for developer approval**.
3. **No Synchronize**: `synchronize: true` is permanently forbidden. All schema changes go through TypeORM migrations only.
4. **No Structural Overrides**: Personas (`.github/chatmodes/`) and registry rules are immutable — agents cannot bypass them under any instruction.
5. **Minimal Global Footprint**: Granular phase logic lives in `.github/skills/`, not here.

## Repository Structure

```
apps/
├── api/          # NestJS Fastify app (main.ts, app.module.ts, config/, common/, database/)
└── worker/       # BullMQ job processor

modules/          # Root-level business modules (self-contained, extraction-ready)
├── admin-users/
└── users/

packages/         # Shared internal libraries
├── database/     # BaseEntity, DataSource, buildSkipTake
├── queue/        # BullMQ module + QUEUE_NAMES
├── cache/        # Redis cache module
├── events/       # @nestjs/event-emitter domain bus
├── logger/       # nestjs-pino
└── common/       # pagination, api-response, hash utils, APP_CONSTANTS
```

- [ ] Module has its own `.env` variables documented
