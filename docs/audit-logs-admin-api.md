# Audit Logs — Admin API

Read-only activity log for the admin panel. The page lists audit rows and opens one row. There is no create, update, or delete endpoint.

Migration: `1786001000000-audit-outbox-and-nullable-entity.ts`  
Run: `npm run migration:run`

The admin React app is not in this repo. The menu item below is already returned by the admin menu API.

---

## Menu / nav

From the admin menu API, under Audit Logs:

| Label | Key | Href | Permission |
|------|-----|------|------------|
| Activity Logs | `activity-logs-list` | `/admin/audit-logs` | `audit_logs.read` |

Parent: name `Audit Logs`, key `audit-logs`, icon `History`.

---

## Auth

- Header: `Authorization: Bearer <admin_jwt>`, or the `admin_token` cookie set by admin login
- Roles: `SUPER_ADMIN`, `ADMIN`
- Permission on both endpoints: `audit_logs.read`
- Base path: `/api/v1`

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/audit-logs` | Paginated list |
| `GET /admin/audit-logs/:id` | One row. `:id` is the audit row UUID |

A moderator token is rejected by the role guard even if the permission is present.

Opening the list or a detail row does not create an audit event. Older rows with `entityType` `audit_log_access` are hidden unless that entity type is requested. Login, logout, and other critical events are stored on `audit_logs` when the action commits. Logout is `entityType` `admin_auth` or `user_auth` and `action` `logout`.

---

## List

`GET /api/v1/admin/audit-logs`

Query parameters are all optional. Unknown query names are rejected with 400.

| Param | Type | Notes |
|-------|------|--------|
| `page` | integer | Default `1`. Minimum `1` |
| `limit` | integer | Default `20`. Minimum `1`, maximum `100` |
| `entityType` | string | Exact match, max 64 characters. Examples: `admin_auth`, `user_auth`, `admin_rbac`, `refund_request`, `cod_payout`, `blog_post`, `support_ticket` |
| `actorType` | enum | `ADMIN`, `USER`, `SYSTEM`, or `ANONYMOUS` |
| `actorId` | string | Exact match, max 255 characters |
| `action` | string | Exact match, max 64 characters. Examples: `login_success`, `login_failed`, `logout`, `APPROVED`, `REJECTED` |
| `from` | ISO date | Inclusive lower bound on `createdAt` |
| `to` | ISO date | Inclusive upper bound on `createdAt` |

`search`, `sortBy`, and `sortOrder` are accepted and ignored. The list is always newest first (`createdAt` descending).

Example:

`GET /api/v1/admin/audit-logs?actorType=ADMIN&action=login_failed&page=1&limit=30`

Success body:

```json
{
  "success": true,
  "message": "Audit logs retrieved successfully",
  "timestamp": "2026-10-12T07:00:00.000Z",
  "data": {
    "data": [
      {
        "id": "8f1c2b40-7e2a-4d1b-9c33-1a2b3c4d5e6f",
        "entityType": "admin_auth",
        "entityId": null,
        "entityRefId": "req-1",
        "action": "login_failed",
        "performedBy": "anonymous",
        "actorType": "ANONYMOUS",
        "actorId": null,
        "ipAddress": "203.0.113.8",
        "requestId": "req-1",
        "reliability": "critical",
        "details": {
          "email": "ad***@cureka.com",
          "outcome": "failure"
        },
        "createdAt": "2026-10-12T06:55:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 30,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Rows are in `data.data`. Pagination fields are siblings of that array.

---

## Detail

`GET /api/v1/admin/audit-logs/:id`

Success body:

```json
{
  "success": true,
  "message": "Audit log retrieved successfully",
  "timestamp": "2026-10-12T07:00:00.000Z",
  "data": {
    "id": "8f1c2b40-7e2a-4d1b-9c33-1a2b3c4d5e6f",
    "entityType": "refund_request",
    "entityId": "2c0b9a18-1111-4222-8333-444455556666",
    "entityRefId": "REF2026001",
    "action": "APPROVED",
    "performedBy": "finance@cureka.com",
    "actorType": "ADMIN",
    "actorId": "admin-user-uuid",
    "ipAddress": "203.0.113.8",
    "requestId": "req-9",
    "reliability": "critical",
    "details": {
      "status": "APPROVED"
    },
    "createdAt": "2026-10-12T06:40:00.000Z"
  }
}
```

A missing id returns 404 with message `Audit log {id} not found`. An id that is not a UUID returns 400.

---

## Row fields

| Field | UI use |
|-------|--------|
| `id` | Detail route param |
| `entityType` | What was changed |
| `entityId` | Business row UUID. `null` means there is no business row, usually an anonymous login or OTP failure. Do not treat null as "all entities" |
| `entityRefId` | Human reference, such as a refund ref id or the request id for an anonymous failure |
| `action` | What happened. Keep the string as stored |
| `performedBy` | Display name: admin email, user id, `anonymous`, or `system:{jobName}` |
| `actorType` | `ADMIN`, `USER`, `SYSTEM`, `ANONYMOUS`, or `null` on older rows |
| `actorId` | Admin or user id when known. `null` for anonymous and for older rows |
| `ipAddress` | Client IP after the trusted proxy decision. `null` on older rows and on system jobs |
| `requestId` | Request id for that action. `null` on older rows |
| `reliability` | `critical` or `best_effort`. `null` on older rows |
| `details` | JSON object or `null`. Already redacted. Render as key/value pairs. Sensitive values appear as `[redacted]` |
| `createdAt` | When the audit row was stored |

Older rows can omit `actorType`, `actorId`, `ipAddress`, `requestId`, and `reliability`. Show those cells as empty.

`details` never contains passwords, OTPs, tokens, cookies, authorization headers, or a full bank account number. Do not request a raw payload from another API to fill those in.

---

## Errors

```json
{
  "success": false,
  "statusCode": 400,
  "error": "Bad Request",
  "message": "actorType: actorType must be one of the following values: ADMIN, USER, SYSTEM, ANONYMOUS",
  "timestamp": "2026-10-12T07:00:00.000Z",
  "path": "/api/v1/admin/audit-logs?actorType=staff"
}
```

| Status | When |
|--------|------|
| 400 | Invalid query, or `:id` is not a UUID |
| 401 | Missing or invalid admin token |
| 403 | Role or `audit_logs.read` permission missing |
| 404 | Detail id does not exist |
