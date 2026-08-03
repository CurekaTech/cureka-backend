# Admin Users — Frontend Integration Guide

Admin panel routes: `/users` (list) and `/users/[refId]` (detail).

**Base URL:** `/api/v1`  
**Auth:** Admin JWT (`Authorization: Bearer <token>`)  
**Proxy (local admin):** `/admin/api/proxy/users` → `/api/v1/users`

> Do **not** prefix with `admin/api/` after `/proxy/` — use `/admin/api/proxy/users`.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users` | Paginated users list with `totalOrders` / `totalSpend` |
| `GET` | `/users/:refId` | User detail + addresses + recent orders |
| `PATCH` | `/users/:refId/status` | Set `ACTIVE` / `INACTIVE` |
| `POST` | `/users/:refId/addresses` | Add address for user |

Roles: `SUPER_ADMIN`, `ADMIN`.

---

## 1. List users

```
GET /admin/api/proxy/users?page=1&limit=20&sortBy=createdAt&sortOrder=DESC
```

### Query params

| Param | Default | Notes |
|-------|---------|-------|
| `page` | `1` | 1-based |
| `limit` | `20` | max 100 |
| `search` | — | Matches firstName, lastName, email, mobileNumber, refId |
| `sortBy` | `createdAt` | See sortable columns below |
| `sortOrder` | `DESC` | `ASC` \| `DESC` (case-insensitive) |
| `status` | — | `ACTIVE` \| `INACTIVE` (case-insensitive; menu can send `active`) |
| `userType` | — | `guest` \| `customer` — menu filter for guest vs registered |
| `isGuest` | — | `true` \| `false` — same as `userType` (`userType` wins if both sent) |

### Sortable columns (`sortBy`)

| Column | Notes |
|--------|-------|
| `createdAt` | default |
| `updatedAt` | |
| `firstName` | |
| `lastName` | |
| `email` | |
| `mobileNumber` | |
| `refId` | |
| `status` | |
| `lastLoginAt` | |
| `isGuest` | guest vs customer |
| `isRegistered` | |
| `role` | |
| `totalOrders` | order count (users with 0 orders last when DESC) |
| `totalSpend` | sum of `grand_total` |
| `lastOrderAt` | most recent order time |

### Response shape

Paginated envelope uses `data` (not `rows`) — same as other admin lists:

```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "data": [
      {
        "id": "uuid",
        "refId": "USR2026123456",
        "firstName": "Rahul",
        "lastName": "Sharma",
        "email": "rahul.sharma@example.com",
        "mobileNumber": "9876543210",
        "isGuest": false,
        "isRegistered": true,
        "status": "ACTIVE",
        "role": "customer",
        "roleId": "uuid-or-null",
        "roleRecord": { "id": "...", "name": "Customer", "slug": "customer" },
        "profileImageUrl": null,
        "gender": "male",
        "dateOfBirth": "1995-08-15",
        "maritalStatus": "single",
        "country": null,
        "lastLoginAt": "2026-08-01T14:30:00.000Z",
        "createdAt": "2024-01-10T08:00:00.000Z",
        "updatedAt": "2026-08-01T14:30:00.000Z",
        "totalOrders": 12,
        "totalSpend": 4500.5,
        "lastOrderAt": "2026-07-15T10:30:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

Menu shortcuts:
- Active: `/users?status=active` → `GET .../users?status=ACTIVE`
- Inactive: `/users?status=inactive`
- Guests: `/users?userType=guest` → `GET .../users?userType=guest`
- Customers: `/users?userType=customer` → `GET .../users?userType=customer`

Example — registered customers, highest spend first:

```
GET /admin/api/proxy/users?userType=customer&sortBy=totalSpend&sortOrder=DESC&page=1&limit=20
```

---

## 2. User detail

```
GET /admin/api/proxy/users/:refId
```

Includes profile + metrics + `addresses` + `recentOrders` (latest 10).

```json
{
  "success": true,
  "message": "User details retrieved successfully",
  "data": {
    "refId": "USR2026123456",
    "firstName": "Rahul",
    "status": "ACTIVE",
    "totalOrders": 12,
    "totalSpend": 4500.5,
    "lastOrderAt": "2026-07-15T10:30:00.000Z",
    "addresses": [
      {
        "id": "uuid",
        "refId": "...",
        "addressType": "HOME",
        "isDefault": true,
        "recipientName": "Rahul Sharma",
        "phoneNumber": "9876543210",
        "addressLine1": "12, Sunrise Apartment",
        "addressLine2": null,
        "landmark": null,
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pincode": "380058",
        "country": "India"
      }
    ],
    "recentOrders": [
      {
        "id": "ORD202607150001",
        "refId": "ORD202607150001",
        "createdAt": "2026-07-15T10:30:00.000Z",
        "status": "DELIVERED",
        "paymentStatus": "PAID",
        "total": 550
      }
    ]
  }
}
```

Notes:
- `status` / `paymentStatus` are backend enum values (`DELIVERED`, `PAID`, …) — map to display labels in UI.
- `country` on addresses is always `"India"` (not stored separately yet).
- User-level `country` is currently `null` (no column yet).

---

## 3. Update status

```
PATCH /admin/api/proxy/users/:refId/status
Content-Type: application/json

{ "status": "INACTIVE" }
```

```json
{
  "success": true,
  "message": "User status updated successfully",
  "data": {
    "refId": "USR2026123456",
    "status": "INACTIVE"
  }
}
```

---

## 4. Add address

```
POST /admin/api/proxy/users/:refId/addresses
Content-Type: application/json
```

### Body (required fields)

| Field | Required | Notes |
|-------|----------|-------|
| `recipientName` | ✅ | |
| `phoneNumber` | ✅ | 10-digit Indian mobile |
| `pincode` | ✅ | 6 digits |
| `addressLine1` | ✅ | |
| `city` | ✅ | |
| `state` | ✅ | |
| `addressType` | ✅ | `HOME` \| `OFFICE` \| `OTHER` |
| `addressLine2` | ❌ | |
| `landmark` | ❌ | |
| `isDefault` | ❌ | first address is default automatically |

---

## Enums

| Field | Values |
|-------|--------|
| `status` | `ACTIVE`, `INACTIVE` |
| `role` | `customer`, `telecaller`, `vendor`, `vendor_manager`, `warehouse_staff`, `delivery_partner` |
| `gender` | `male`, `female`, `other`, `prefer_not_to_say` |
| `maritalStatus` | `single`, `married`, `divorced`, `widowed` |
| `addressType` | `HOME`, `OFFICE`, `OTHER` |

---

## Exclusions

Prescription APIs are intentionally not part of this release.
