# Audit Logs — Admin API

Read-only activity log for the admin panel. The page lists audit rows and opens one row. There is no create, update, or delete endpoint.

Migration: `1786001000000-audit-outbox-and-nullable-entity.ts`  
Run: `npm run migration:run`

The admin React app is not in this repo. The menu item below is already returned by the admin menu API.

UI binding for names, ids, and the Reliability field: [audit-logs-admin-integration.md](./audit-logs-admin-integration.md). Do not display `reliability` on the admin screen.

Admin page prompt (payload + field history): [audit-logs-admin-frontend-prompt.md](./audit-logs-admin-frontend-prompt.md).

Migration: `1786032000000-audit-log-payload-and-changes.ts` (adds `audit_logs` payload columns and `audit_log_changes`).

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
    "batchId": null,
    "reliability": "critical",
    "captureStatus": "partial",
    "changedFieldsCount": 0,
    "requestContext": {
      "source": "admin_api",
      "method": "PATCH",
      "path": "/api/v1/admin/refund-requests/REF2026001/approve",
      "requestId": "req-9",
      "batchId": null
    },
    "requestPayload": {
      "status": "APPROVED"
    },
    "databaseChanges": [],
    "details": {
      "status": "APPROVED"
    },
    "createdAt": "2026-10-12T06:40:00.000Z"
  }
}
```

Product update example (bulk upload):

```json
{
  "success": true,
  "data": {
    "id": "36fe7310-5cc3-4ba4-bfeb-f112dd6d52ba",
    "entityType": "product",
    "entityId": "2f3207cc-10df-4a0f-b143-52a185a83da4",
    "entityRefId": "TES2026054554",
    "entityName": "Test Age Image Updated",
    "action": "updated",
    "performedBy": "system-bulk-upload",
    "actorLabel": "system-bulk-upload",
    "requestId": "req-example-123",
    "batchId": "BUP2026001234",
    "reliability": "best_effort",
    "captureStatus": "captured",
    "requestContext": {
      "source": "bulk_upload",
      "method": null,
      "path": "/admin/products/bulk-upload",
      "requestId": null,
      "batchId": "BUP2026001234"
    },
    "requestPayload": {
      "name": "Test Age Image Updated",
      "slug": "test-age-image-updated"
    },
    "databaseChanges": [
      {
        "table": "products",
        "recordId": "2f3207cc-10df-4a0f-b143-52a185a83da4",
        "column": "name",
        "field": "name",
        "changeType": "updated",
        "oldValue": "Test Age Image kfnk",
        "newValue": "Test Age Image Updated"
      }
    ],
    "changedFieldsCount": 1,
    "details": {
      "fields": ["name"],
      "fromStatus": "pending_review",
      "toStatus": "pending_review"
    },
    "createdAt": "2026-11-12T12:38:47.667Z"
  },
  "message": "Audit log retrieved successfully"
}
```

A missing id returns 404 with message `Audit log {id} not found`. An id that is not a UUID returns 400.

---

## Row fields

| Field | UI use |
|-------|--------|
| `id` | Detail route param |
| `entityType` | What was changed |
| `entityId` | Business row UUID. Keep this for filters and links. `null` means there is no business row, usually an anonymous login or OTP failure |
| `entityRefId` | Business ref id, such as `TES2026380319` |
| `entityName` | Readable name looked up or stored with the event, such as the product name. `null` when the row has no name |
| `subjectLabel` | Name and ref id together, such as `Test Serum · TES2026380319`. Show this instead of the raw UUID |
| `action` | What happened. Keep the string as stored |
| `performedBy` | Admin email, user id, `anonymous`, or `system:{jobName}` |
| `actorType` | `ADMIN`, `USER`, `SYSTEM`, `ANONYMOUS`, or `null` on older rows |
| `actorId` | Admin or user UUID when known. Keep this for filters |
| `actorName` | Admin full name or customer first and last name. `null` when it cannot be resolved |
| `actorLabel` | Name and email together, such as `Sahil Admin · sahil.admin@cureka.com`. Show this beside `actorId` |
| `ipAddress` | Client IP after the trusted proxy decision. `null` on older rows and on system jobs |
| `requestId` | Request id for that action. `null` on older rows |
| `batchId` | Bulk job ref id when the write came from bulk upload. `null` otherwise. List and detail both return it |
| `reliability` | Returned as `critical`, `best_effort`, or `null`. Do not display this field on the admin UI |
| `captureStatus` | `captured` when request payload and field diffs were stored, `partial` when only one of those exists, `skipped` or `null` on older rows |
| `changedFieldsCount` | Number of field-level diffs. List and detail both return it |
| `requestContext` | Detail only. Source, method, path, request id, batch id |
| `requestPayload` | Detail only. Redacted snapshot of the write payload. `null` on older rows and on auth/OTP routes |
| `databaseChanges` | Detail only. Array of `{ table, recordId, column, field, changeType, oldValue, newValue }` from `audit_log_changes` |
| `details` | JSON object or `null`. Already redacted. Render as key/value pairs. Sensitive values appear as `[redacted]`. Includes `subjectName`, `subjectId`, `subjectRefId`, `subjectLabel`, and when known `actorName` and `actorEmail` |
| `createdAt` | When the audit row was stored |

Older rows can omit `actorType`, `actorId`, `ipAddress`, `requestId`, `reliability`, `batchId`, `requestPayload`, and `databaseChanges`. Show those cells as empty.

`details`, `requestPayload`, and `databaseChanges` never contain passwords, OTPs, tokens, cookies, authorization headers, or a full bank account number. Do not request a raw payload from another API to fill those in.

The list endpoint does not return `requestPayload`, `requestContext`, or `databaseChanges`. Open the detail endpoint for the before/after table.

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
