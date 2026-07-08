# Frontend Integration Guide: Admin Users List (`GET /users`)

This document describes how the admin UI should integrate with the **paginated website users list** API. Use it to build the super-admin user management table (search, sort, pagination, and row actions).

---

## 1. Endpoint overview

| Property | Value |
|----------|-------|
| **Method** | `GET` |
| **Path** | `/api/v1/users` |
| **Auth** | Admin JWT — `Authorization: Bearer <ADMIN_TOKEN>` (or `admin_token` cookie, depending on your admin app setup) |
| **Access** | **Super admin only** (`super_admin` role) |
| **Purpose** | Paginated list of **all** website users (customers, staff roles, guests, etc.) |

**Related endpoints (same controller):**

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| `GET` | `/api/v1/users/customers` | `super_admin`, `admin` | Customers only (lighter list shape) |
| `GET` | `/api/v1/users/:refId` | `super_admin` | Single user detail by `refId` |

For a **customer-only** admin list, prefer `GET /users/customers` or `GET /admin/customers/search`. Use `GET /users` when the screen must show **every** user role.

---

## 2. Request

### Headers

```http
Authorization: Bearer <ADMIN_TOKEN>
```

### Query parameters

All parameters are optional.

| Parameter | Type | Default | Constraints | Description |
|-----------|------|---------|-------------|-------------|
| `page` | number | `1` | min `1` | Page number (1-based) |
| `limit` | number | `20` | min `1`, max `100` | Items per page |
| `search` | string | — | max 100 chars | Case-insensitive partial match on first name, last name, email, mobile, or `refId` |
| `sortBy` | string | `createdAt` | see §3 | Column to sort by |
| `sortOrder` | string | `DESC` | `ASC` or `DESC` | Sort direction |

### Example requests

```http
GET /api/v1/users?page=1&limit=20
GET /api/v1/users?search=rahul&page=1&limit=10
GET /api/v1/users?sortBy=lastLoginAt&sortOrder=DESC&page=2&limit=25
```

---

## 3. Sorting

Allowed `sortBy` values (anything else falls back to `createdAt`):

| `sortBy` value | Sorts by |
|----------------|----------|
| `createdAt` | Account created date (default) |
| `firstName` | First name |
| `lastName` | Last name |
| `email` | Email |
| `status` | User status (`ACTIVE` / `INACTIVE`) |
| `lastLoginAt` | Last login timestamp |

Secondary sort is always `createdAt DESC` for stable ordering.

---

## 4. Response shape

Standard API envelope:

```json
{
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "data": {
    "data": [ /* IUser[] */ ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Pagination fields (`data` root)

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | Current page of users |
| `total` | number | Total matching users across all pages |
| `page` | number | Current page |
| `limit` | number | Page size |
| `totalPages` | number | `ceil(total / limit)` |
| `hasNextPage` | boolean | `page < totalPages` |
| `hasPreviousPage` | boolean | `page > 1` |

### User object (`IUser`)

```typescript
type User = {
  id: string;                    // UUID — internal id
  refId: string;                 // Public ref (e.g. USR2026…) — use in URLs / GET /users/:refId
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileNumber?: string;
  isGuest: boolean;
  isRegistered: boolean;
  status: 'ACTIVE' | 'INACTIVE';
  role: UserRole;                // see §5
  roleId?: string;
  roleRecord?: {                 // Joined role metadata when available
    id: string;
    refId: string;
    name: string;
    slug: string;
    status: string;
    isSystem: boolean;
    permissions: unknown[];
    createdAt: string;
    updatedAt: string;
  };
  lastLoginAt?: string;          // ISO datetime
  profileImageUrl?: {
    key: string;
    name: string;
    url: string;                 // Browser-ready image URL — use for avatar
  } | null;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: string;          // ISO date (YYYY-MM-DD)
  maritalStatus?: 'married' | 'single' | 'divorced' | 'widowed';
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
```

---

## 5. Enums for UI display

### `status`

| Value | Suggested UI |
|-------|----------------|
| `ACTIVE` | Green badge / “Active” |
| `INACTIVE` | Gray badge / “Inactive” |

### `role` (`UserRole`)

| Value | Label suggestion |
|-------|------------------|
| `customer` | Customer |
| `telecaller` | Telecaller |
| `vendor` | Vendor |
| `vendor_manager` | Vendor manager |
| `warehouse_staff` | Warehouse staff |
| `delivery_partner` | Delivery partner |

### Guest / registration flags

| Field | Meaning |
|-------|---------|
| `isGuest: true` | Session/guest user (may not have completed registration) |
| `isRegistered: true` | Completed storefront registration |
| `isGuest: true` + `isRegistered: false` | Typical anonymous/guest cart user |

---

## 6. Example response

```json
{
  "statusCode": 200,
  "message": "Users retrieved successfully",
  "data": {
    "data": [
      {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "refId": "USR202607081234",
        "firstName": "Rahul",
        "lastName": "Sharma",
        "email": "rahul@example.com",
        "mobileNumber": "+919876543210",
        "isGuest": false,
        "isRegistered": true,
        "status": "ACTIVE",
        "role": "customer",
        "roleId": "550e8400-e29b-41d4-a716-446655440000",
        "roleRecord": {
          "id": "550e8400-e29b-41d4-a716-446655440000",
          "refId": "ROL20260001",
          "name": "Customer",
          "slug": "customer",
          "status": "active",
          "isSystem": true,
          "permissions": [],
          "createdAt": "2026-01-15T10:00:00.000Z",
          "updatedAt": "2026-01-15T10:00:00.000Z"
        },
        "lastLoginAt": "2026-07-08T06:30:00.000Z",
        "profileImageUrl": {
          "key": "avatars/rahul.jpg",
          "name": "rahul.jpg",
          "url": "https://cdn.example.com/avatars/rahul.jpg"
        },
        "gender": "male",
        "dateOfBirth": "1990-05-15",
        "maritalStatus": "single",
        "createdAt": "2026-03-01T08:00:00.000Z",
        "updatedAt": "2026-07-08T06:30:00.000Z"
      }
    ],
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## 7. UI implementation checklist

### Page access

- [ ] Restrict route to **super admin** only — `403` if a non–super-admin token is used.
- [ ] Send admin JWT on every request.

### Table columns (recommended)

| Column | Source field(s) | Notes |
|--------|-----------------|-------|
| Avatar | `profileImageUrl?.url` | Fallback to initials if null |
| Name | `firstName`, `lastName` | Fallback: email or mobile |
| Email | `email` | Show “—” if empty |
| Phone | `mobileNumber` | |
| Ref ID | `refId` | Copyable; use for detail link |
| Role | `roleRecord?.name` or `role` | Prefer `roleRecord.name` when present |
| Status | `status` | Badge |
| Guest | `isGuest` | Optional chip |
| Last login | `lastLoginAt` | Format as local datetime |
| Created | `createdAt` | |

### Search

- [ ] Debounce search input (~300–500 ms).
- [ ] Pass value as `search` query param.
- [ ] Reset to `page=1` when search changes.

### Pagination

- [ ] Use `page` + `limit` query params.
- [ ] Drive UI from `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`.
- [ ] Typical page sizes: `10`, `20`, `50` (max `100`).

### Sorting

- [ ] Map table header clicks to `sortBy` + `sortOrder`.
- [ ] Toggle `ASC` / `DESC` on repeated clicks.
- [ ] Reset to `page=1` when sort changes.

### Row actions

- [ ] **View detail:** `GET /api/v1/users/:refId` using the row’s `refId` (not `id`).
- [ ] Do not use `id` in admin URLs if the rest of the admin panel uses `refId`.

---

## 8. Error responses

| Status | When | UI action |
|--------|------|-----------|
| `401 Unauthorized` | Missing or expired admin token | Redirect to admin login |
| `403 Forbidden` | Logged-in admin is not `super_admin` | Hide page or show access denied |
| `400 Bad Request` | Invalid query (e.g. `sortOrder` not `ASC`/`DESC`, `limit` > 100) | Show validation message |

---

## 9. TypeScript fetch example

```typescript
type UsersListParams = {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'createdAt' | 'firstName' | 'lastName' | 'email' | 'status' | 'lastLoginAt';
  sortOrder?: 'ASC' | 'DESC';
};

async function fetchUsers(params: UsersListParams, adminToken: string) {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortOrder) query.set('sortOrder', params.sortOrder);

  const res = await fetch(`/api/v1/users?${query}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  if (!res.ok) throw new Error(`Users list failed: ${res.status}`);
  const json = await res.json();
  return json.data; // PaginatedResult<User>
}
```

---

## 10. Common mistakes

| Mistake | Result |
|---------|--------|
| Calling as `admin` (not `super_admin`) | `403 Forbidden` |
| Using `id` instead of `refId` for detail route | Detail API expects `refId` |
| Expecting storefront session cookie auth | Fails — needs **admin** JWT |
| `limit` > 100 | `400 Bad Request` |
| Reading avatar from a raw storage `key` only | Use `profileImageUrl.url` from API |
| Using this endpoint for payment-wizard customer search | Prefer `GET /admin/customers/search` (broader admin access) |

---

## 11. Related docs

- [admin-order-payment-flow.md](./admin-order-payment-flow.md) — customer search in payment wizard (`GET /admin/customers/search`)
- [frontend-cart-checkout-integration.md](./frontend-cart-checkout-integration.md) — storefront user/session flow (different auth)
