# Health Concerns API — Integration Guide

Base URL: `/api/v1`
Auth: All admin endpoints require `Authorization: Bearer <admin_jwt_token>`

---

## 1. Get All Health Concerns (paginated)

```
GET /master/health-concerns
```

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20) |
| `search` | string | No | Search by name or slug |
| `sortBy` | string | No | `createdAt`, `name`, `slug`, `status` |
| `sortOrder` | string | No | `ASC` or `DESC` |

### Response

```json
{
  "statusCode": 200,
  "message": "Health concerns retrieved successfully",
  "data": {
    "data": [
      {
        "id": "uuid",
        "refId": "HEA20261234",
        "name": "Diabetes",
        "slug": "diabetes",
        "description": "...",
        "icon": { "url": "https://..." },
        "banner": { "url": "https://..." },
        "status": "active",
        "inHomePage": true,
        "sortIndex": 1,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

---

## 2. Get Homepage Health Concerns ⭐ New

Returns **only** health concerns flagged for the homepage (`inHomePage: true`), ordered by `sortIndex` (ascending, nulls last).  
Use this to populate the homepage health concern section in the admin panel.

```
GET /master/health-concerns/homepage
```

No query parameters.

### Response

```json
{
  "statusCode": 200,
  "message": "Homepage health concerns retrieved successfully",
  "data": [
    {
      "id": "uuid",
      "refId": "HEA20261234",
      "name": "Diabetes",
      "slug": "diabetes",
      "description": "...",
      "icon": { "url": "https://..." },
      "banner": { "url": "https://..." },
      "status": "active",
      "inHomePage": true,
      "sortIndex": 0,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    },
    {
      "refId": "HEA20261235",
      "name": "Heart Health",
      "sortIndex": 1,
      ...
    },
    {
      "refId": "HEA20261236",
      "name": "Unordered Concern",
      "sortIndex": null,
      ...
    }
  ]
}
```

> **Note:** Items with `sortIndex: null` appear after all numbered items, sorted alphabetically by name.

---

## 3. Update Homepage Display Index ⭐ New

Sets the `sortIndex` (display order) for a health concern on the homepage.  
Lower index = shown first. Set to `null` to remove from ordered list.

```
PATCH /master/health-concerns/:refId/index
```

### Path Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `refId` | string | Yes | Health concern refId (e.g. `HEA20261234`) |

### Request Body

```json
{
  "sortIndex": 2
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sortIndex` | number or null | Yes | Display position (0-based). `null` = unordered. Min: 0, Max: 9999 |

### Examples

```json
// Set as first item
{ "sortIndex": 0 }

// Set as third item
{ "sortIndex": 2 }

// Remove from ordered list (show after all numbered items)
{ "sortIndex": null }
```

### Response

```json
{
  "statusCode": 200,
  "message": "Health concern index updated successfully",
  "data": {
    "refId": "HEA20261234",
    "name": "Diabetes",
    "sortIndex": 2,
    ...
  }
}
```

---

## 4. Get Single Health Concern

```
GET /master/health-concerns/:refId
```

---

## 5. Update Health Concern Status

```
PATCH /master/health-concerns/:refId/status
```

### Request Body

```json
{
  "status": "active"
}
```

| Value | Description |
|-------|-------------|
| `active` | Visible on site |
| `inactive` | Hidden from site |

---

## 6. Update Health Concern (full edit)

```
PATCH /master/health-concerns/:refId
```

Multipart form — same fields as create.

---

## 7. Create Health Concern

```
POST /master/health-concerns
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name (max 255 chars) |
| `slug` | string | No | Auto-generated from name if omitted |
| `description` | string | No | Rich text description |
| `status` | string | No | `active` (default) or `inactive` |
| `inHomePage` | boolean | No | Whether shown on homepage |
| `icon` | file | No | Icon image |
| `banner` | file | No | Banner image |

---

## 8. Delete Health Concern

```
DELETE /master/health-concerns/:refId
```

Soft-deletes the record. Returns 400 if the health concern is still in use by products.

---

## Recommended Admin UI Workflow for Homepage Ordering

1. Call `GET /master/health-concerns/homepage` to get the current ordered list
2. Display as a drag-and-drop list in the admin panel
3. When the user reorders, call `PATCH /master/health-concerns/:refId/index` for each changed item with its new `sortIndex` (0-based position)

```javascript
// Example: user moved items to new positions
const newOrder = ['HEA20261234', 'HEA20261236', 'HEA20261235'];

await Promise.all(
  newOrder.map((refId, index) =>
    fetch(`/api/v1/master/health-concerns/${refId}/index`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sortIndex: index }),
    })
  )
);
```

---

## How Homepage Order Works on the Frontend (Public)

The public homepage section **automatically** displays health concerns in `sortIndex` order.  
No changes needed on the public-facing frontend — the order comes from the database.

```
Lower sortIndex = shown first
null sortIndex = shown last (alphabetical)
```
