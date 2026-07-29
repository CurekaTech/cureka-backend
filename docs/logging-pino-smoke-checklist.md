# Phase 2 Pino Logging — Smoke Checklist

Use after deploy/restart of `npm run dev` or staging.

1. **Request ID**
   - `curl -i http://localhost:3000/api/v1/health/redis`
   - Expect response header `x-request-id`
   - Expect matching `req.id` / `requestId` in the access log line
   - Health path should **not** emit a noisy access log (ignored)

2. **Guest login PII**
   - `POST /api/v1/auth/guest-login`
   - Logs must **not** contain `sessionToken` or full device dump

3. **OTP mask**
   - Send OTP for a known mobile
   - Log line should show `***` + last 4 digits, not the full number

4. **Cashfree / payment webhooks**
   - Trigger or unit-hit Cashfree webhook handler
   - Logs must **not** contain webhook `signature` or full payload

5. **401/403**
   - Call a guarded admin route without token
   - Expect structured warn log with `requestId` and `statusCode: 401`

6. **Workers**
   - Enqueue bulk-upload or observe UniCommerce/GoKwik job
   - Job logs include `jobId`, `queue`, and `context: worker`

7. **Admin login**
   - Failed login → warn with email only (no password)
   - Success → info with email + role

## Regression gate

```bash
rg 'console\.(log|warn|error)' modules apps/api/main.ts apps/api/common \
  --glob '!**/node_modules/**'
# Expect only: apps/api/main.ts bootstrap().catch console.error
```
