# Prompt for the admin Audit Logs page

Paste this into the admin frontend (`/admin/audit-logs`) agent.

---

Update the Audit Logs page to show request payload and database field history.

APIs (admin proxy already used):

- List: `GET /admin/api/proxy/admin/audit-logs?page=&limit=`
- Detail: `GET /admin/api/proxy/admin/audit-logs/:id`

Do not display `reliability`. Keep existing list columns (entity, action, actor, time). Add optional badges for `captureStatus` and `changedFieldsCount`. Do not load payload/diffs in the table.

On row click, call the detail API and render:

1. Header: `subjectLabel`, `action`, `actorLabel`, `createdAt`, `entityType`, `entityRefId`, `batchId` when present.
2. Request context: `requestContext.source`, `method`, `path`, `requestId`, `batchId`. Empty when null.
3. Request payload: pretty-print `requestPayload` as JSON. Show “Not captured” when null. Values may be `[redacted]`.
4. Database changes table from `databaseChanges`:

| Table | Column / field | Type | Old value | New value |
| --- | --- | --- | --- | --- |
| `table` | `column` (`field`) | `changeType` | `oldValue` | `newValue` |

Format objects/arrays as JSON. `changeType` is `created`, `updated`, or `deleted`. Older logs can have `databaseChanges: []` and `captureStatus` null — keep the existing `details` key/value block as a fallback.

Example detail `data`:

```json
{
  "id": "36fe7310-5cc3-4ba4-bfeb-f112dd6d52ba",
  "entityType": "product",
  "entityId": "2f3207cc-10df-4a0f-b143-52a185a83da4",
  "entityRefId": "TES2026054554",
  "entityName": "Test Age Image kfnk",
  "action": "updated",
  "performedBy": "system-bulk-upload",
  "actorLabel": "system-bulk-upload",
  "requestId": "req-example-123",
  "batchId": "batch-example-456",
  "captureStatus": "captured",
  "requestContext": {
    "source": "bulk_upload",
    "method": "POST",
    "path": "/admin/products/bulk-upload",
    "requestId": "req-example-123",
    "batchId": "batch-example-456"
  },
  "requestPayload": {
    "productRefId": "TES2026054554",
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
    "toStatus": "pending_review",
    "actorEmail": "system-bulk-upload"
  },
  "createdAt": "2026-11-12T12:38:47.667Z"
}
```

Do not invent extra APIs. Permission is still `audit_logs.read`.
