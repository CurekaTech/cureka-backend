# Data Flow Diagram (text)

## 1. Customer OTP login

```
Client (mobile)
  → POST /api/v1/auth/send-otp | /auth/login  { mobileNumber }
  → AuthController → AuthService → OtpRateLimitService (Redis IP/mobile counters)
  → OtpService.generateOtp() [STATIC '1234' today] → bcrypt hash
  → otp_logs (mobile plaintext + hash)
  → Redis otp:send:cooldown:{purpose}:{mobile}
  → Response may include OTP in non-prod (buildOtpSendResponse)  [MVR: confirm prod behaviour]
  → POST /auth/verify-otp
  → SessionService creates user_sessions (device, ip, refresh_token_hash)
  → Set-Cookie: user_session (HttpOnly, SameSite=lax, Secure conditional)
  → SessionCacheService stores full IUserSessionContext in Redis
  → Logs: masked mobile via maskMobile() in otp/auth services
```

## 2. Profile & address update

```
Client + user_session cookie
  → PATCH /users/me  |  CRUD /users/addresses
  → SessionCookieGuard + VerifiedUserGuard
  → UsersService / UserAddressesService (ownership checks)
  → PostgreSQL users / user_addresses
  → Session cache may be stale until TTL  [MVR]
  → Response: profile/address JSON (PII)
```

## 3. Checkout → payment providers

```
Client cart
  → POST /orders/checkout | /payment-requests/checkout*
  → OrdersService / PaymentRequestsService
  → PostgreSQL orders | payment_requests (address snapshot / customer FK)
  → Provider branch:
      Razorpay: customer.name, contact, email, amount
      Cashfree: customer_id, email, phone, name, amount
      GoKwik: checkout provider flag; callbacks receive cart/order + address/email/phone
  → Webhooks /payment/webhook* → signature verify (Razorpay/Cashfree) → mark paid → create order
  → Logs: IDs only on payment webhooks (Phase 2); Cashfree error JSON may leak PII [MVR]
```

## 4. Fulfillment push

```
Order paid
  → ShippingService builds Shipway payload (name, phone, email, address, amounts)
  → HTTPS Shipway API
  → TODAY: logger logs FULL payload  ← compliance gap
  → Shipway webhooks (signature optional if secret unset) → shipment status
  → UniCommerce queue job { orderId }
  → Mapper builds shipping/billing PII → UniCommerce API
```

## 5. GoKwik path

```
GoKwik → POST /gokwik/* (x-gokwik-callback-secret)
  → Cart/Order services → CartEntity / OrderEntity / gokwik_orders
  → Webhooks /gokwik/webhooks/* 
      payment HMAC: FAIL-CLOSED pending contract
      abandoned-carts: JSONB store
  → BullMQ gokwik jobs { eventId|orderId|resourceId } → process from DB
  → Logs: event/cart/payment IDs (no phone in controller logs)
```

## 6. Search & media

```
Public PLP / search
  → Typesense (catalog fields; health concern names = taxonomy)
  → No customer PII indexed (evidence: mappers)

Uploads / profile image / gallery
  → StorageService → local disk | GCS (signed URLs)
  → Object may be personal image [MVR: ACL/lifecycle]
```

## 7. Admin telecaller flow

```
Admin JWT cookie
  → /admin/customers, /admin/payment-requests
  → Create/update customer + addresses + Razorpay links
  → Customer PII visible to ADMIN / telecaller roles
  → Audit: NOT written to audit_logs today
```

## Third-party field matrix

| Provider | Personal fields shared | Direction |
|----------|------------------------|-----------|
| Razorpay | name, phone, email, amount, payment IDs | Out + webhook in |
| Cashfree | customer_id, name, email, phone, amount | Out + webhook in |
| GoKwik | name, address, email, phone, amounts; optional PAN on place-order DTO | In (callbacks) + limited out |
| Shipway | name, phone, email, address, amounts | Out + webhook in |
| Shiprocket Checkout | name, email, phone, shipping_address, amount | Out + callback in |
| UniCommerce | name, phone, email, address | Out |
| Typesense | No customer PII | Catalog only |
| GCS | File bytes / keys (may include profile images) | Out |
| Firebase | Not present in codebase | N/A |

**Manual Verification Required:** DPA/processor contracts; data residency of each SaaS; edge TLS/HSTS.
