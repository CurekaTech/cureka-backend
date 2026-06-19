# Cureka Backend — Architecture Diagram

A production-grade **NestJS 10 modular monolith** running on **Fastify**, backed by **PostgreSQL (TypeORM)**, **Redis**, and pluggable **GCS / local** file storage. The repo is a Nest monorepo with two apps (`api`, `worker`), seven domain modules, and eight shared packages.

---

## 1. High-Level System Architecture

```mermaid
flowchart TB
  subgraph Clients
    Admin["Admin Panel"]
    Web["Website"]
    Mobile["Mobile App"]
  end

  subgraph API["apps/api — NestJS 10 + Fastify"]
    direction TB
    Plugins["Fastify Plugins<br/>CORS · Cookie · Multipart · Static"]
    Global["Global Cross-Cutting<br/>ValidationPipe · TransformInterceptor · AllExceptionsFilter · Pino Logger"]
    Swagger["Swagger UI<br/>/api/v1/docs"]

    subgraph Modules["Domain Modules (modules/)"]
      direction LR
      AuthM["auth"]
      AdminM["admin-users"]
      UsersM["users"]
      MasterM["master"]
      ProductM["product"]
      PublicM["public"]
      UploadsM["uploads"]
    end

    subgraph Packages["Shared Packages (packages/)"]
      direction LR
      P1["common"]
      P2["auth"]
      P3["cache"]
      P4["storage"]
      P5["logger"]
      P6["events"]
      P7["database"]
      P8["queue"]
    end
  end

  subgraph Worker["apps/worker — BullMQ (scaffolded)"]
    W["Queues: notifications · emails<br/>order-processing · analytics<br/>(no processors yet)"]
  end

  subgraph Infra["Infrastructure"]
    PG[("PostgreSQL<br/>TypeORM")]
    Redis[("Redis<br/>cache · OTP · sessions")]
    Storage[["GCS / Local FS<br/>file storage"]]
  end

  Admin -->|"JWT (admin_token)"| Plugins
  Web -->|"opaque session cookie"| Plugins
  Mobile -->|"OTP + session cookie"| Plugins

  Plugins --> Global --> Modules
  Modules --> Packages

  Packages --> PG
  Packages --> Redis
  Packages --> Storage

  Worker -. consumes .-> Redis
  Worker -. reads/writes .-> PG
```

---

## 2. Request Flow — Layered Architecture

Every module follows the same strict layering. Controllers are thin, services hold business logic, repositories own all DB access, and entities are **never** exposed directly — mappers convert them to interface contracts.

```mermaid
flowchart LR
  Req["HTTP Request"] --> Guard["Guards<br/>JwtAuthGuard / SessionCookieGuard<br/>RolesGuard / VerifiedUserGuard"]
  Guard --> Ctrl["Controller<br/>routes · DTO binding · @ResponseMessage"]
  Ctrl --> Svc["Service<br/>business logic · validation · orchestration"]
  Svc --> Repo["Repository<br/>TypeORM access · query builder · pagination"]
  Repo --> Ent["Entity<br/>extends BaseEntity"]
  Ent --> DB[("PostgreSQL")]

  Svc --> Map["Mapper<br/>Entity → Interface"]
  Map --> Iface["Interface<br/>API response contract"]
  Iface --> Intc["TransformInterceptor<br/>{ success, data, message, timestamp }"]
  Intc --> Res["HTTP Response"]

  Svc -. cache-aside .-> Cache[("Redis")]
  Svc -. emit .-> Events["Domain Events<br/>EventEmitter"]
  Events -. invalidate .-> Cache
```

---

## 3. Dual Authentication Model

Admin and ecommerce-user authentication are intentionally separate systems.

```mermaid
flowchart TB
  subgraph AdminAuth["Admin Auth — JWT + Passport"]
    A1["POST /auth/admin/login<br/>email + password (bcrypt)"]
    A2["JWT issued (@nestjs/jwt)"]
    A3["admin_token cookie (HttpOnly, 7d)"]
    A4["JwtStrategy: cookie OR Bearer"]
    A5["JwtAuthGuard + RolesGuard<br/>SUPER_ADMIN / ADMIN"]
    A1 --> A2 --> A3 --> A4 --> A5
  end

  subgraph UserAuth["Ecommerce User Auth — Opaque Session (no JWT)"]
    U1["POST /auth/send-otp"]
    U2["OTP (4-digit, 5 min, bcrypt-hashed)<br/>rate-limited via Redis cooldown"]
    U3["POST /auth/verify-otp"]
    U4["opaque user_session cookie<br/>token hashed in user_sessions table"]
    U5["SessionCookieGuard<br/>DB + Redis session cache"]
    U6["VerifiedUserGuard<br/>registered · non-guest · active"]
    U1 --> U2 --> U3 --> U4 --> U5 --> U6
    UG["Guest login<br/>isGuest session, no registration"] --> U4
  end
```

> Note: SMS / email delivery is **not yet integrated** — OTP defaults to `1234` in dev and is returned in the API response for non-production testing.

---

## 4. Module ↔ Package Dependencies

```mermaid
flowchart TB
  subgraph DomainModules
    auth["auth"]
    adminUsers["admin-users"]
    users["users"]
    master["master"]
    product["product"]
    public["public"]
    uploads["uploads"]
  end

  subgraph SharedPackages
    common["common<br/>response · pagination · refId · bcrypt"]
    pauth["auth<br/>JWT strategy · guards · decorators"]
    cache["cache<br/>Redis · cache-aside · invalidation"]
    storage["storage<br/>local / GCS providers"]
    logger["logger<br/>nestjs-pino"]
    events["events<br/>EventEmitter · domain events"]
    database["database<br/>BaseEntity · query helpers"]
    queue["queue<br/>BullMQ root"]
  end

  auth --> pauth
  auth --> cache
  auth --> users
  product --> master
  master --> cache
  master --> events
  product --> events
  uploads --> storage
  users --> storage
  master --> storage
  product --> storage

  auth --> common
  adminUsers --> common
  users --> common
  master --> common
  product --> common
  public --> common

  auth --> database
  adminUsers --> database
  users --> database
  master --> database
  product --> database
```

---

## 5. Bootstrap Sequence (`apps/api`)

```mermaid
sequenceDiagram
  participant Main as main.ts
  participant Nest as NestFactory
  participant App as app.module.ts
  participant Fastify

  Main->>Nest: create(FastifyAdapter)
  Nest->>App: load modules
  App->>App: ConfigModule.forRoot (Joi validation)
  App->>App: LoggerModule (Pino)
  App->>App: AppCacheModule (Redis)
  App->>App: EventsModule (EventEmitter)
  App->>App: DatabaseModule (TypeORM)
  App->>App: AuthModule (global)
  App->>App: AdminUsers · Users · Master · Uploads · Health · Public · Product
  App->>App: APP_INTERCEPTOR = TransformInterceptor
  Main->>Fastify: register CORS · Cookie · Multipart · Static
  Main->>Nest: setGlobalPrefix('api/v1')
  Main->>Nest: Swagger /api/v1/docs
  Main->>Nest: ValidationPipe + AllExceptionsFilter
  Main->>Nest: enableShutdownHooks()
  Main->>Nest: listen(PORT, '0.0.0.0')
```

---

## Stack Reference

| Layer | Technology |
|-------|-----------|
| Framework | NestJS `^10.4.1` (monorepo) |
| HTTP adapter | Fastify `^4.28.1` |
| API prefix | `api/v1` |
| ORM / DB | TypeORM `^0.3.20` + PostgreSQL (`pg`) |
| Cache / sessions / OTP | Redis (in-memory fallback) |
| File storage | Google Cloud Storage / Local FS (`STORAGE_DRIVER`) |
| Admin auth | JWT (`@nestjs/jwt`, Passport) — `admin_token` cookie |
| User auth | Opaque session cookie + OTP |
| Validation | `class-validator` + global `ValidationPipe`; Joi for env |
| Docs | Swagger at `/api/v1/docs` |
| Logging | `nestjs-pino` (redacted) |
| Events | `@nestjs/event-emitter` (in-process) |
| Jobs | BullMQ (`apps/worker`, scaffolded) |
| Local dev | `docker-compose.dev.yml` — Postgres 16 + Redis 7 |
