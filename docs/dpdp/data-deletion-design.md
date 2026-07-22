# Data Deletion Design (Right to Erasure)

**Status:** Partial soft-delete primitives; no customer self-service erasure. Design only.

## Current behaviour

| Action | Exists? | Notes |
|--------|---------|-------|
| Soft-delete user by refId | Service/repo yes; **no customer API** | `UsersService.remove` unexposed |
| Soft-delete address | Yes | Owner-scoped |
| Soft-delete staff/admin | Yes | Admin APIs (staff-users currently unguarded — fix first) |
| Anonymize orders | No | Address snapshots remain identifiable |
| Purge OTP / sessions | No dedicated erase | Sessions revoke only |
| Delete GCS profile image | Not tied to erasure flow | |

## Target API

```
POST /api/v1/users/me/erasure-request
Body: { reason?: string, confirmMobile: string }
Auth: Session + VerifiedUser

Admin:
POST /api/v1/admin/customers/:refId/erasure
```

## Erasure workflow (job)

1. Verify identity (OTP re-confirm).  
2. Audit `dsar` erasure requested.  
3. Revoke all sessions; clear Redis session/wishlist keys.  
4. Soft-delete user; soft-delete addresses.  
5. Anonymize PII fields on historical orders / payment_requests / gokwik_orders:
   - Replace name → `REDACTED`
   - phone/email → `deleted+{hash}@erased.local` / `0000000000`
   - address lines → `REDACTED`
6. Delete or null profile image in storage.  
7. Soft-delete or anonymize support guest fields linked to user.  
8. Delete OTP rows for mobile.  
9. Retain `audit_logs` with actor id hashed if needed.  
10. Mark erasure completed; notify user email if present.  

## Hard delete

Avoid hard-deleting orders (financial). Prefer **anonymization**. Hard-delete only ephemeral tables (OTP, revoked sessions).

## Cascades

Do not rely on SQL `ON DELETE CASCADE` with soft-delete — implement explicit service steps.

## Effort estimate

**5–8 days** including job, admin path, tests, and legal review of order anonymization (**MVR**).
