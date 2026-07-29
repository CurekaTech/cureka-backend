# Audit Logging Design

## Current state

- Infra: `modules/audit` → table `audit_logs`
- Entity types today: **only** `blog_post`, `support_ticket` (`audit-entity-type.constant.ts`)
- Writers: blog posts service, support tickets service
- No general admin audit-logs list API beyond blog detail

## Required events (DPDP / security)

| Event | Actor | Entity type (proposed) | Details (no secrets) |
|-------|-------|------------------------|----------------------|
| Admin login success/fail | admin | `admin_auth` | email (masked), IP, outcome |
| Customer OTP verify success/fail | user | `user_auth` | masked mobile, IP, outcome |
| Logout / logout-all / session revoke | user | `user_auth` | sessionId |
| Profile update | user | `user_profile` | changed field names only |
| Mobile/email change | user | `user_profile` | old/new masked |
| Address create/update/delete | user | `user_address` | addressId, action |
| Consent grant/withdraw | user | `user_consent` | type, version |
| Order place / cancel | user/system | `order` | orderNumber, status |
| Payment status change | webhook/admin | `payment` | paymentRequestId, status, provider |
| Refund initiated | admin/system | `payment` | amount, orderId |
| Admin customer create/update | admin | `admin_customer` | customerRefId |
| Staff/admin role change | admin | `admin_rbac` | targetRefId, role |
| User erasure / export | user/admin | `dsar` | request type, status |
| Data export downloaded | user | `dsar` | exportId |

## Design changes

1. Extend `AuditEntityType` with values above.  
2. Thin `AuditService.log` wrappers per domain (avoid PII blobs).  
3. Admin API: `GET /admin/audit-logs?entityType&actorId&from&to` with `audit_logs.read`.  
4. Retention: see retention policy (3–7 years **MVR**).  

## Explicitly never store in audit details

Passwords, OTP, tokens, raw card data, full address lines (use IDs), medical free text dumps.
