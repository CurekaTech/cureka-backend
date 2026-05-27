# `@develop` — Backend Configuration Reference

## Repository
| Constant | Value |
|----------|-------|
| Repository name | `cureka-backend` |
| Base trunk | `main` |
| Temp workspace | `develop/.temp/<feature>/` |

## Branch Prefix Convention
| Scope | Prefix | Example |
|-------|--------|---------|
| New feature | `feature/` | `feature/CUR-42-admin-login` |
| Bug fix | `bugfix/` | `bugfix/CUR-55-fix-token-expiry` |
| Hotfix (prod) | `hotfix/` | `hotfix/CUR-60-null-pointer-crash` |
| Migration only | `migration/` | `migration/CUR-61-add-user-phone` |
| Chore / config | `chore/` | `chore/CUR-62-update-eslint` |

## Conventional Commit Types
| Type | When to Use |
|------|------------|
| `feat` | New feature or endpoint |
| `fix` | Bug fix |
| `refactor` | Code restructure, no behavior change |
| `test` | Adding or updating tests |
| `chore` | Build, tooling, dependency updates |
| `docs` | Documentation changes only |
| `migration` | Database migration files |

**Format**: `<type>(<scope>): <short description> [<JIRA-ID>]`
**Example**: `feat(admin-users): add login endpoint and JWT strategy [CUR-42]`

## Key Commands

| Purpose | Command |
|---------|---------|
| TypeScript type-check | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Generate migration | `npm run migration:generate -- apps/api/database/migrations/<Name>` |
| Run migrations | `npm run migration:run` |
| Revert last migration | `npm run migration:revert` |
| Show migration status | `npm run migration:show` |
| Run unit tests | `npm run test` |
| Run E2E tests | `npm run test:e2e` |
| Build all | `npm run build` |

## Path Aliases
| Alias | Resolves To |
|-------|------------|
| `@modules/*` | `modules/*` |
| `@packages/*` | `packages/*/src/index` |
| `@config/*` | `apps/api/config/*` |
| `@common/*` | `apps/api/common/*` |
| `@database/*` | `apps/api/database/*` |

## Shared Utilities Reference

### `@packages/common`
| Export | Usage |
|--------|-------|
| `hashPassword(plain)` | bcrypt hash with 12 rounds |
| `comparePasswords(plain, hash)` | bcrypt compare |
| `buildPaginationOptions(query)` | Build skip/take from page+limit |
| `buildPaginatedResult(data, total, query)` | Build `PaginatedResult<T>` |
| `buildSuccessResponse(data, message?)` | Wrap in `ApiResponse<T>` |
| `APP_CONSTANTS` | Shared constants (page sizes, etc.) |

### `@packages/database`
| Export | Usage |
|--------|-------|
| `BaseEntity` | Extend all entities from this (id, createdAt, updatedAt) |
| `AppDataSource` | TypeORM DataSource (used by migrations CLI) |
| `buildSkipTake(page, limit)` | Returns `{ skip, take }` for TypeORM queries |

## Module Scaffold Checklist
When creating a new module, create files in this order:
1. `entities/<name>.entity.ts`
2. *(generate + review migration)*
3. `interfaces/<name>.interface.ts`
4. `enums/<name>-*.enum.ts` (if needed)
5. `dto/<name>.dto.ts`
6. `repositories/<name>.repository.ts`
7. `mappers/<name>.mapper.ts`
8. `utils/<name>.util.ts` (if needed)
9. `services/<name>.service.ts`
10. `controllers/<name>.controller.ts`
11. `<name>.module.ts`
12. Register in `apps/api/app.module.ts`

## Environment Variables
| Variable | Used In |
|----------|---------|
| `DATABASE_URL` | TypeORM DataSource |
| `JWT_SECRET` | `jwt.config.ts` |
| `JWT_EXPIRES_IN` | `jwt.config.ts` |
| `REDIS_URL` | Cache + Queue |
| `PORT` | `main.ts` |
| `NODE_ENV` | App config |
