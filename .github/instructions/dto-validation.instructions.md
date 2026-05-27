---
applyTo: "modules/**/*.dto.ts"
---

# DTO Validation Instructions

You are writing a **NestJS Data Transfer Object (DTO)** file.

## Rules

- All DTOs must use `class-validator` decorators — no manual validation.
- `@IsNotEmpty()` before `@IsString()` / `@IsEmail()` etc. for required fields.
- Passwords require `@MinLength(8)` and a `@Matches()` regex for complexity.
- Email fields require `@IsEmail()` and `@MaxLength(255)`.
- Optional fields use `@IsOptional()` as the **first** decorator.
- For partial updates, use `PartialType(OmitType(CreateDto, [...] as const))`.
- Never add fields not needed by the operation.
- `@Type(() => Number)` is required before `@IsInt()` for query params.
- Enums use `@IsEnum(MyEnum)`.

## Password Complexity Pattern

```typescript
@IsNotEmpty()
@IsString()
@MinLength(8)
@MaxLength(128)
@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
  message: 'Password must contain uppercase, lowercase, and a number',
})
password!: string;
```
