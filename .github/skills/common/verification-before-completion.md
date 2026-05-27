# Verification Before Completion

Agents MUST complete all checks in this file before marking any phase as done or declaring implementation complete.

## Mandatory Verification Checklist

### TypeScript Compilation
```bash
npx tsc --noEmit
```
- **Required**: Zero errors. If errors appear, fix them before proceeding.
- Do NOT assume the build is clean — always run this after every file creation or modification.

### Linting
```bash
npm run lint
```
- **Required**: Zero ESLint errors. Warnings are acceptable but must be noted.

### Migration Integrity
After any entity change:
1. Run `npm run migration:generate -- apps/api/database/migrations/<DescriptiveName>`
2. **Inspect** the generated SQL manually — confirm only the expected columns/indexes changed.
3. Run `npm run migration:run` only after developer confirms the SQL is correct.
4. Confirm the migration table records the new entry: `SELECT * FROM migrations ORDER BY timestamp DESC LIMIT 1;`

### Module Registration
- Confirm the new module is imported in `AppModule` (`apps/api/app.module.ts`).
- Confirm the new entity is resolvable via `autoLoadEntities: true` OR listed in data-source entities glob.

### Route Registration
- Confirm the controller decorator path matches the intended API prefix (`api/v1/<resource>`).
- Confirm all protected routes have `@UseGuards(JwtAuthGuard)`.

### Completion Gate
Before declaring a feature complete, confirm:
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run lint` → 0 errors
- [ ] Migration generated, reviewed, and successfully run
- [ ] Module registered in `AppModule`
- [ ] All guarded routes confirmed
- [ ] No `console.log` or debug artifacts left in code
