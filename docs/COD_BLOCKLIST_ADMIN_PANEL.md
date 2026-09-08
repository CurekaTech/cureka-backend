# Admin Panel — COD Blocklist

Paste this file into the **admin panel** Cursor chat. Backend COD blocklist APIs are live after migration.

This is the **COD Blocklist** foundation for Order Management. Admins can block Cash on Delivery for a delivery pincode or a customer/mobile. Prepaid checkout stays available. Do not invent extra endpoints, reason-code values, or a second GoKwik flag.

---

## Feature purpose

Block COD for:

1. A **6-digit Indian pincode** (high RTO / returns from that location)
2. A **customer** (by existing customer record, or by mobile number when no account exists)

Blocked customers and blocked pincodes can still:

- Log in
- Use cart
- Save addresses
- Place **prepaid** orders

The block applies only on **native Cureka checkout**. If GoKwik checkout is active (`gokwikCheckoutEnabled` admin setting), the storefront ignores this list. The Admin Panel still manages the list regardless of GoKwik.

---

## Sidebar / module

Login/me menu already includes this Order Management item when the admin has `cod_blocklist.read`:

| Field | Value |
|---|---|
| name | COD Blocklist |
| key | `orders-cod-blocklist` |
| href | `/cod-blocklist` |
| icon | `Ban` (Lucide; fallback `Slash`) |
| requiredPermissions | `['cod_blocklist.read']` |
| parent | Order Management (`orders`) |

Recommended Admin Panel routes:

| Page | Path |
|---|---|
| List | `/cod-blocklist` |
| Create | `/cod-blocklist/new` |
| Edit / detail | `/cod-blocklist/[id]` — UUID or business `refId` (prefix `COD`) |

Roles checkbox group already comes from grouped backend permissions:

- **Orders → COD Blocklist**
  - View COD Blocklist (`cod_blocklist.read`) — list, get one, customer search
  - Create COD Blocklist (`cod_blocklist.create`)
  - Update COD Blocklist (`cod_blocklist.update`) — including activate/deactivate
  - Delete COD Blocklist (`cod_blocklist.delete`)

`super_admin` and `admin` receive the permissions through migration. Custom roles must be granted these checkboxes.

Do **not** hardcode role names. Do **not** change sidebar code in this backend repo; consume `menu` from admin login/me.

---

## Base URL

Backend:

```text
/api/v1/admin/cod-blocklist
```

Admin panel typically proxies:

```text
/admin/api/proxy/cod-blocklist
```

Use the same auth, RBAC, pagination, and response envelope as other admin Order Management APIs.

Success envelope:

```ts
{
  success: true;
  message: string;
  data: T;
  timestamp: string;
}
```

Error envelope:

```ts
{
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  code?: string;
  timestamp: string;
  path: string;
}
```

---

## Authentication

Every endpoint requires:

- `Authorization: Bearer <admin JWT>`
- Admin role: `super_admin` | `admin` | `moderator`
- Matching permission on the role (see table below)

Unauthenticated → `401`. Authenticated without permission → `403`.

---

## RBAC

| Action | Permission | Endpoint |
|---|---|---|
| List | `cod_blocklist.read` | `GET /api/v1/admin/cod-blocklist` |
| Get one | `cod_blocklist.read` | `GET /api/v1/admin/cod-blocklist/:id` |
| Search customers | `cod_blocklist.read` | `GET /api/v1/admin/cod-blocklist/customers/search` |
| Create | `cod_blocklist.create` | `POST /api/v1/admin/cod-blocklist` |
| Update / activate / deactivate | `cod_blocklist.update` | `PATCH /api/v1/admin/cod-blocklist/:id` |
| Delete | `cod_blocklist.delete` | `DELETE /api/v1/admin/cod-blocklist/:id` |

Permission refs (seeded): `PER00000342`–`PER00000345`.

---

## Enums (exact values)

```ts
type CodBlocklistType = 'PINCODE' | 'CUSTOMER';
```

`type` is **immutable** after create. Do not show a type switcher on the edit form.

---

## List table

```http
GET /api/v1/admin/cod-blocklist
```

Query parameters:

| Param | Type | Default | Notes |
|---|---|---|---|
| `page` | number | `1` | Min 1 |
| `limit` | number | `20` | Max 100 |
| `search` | string | — | Pincode, customer name, mobile, reason. Max 100 chars. Mobile search accepts `9876543210`, `+91…`, `91…` |
| `type` | `PINCODE` \| `CUSTOMER` | — | |
| `isActive` | boolean | — | `true` / `false` / `1` / `0` |
| `sortBy` | string | `createdAt` | `createdAt` \| `updatedAt` \| `type` \| `pincode` \| `mobileNumber` \| `isActive` |
| `sortOrder` | `ASC` \| `DESC` | `DESC` | |

Paginated `data`:

```ts
{
  data: CodBlocklistListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

Row shape:

```ts
type CodBlocklistListItem = {
  id: string;                 // UUID
  refId: string;              // e.g. COD2026123456
  type: 'PINCODE' | 'CUSTOMER';
  pincode: string | null;
  customerId: string | null;
  customerName: string | null;
  mobileNumber: string | null; // canonical 10-digit Indian mobile
  reason: string | null;       // internal admin note; never shown to customers
  isActive: boolean;
  createdBy: string | null;    // admin email
  updatedBy: string | null;
  createdAt: string;           // ISO
  updatedAt: string;
};
```

Suggested columns:

- Type
- Pincode / Customer name
- Mobile
- Reason
- Active
- Updated at
- Actions: Edit, Activate/Deactivate, Delete

Suggested filters: search box, type select, active/inactive select.

Success message: `COD blocklist retrieved successfully`.

---

## Get one

```http
GET /api/v1/admin/cod-blocklist/:id
```

`:id` may be the UUID or `refId`.

`404` with `code: "COD_BLOCKLIST_NOT_FOUND"` when missing (including soft-deleted).

Success message: `COD blocklist entry retrieved successfully`.

---

## Create

```http
POST /api/v1/admin/cod-blocklist
```

HTTP `201`. Message: `COD blocklist entry created successfully`.

### Pincode

```json
{
  "type": "PINCODE",
  "pincode": "380015",
  "reason": "High RTO rate",
  "isActive": true
}
```

Rules:

- `pincode` required, exactly 6 digits (`^[0-9]{6}$`)
- Do not send `customerId` or `mobileNumber` (backend stores them as null)

### Customer by ID (preferred)

1. Search customers (endpoint below)
2. User selects a row
3. Submit `customerId` only

```json
{
  "type": "CUSTOMER",
  "customerId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "reason": "Repeated COD returns",
  "isActive": true
}
```

Backend loads name and mobile from the database. Do **not** trust frontend-supplied name/mobile over that.

### Customer by mobile (no account / guest)

```json
{
  "type": "CUSTOMER",
  "mobileNumber": "9876543210",
  "reason": "Repeated COD returns",
  "isActive": true
}
```

Accepted mobile formats: `9876543210`, `+919876543210`, `919876543210`, `09876543210`. Stored as canonical `9876543210`.

If a customer with that mobile exists, backend attaches `customerId` and name automatically.

`CUSTOMER` requires **either** `customerId` **or** `mobileNumber`.

`reason` optional, max 1000 chars. `isActive` defaults to `true`.

---

## Update

```http
PATCH /api/v1/admin/cod-blocklist/:id
```

Message: `COD blocklist entry updated successfully`.

Editable:

- PINCODE: `pincode`, `reason`, `isActive`
- CUSTOMER: `customerId` and/or `mobileNumber`, `reason`, `isActive`

Sending a different `type` → `400` `COD_BLOCKLIST_TYPE_IMMUTABLE`.

Activate/deactivate: `PATCH` with `{ "isActive": false }` or `{ "isActive": true }`. Inactive entries do not block COD. Reactivating re-checks duplicates.

---

## Delete

```http
DELETE /api/v1/admin/cod-blocklist/:id
```

Soft delete. HTTP `204`. Show a confirmation dialog: the pincode/customer will be able to use COD again (unless another active entry matches).

---

## Customer search (selector)

```http
GET /api/v1/admin/cod-blocklist/customers/search?search=asha&page=1&limit=20
```

**Declare this static route in the Admin Panel client as `/customers/search`, not as `/:id`.**

| Param | Required | Notes |
|---|---|---|
| `search` | yes | Min 2 characters. First name, last name, full name, or mobile |
| `page` | no | Default 1 |
| `limit` | no | Default 20, max 100 |

Name match is case-insensitive. Mobile match uses digits (`9876543210` and `+91…` both work).

Response item:

```ts
{
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  mobileNumber: string | null;
  email: string | null;
  alreadyBlocked: boolean;
  activeBlocklistEntryId: string | null;
}
```

If `alreadyBlocked` is true, disable “Add” or show “Already blocked” and optionally link to `activeBlocklistEntryId`.

Shorter than 2 characters → `400` `COD_BLOCKLIST_SEARCH_TOO_SHORT`.

Requires `cod_blocklist.read` (same as list). There is no separate search permission.

---

## Create / edit form fields

### Shared

- Type radio: Pincode / Customer (create only; locked on edit)
- Reason (textarea, optional)
- Active toggle (default on)

### Pincode form

- Pincode text, 6 digits, numeric keyboard

### Customer form

- Search input (min 2 chars, debounce ~300ms)
- Results list: name, mobile, email, already-blocked badge
- Selected customer chip (id stored, name/mobile displayed from search result for UX only)
- Optional “Block mobile only” field when no customer is found

---

## Suggested UI flow

1. Order Management → COD Blocklist
2. Filters + table
3. Add → choose PINCODE or CUSTOMER
4. CUSTOMER: search → select → save
5. List shows the new row immediately
6. Edit reason / pincode / customer / active
7. Delete with confirm

Do not expose the admin `reason` on any storefront screen.

---

## Validation and business errors

| HTTP | `code` | When |
|---|---|---|
| 400 | `COD_BLOCKLIST_INVALID_PINCODE` | Pincode not 6 digits |
| 400 | `COD_BLOCKLIST_INVALID_CUSTOMER` | Customer UUID missing / not a customer |
| 400 | `COD_BLOCKLIST_INVALID_MOBILE` | Mobile cannot be canonicalized to a valid Indian number |
| 400 | `COD_BLOCKLIST_TYPE_IMMUTABLE` | PATCH tried to change `type` |
| 400 | `COD_BLOCKLIST_SEARCH_TOO_SHORT` | Customer search &lt; 2 chars |
| 400 | (class-validator messages) | DTO failures (`type` enum, UUID, etc.) |
| 404 | `COD_BLOCKLIST_NOT_FOUND` | Unknown id |
| 409 | `COD_BLOCKLIST_DUPLICATE_PINCODE` | Another **active** pincode block exists |
| 409 | `COD_BLOCKLIST_DUPLICATE_CUSTOMER` | Another **active** block exists for that customer id or mobile |

Duplicate check applies only to **active** rows. Soft-deleted and inactive rows do not conflict. Show the `message` from the error envelope.

---

## Activate / deactivate behavior

- `isActive: false` → COD is allowed again for that pincode/customer (unless another active entry matches)
- `isActive: true` → block is live immediately (next cart/checkout/place-order)
- No extra “publish” step

---

## Out of scope for Admin Panel

- Do not call storefront checkout APIs from admin
- Do not add a GoKwik toggle on this page
- Do not display full payment tokens or raw addresses
- Admin payment-request COD wizard is a separate ops path and is **not** gated by this list
