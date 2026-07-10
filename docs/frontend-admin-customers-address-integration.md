# Frontend Admin Customers Address Integration

**Date:** 2026-07-09  
**Audience:** Admin panel / payment-request wizard UI developers  
**Module:** Admin Customers (`/api/v1/admin/customers`)

---

## 1) Overview

Admin customer APIs now support **multiple addresses** via `addresses[]` during both:

- `POST /admin/customers` (create customer)
- `PUT /admin/customers/:refId` (update customer + sync addresses)

Addresses are stored in `user_addresses` and linked by `userId`.

---

## 2) Authentication

- **Bearer token required**
- Allowed roles: `SUPER_ADMIN`, `ADMIN`, `telecaller`

---

## 3) Create Customer

### Endpoint

`POST /api/v1/admin/customers`

### Request body

```json
{
  "firstName": "Rahul",
  "lastName": "Sharma",
  "mobileNumber": "9876543210",
  "email": "rahul@example.com",
  "addresses": [
    {
      "recipientName": "Rahul Sharma",
      "phoneNumber": "9876543210",
      "pincode": "560001",
      "addressLine1": "42, MG Road",
      "addressLine2": "Near Metro Station",
      "landmark": "Opp City Mall",
      "city": "Bengaluru",
      "state": "Karnataka",
      "addressType": "HOME",
      "isDefault": true
    },
    {
      "recipientName": "Rahul Sharma",
      "phoneNumber": "9876543210",
      "pincode": "400001",
      "addressLine1": "12, Marine Drive",
      "city": "Mumbai",
      "state": "Maharashtra",
      "addressType": "WORK"
    }
  ]
}
```

### Behavior

- `addresses` is optional.
- If `addresses` is omitted or empty, only user is created.
- If no address has `isDefault=true`, first created address becomes default when user has no prior addresses.
- If one/more addresses have `isDefault=true`, existing default is cleared and provided default is applied.

---

## 4) Update Customer (Profile + Address Sync)

### Endpoint

`PUT /api/v1/admin/customers/:refId`

### Request body (example)

```json
{
  "firstName": "Rahul",
  "email": "rahul.new@example.com",
  "addresses": [
    {
      "refId": "ADD20261234",
      "recipientName": "Rahul Sharma",
      "phoneNumber": "9876543210",
      "pincode": "560001",
      "addressLine1": "42, MG Road, Updated",
      "city": "Bengaluru",
      "state": "Karnataka",
      "addressType": "HOME",
      "isDefault": true
    },
    {
      "recipientName": "Rahul Sharma",
      "phoneNumber": "9876543210",
      "pincode": "110001",
      "addressLine1": "5, Connaught Place",
      "city": "New Delhi",
      "state": "Delhi",
      "addressType": "OTHER"
    }
  ]
}
```

### Address sync rules (important)

When `addresses` is provided in update:

1. **`refId` present** => update existing address (must belong to this customer)
2. **`refId` absent** => create new address
3. Existing addresses **not included** in payload => soft deleted
4. If any item has `isDefault=true`, default is switched accordingly

When `addresses` is **not provided** in update:

- Addresses remain unchanged (profile fields still update)

---

## 5) Address Field Contract

Each address object supports:

| Field | Type | Required | Notes |
|---|---|---|---|
| `refId` | string | No (update only) | Send for updating an existing address |
| `recipientName` | string | Yes | 2-150 chars |
| `phoneNumber` | string | Yes | Valid Indian mobile |
| `pincode` | string | Yes | 6-digit Indian pincode |
| `addressLine1` | string | Yes | Max 255 |
| `addressLine2` | string | No | Max 255 |
| `landmark` | string | No | Max 255 |
| `city` | string | Yes | Max 100 |
| `state` | string | Yes | Max 100 |
| `addressType` | enum | Yes | `HOME` \| `WORK` \| `OTHER` |
| `isDefault` | boolean | No | Default selection |

---

## 6) Error handling

Common API failures:

- `409 Conflict` - mobile/email already exists
- `404 Not Found` - customer refId not found, or address refId does not belong to customer
- `400 Bad Request` - validation errors (invalid mobile/pincode/missing required fields)

---

## 7) UI implementation guidance

- Treat `addresses` in **update** as **full source of truth**.
  - Always send the complete desired address list (not only changed items).
- For existing addresses, preserve and send `refId`.
- For new addresses, do not send `refId`.
- Ensure only one address is marked default on UI.
- If user removes an address in UI, remove it from payload; backend will soft-delete it.

---

## 8) Quick test checklist

- Create customer with 2 addresses -> both created in `user_addresses`
- Create customer without addresses -> user created, no address rows
- Update with mix (existing+new) -> existing updated, new inserted
- Update omitting one existing address -> omitted address soft deleted
- Update without `addresses` key -> addresses unchanged
- Switch default address -> exactly one default remains

