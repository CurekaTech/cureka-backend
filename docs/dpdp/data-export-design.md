# Data Export Design (Right of Access / Portability)

**Status:** Missing in codebase. Design only.

## API

```
GET /api/v1/users/me/data-export
Authorization: SessionCookieGuard + VerifiedUserGuard
Response: application/json (or async job + download link for large histories)
```

### Sync v1 (preferred initially)

Return JSON envelope:

```json
{
  "exportedAt": "ISO-8601",
  "userId": "uuid",
  "profile": { "firstName", "lastName", "email", "mobileNumber", "gender", "dateOfBirth", "maritalStatus", "profileImageUrl" },
  "addresses": [ { "...address fields" } ],
  "orders": [ { "orderNumber", "placedAt", "status", "totals", "shippingSnapshot", "items": [] } ],
  "paymentRequests": [ { "id", "status", "amounts", "providerReferenceId" } ],
  "supportTickets": [ { "id", "subject", "status", "messages": [] } ],
  "wishlistProductRefIds": [],
  "consents": [ { "type", "version", "granted", "grantedAt" } ],
  "sessions": [ { "deviceName", "browser", "os", "lastActivity", "expiresAt", "isRevoked" } ]
}
```

**Exclude:** password hashes, OTP hashes, refresh token hashes, admin data, other users’ data, raw webhook JSON blobs (summarize IDs only).

## Data sources

| Section | Source |
|---------|--------|
| profile | `users` |
| addresses | `user_addresses` where user_id |
| orders | `orders` + items |
| paymentRequests | `payment_requests` where customer_id |
| support | `support_tickets` + messages |
| wishlist | wishlist tables / Redis rebuild from DB |
| consents | future `user_consents` |
| sessions | `user_sessions` metadata only |

## Authorization

- Only `user.sub` from session.  
- Rate limit: 1 export / 24h.  
- Audit: `dsar` export event.  

## Async v2 (if payload large)

1. `POST /users/me/data-export` → job id  
2. BullMQ builds JSON → GCS signed URL (short TTL)  
3. `GET /users/me/data-export/:id` status  

## Effort estimate

Sync v1: **2–4 days**. Async v2: **+2–3 days**.
