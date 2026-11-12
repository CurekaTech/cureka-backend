# Audit Logging Design

## What is stored

`audit_logs` keeps the original columns: `entity_type`, `action`, `performed_by`, `details`, and `created_at`. `entity_id` is now nullable so an anonymous authentication failure does not need a fake UUID. Investigation for those rows uses `entity_ref_id` (the request id) and a masked email or mobile in `details`. Existing writers still pass a real entity UUID and the same action strings. `performed_by` stays required.

New nullable columns: `actor_type` (`ADMIN`, `USER`, `SYSTEM`, `ANONYMOUS`), `actor_id`, `ip_address`, `request_id`, `idempotency_key`, `reliability`.

## Critical persistence

Critical events are inserted into `audit_outbox` in the same database transaction as the business change. If that insert fails, the business change rolls back. Authentication failures have no business row; they use their own committed outbox transaction and the API returns 503 when that write cannot commit.

The same transaction also inserts the `audit_logs` row, so the admin list can show the event as soon as the transaction commits. The publisher still claims due `pending` rows, and `publishing` rows whose 2-minute claim lease has expired, with `FOR UPDATE SKIP LOCKED`. If the audit row is already stored, that insert is a no-op. The publisher retries with exponential backoff and stops at 8 attempts. A `failed` row stays in the table. Inserting the audit row uses `ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`. If that insert succeeds and marking the outbox row published fails, the outbox row is put back to `pending` (or `failed` after 8 attempts) and is not deleted. The next claim sees the existing audit row and only retries the status update.

Pending and failed rows are never deleted. Published outbox rows older than 30 days may be deleted. Pending or failed rows older than 15 minutes, and `publishing` rows whose lock is older than 15 minutes, are logged with their ids. To recover a failed row, set `status` back to `pending` and clear `locked_at`, `claim_token`, and `next_attempt_at`.

Critical events: admin login success and failure, admin cookie logout, customer OTP success and failure, customer logout, logout-all, and session revoke only when a session row actually changes, role create/update/status/delete, admin role assignment, refund approve and reject, COD payout create, mutation, and bank-detail reveal. Admin logout still clears the cookie first. For `superadmin@cureka.com` it also revokes that JWT's `admin_sessions` row when one is active, and the audit detail `serverSessionRevoked` is true only when a row changed. Other admin logouts do not revoke a server session.

## Ordinary events

Blog, support, returns, subscriptions, promotional pages, and non-critical refund notes stay on `AuditService.log`. A failure is logged and does not fail the request. Those events can be lost if the process crashes after the business commit and before the insert.

## Actor and IP

An HTTP interceptor sets the actor after authentication. Customer sessions (`sessionId`) are `USER`. Admin JWTs (`super_admin`, `admin`, `moderator` plus email) are `ADMIN`. Everyone else on the request is `ANONYMOUS`. Background work must call `runAsSystem(jobName)`. That scope does not keep the previous request actor.

Audit IP is Fastify `request.ip` after `TRUST_PROXY`, with IPv4-mapped IPv6 normalized. Application code does not read `X-Forwarded-For` or `X-Real-IP`. The backend cannot recover a client address the proxy never forwarded. Rows already stored are not rewritten.

`TRUST_PROXY` unset trusts only loopback (`127.0.0.0/8` and `::1`). `false` trusts nobody. A comma-separated IP, CIDR, or proxy-addr name (`loopback`, `linklocal`, `uniquelocal`) is the allowlist. `true`, `0.0.0.0/0`, and `::/0` are rejected in every environment, including development. An invalid token fails startup.

Same server: leave `TRUST_PROXY` unset when the admin or website proxy calls the API on loopback. Loopback trust does not identify which local process connected, so the API port must still be reachable only by the intended proxy. That proxy, and the ingress in front of it, must overwrite any client-supplied forwarding header with the socket address they accepted.

Different servers: set `TRUST_PROXY` to that proxy's IP or CIDR. Restrict the API port to that proxy or trusted network. Do not use `TRUST_PROXY=true` or an unrestricted CIDR.

Admin forwarding: [admin-frontend-client-ip-forwarding.md](../admin-frontend-client-ip-forwarding.md). Website forwarding: [website-client-ip-forwarding.md](../website-client-ip-forwarding.md).

## Redaction and API

Details are redacted recursively, including arrays and case or separator variants of password, OTP, token, cookie, authorization, card, and bank-account keys. Auth, OTP, and password routes never store a request body. Other writes store a redacted, size-capped request snapshot on `audit_logs.request_payload` plus field-level old/new values on `audit_log_changes`. Full raw request or response bodies are not stored.

`GET /api/v1/admin/audit-logs` and `GET /api/v1/admin/audit-logs/:id` both require `audit_logs.read`. Responses are redacted again. Opening the list or a row does not write another audit event. Older `audit_log_access` rows stay in the table and are omitted from the default list. Pass `entityType=audit_log_access` to see them.

## Coverage

Implemented and kept: blog posts, support tickets, return requests, return policy, subscriptions, promotional pages, refund requests, COD payouts.

New critical coverage is listed above.

Ordinary writes call `AuditService.recordWrite` after the business change commits. The actor is taken from the request context. `anonymous` is used only when neither the caller nor the request has an identity.

Covered writes include product create, update, publish, unpublish, review, and delete; order placement, cancellation, and admin completion; customer profile, registration, and addresses; admin customer create, status, and delete; brand, category, coupon, and banner create, update, status, and delete; admin setting value and status; COD blocklist create, update, and delete; permission create, update, status, and delete; and report export.

Not yet audited: inventory and price bulk jobs, variant-level stock edits, payment status webhooks, most remaining master dictionaries (states, units, manufacturers, packers, CMS, home sections, expert talk), and routine public catalog reads. Consent and DSAR flows do not exist. Public reads, sitemap audit, and webhook bodies are excluded.

## Integrating a new module

Import `MasterModule` in the feature module and inject `AuditService`. `MasterModule` exports it. Do not write `audit_logs` or `audit_outbox` from a repository of your own.

Add the entity type to `AuditEntityType` when the row is a durable business record. Keep existing action strings. `performedBy` stays the display identity: admin email, user id, `anonymous`, or `system:{jobName}`. Pass a real entity UUID. Use `entityId: null` only when no business row exists, and put the investigation id in `entityRefId`. Do not use a nil UUID.

One logical action produces one audit event. Guards, interceptors, and retries must not add a second event for the same change. Do not audit `entityType` `audit_log`. Do not store raw request or response bodies, passwords, OTPs, tokens, cookies, authorization headers, or full bank details. `AuditService` redacts nested details, and callers must still avoid putting those values in the payload.

Choose the writer from the reliability of the action:

- Account security, role or permission changes, refund approval or rejection, and payout or other money-movement state changes call `enqueueCritical(manager, input)` inside the same transaction as the business write. The call requires `idempotencyKey`. A database error must propagate so the business change rolls back. A duplicate key is a no-op.
- Authentication failures that have no business row call `persistCritical` before the error response. If that write cannot commit, return 503 `Audit log unavailable`.
- Ordinary create, update, and delete events call `recordWrite` or `log` after the business write commits. A failure is logged and does not fail the request.

Build the idempotency key with `auditIdempotency`:

- Auth failure: `authFailure(channel, maskedSubject, requestId)`
- Auth success or session revoke: `authSuccess(action, sessionOrUserId, requestId)`
- Role or permission change: `rbac(action, roleOrUserId, updatedAt)`
- Refund or payout: `refund(action, refundOrPayoutId, status)`
- Ordinary write: `write(entityType, entityId, action, updatedAt or requestId)`
- Webhook or job retry: `webhook(provider, providerEventId, action)`

A retried job or webhook must reuse the same key. A genuine second user action needs a new request id, status, or timestamp so it stays separately auditable.

Background jobs and Bull processors call `runAsSystem(jobName)` around the work. That replaces any inherited request actor for the callback only. Do not copy `request.user` into a queue payload and replay it as the actor.

```typescript
await this.dataSource.transaction(async (manager) => {
  const saved = await this.repository.update(id, changes, manager);
  await this.auditService.enqueueCritical(manager, {
    entityType: AuditEntityType.RETURN_REQUEST,
    entityId: saved.id,
    entityRefId: saved.refId,
    action: 'status_changed',
    performedBy: actor.email ?? actor.id,
    idempotencyKey: auditIdempotency.write(
      'return_request',
      saved.id,
      'status_changed',
      saved.updatedAt.toISOString(),
    ),
    details: { status: saved.status },
  });
});
```

## Remaining limitations

- Ordinary audits are still best-effort across a process crash.
- Historical rows have no actor or IP.
- Admin login success updates `last_login_at` before the critical outbox insert. If that insert fails the API returns 503 and no token is issued, but the timestamp may already be saved.
- Admin cookie logout clears the cookie before the audit insert. A failed insert returns 503 after the cookie is cleared and does not store the event.
- Customer OTP success creates the session before the critical audit insert. A failed insert returns 503 and the session may already exist.
- Inventory quantity edits, price bulk jobs, and payment-status webhooks are not audited yet. Profile, address, order placement, and admin settings are.
- Consent and DSAR are not implemented.
