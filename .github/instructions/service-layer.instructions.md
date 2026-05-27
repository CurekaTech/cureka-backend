---
applyTo: "modules/**/*.service.ts"
---

# Service Layer Instructions

You are working in a **NestJS service file**.

## Rules

- Services contain **orchestration and business logic only**.
- Do NOT import `Repository<T>` or `DataSource` directly — use the module's repository class.
- Do NOT write TypeORM query builders here — that belongs in the repository.
- Throw `NotFoundException`, `ConflictException`, `ForbiddenException` as appropriate.
- Always check existence before update/delete and throw `NotFoundException` if missing.
- Hash passwords with `hashPassword()` from `@shared/utils/hash.util` — never store plain text.
- Return mapped response interfaces (`IUser`, `IAdminUser`) — never return raw entities.
- Use mappers from the `mappers/` folder for entity → interface transformation.
- For paginated responses, use `buildPaginatedResult()` and `buildPaginationOptions()` from `@shared/utils/pagination.util`.

## Transaction Pattern

```typescript
// Inject DataSource for transactions
constructor(
  private readonly myRepository: MyRepository,
  private readonly dataSource: DataSource,
) {}

async createWithRelated(dto: CreateDto): Promise<IMyEntity> {
  return this.dataSource.transaction(async (manager) => {
    // Use manager-aware repository methods
    const entity = await this.myRepository.createWithManager(manager, dto);
    return mapEntityToResponse(entity);
  });
}
```
