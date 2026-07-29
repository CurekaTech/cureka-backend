# Personal Data Inventory

Evidence from TypeORM entities, DTOs, and controllers. API prefix: `/api/v1`.

Soft-delete base: `packages/database/src/base.entity.ts` (`deletedAt`).

---

## Customer identity — `users`

| Data | Column | Entity | DTO | Endpoints | Required? | Purpose | Risk |
|------|--------|--------|-----|-----------|-----------|---------|------|
| First/last name | `first_name`, `last_name` | `modules/users/entities/user.entity.ts` | `UpdateUserProfileDto`, `CompleteRegistrationDto`, `CreateAdminCustomerDto` | `GET/PATCH /users/me`, `POST /auth/complete-registration`, `/admin/customers` | Optional on user; required on registration/admin create | Identity, shipping | Medium |
| Email | `email` | same | same | same + admin login path N/A | Optional (unique) | Contact | High |
| Mobile | `mobile_number` | same | `LoginDto`, OTP DTOs | `/auth/login`, `/auth/send-otp`, `/auth/verify-otp` | Optional DB; required for OTP login | Primary identifier | **Critical** |
| Profile image | `profile_image_url` | same | multipart upload | `POST /users/me/profile-image` | Optional | Avatar | Medium |
| Gender | `gender` | same | `UpdateUserProfileDto` | `PATCH /users/me` | Optional | Profile | Medium |
| DOB | `date_of_birth` | same | same | same | Optional | Profile / age | High |
| Marital status | `marital_status` | same | same | same | Optional | Profile | Medium |
| Guest/registered flags | `is_guest`, `is_registered` | same | — | auth flows | Defaults | Account state | Low |

---

## Addresses — `user_addresses`

| Data | Columns | Entity | Endpoints | Required? | Risk |
|------|---------|--------|-----------|-----------|------|
| Recipient name, phone, full postal address | `recipient_name`, `phone_number`, `pincode`, `address_line1/2`, `landmark`, `city`, `state` | `modules/users/entities/user-address.entity.ts` | `/users/addresses/*`, nested in `/admin/customers` | Most required | **Critical** |

---

## Auth artefacts

| Data | Storage | Notes | Risk |
|------|---------|-------|------|
| OTP code | `otp_logs.otp_code` (bcrypt) | Plain OTP never stored; **generation is static `1234`** (`otp.util.ts:20`) | High |
| OTP mobile | `otp_logs.mobile_number` plaintext | Also Redis key `otp:*:{mobile}` | **Critical** |
| Session token | Cookie `user_session` HttpOnly; DB `refresh_token_hash` SHA-256 | `user_sessions` | **Critical** |
| Device / IP | `device_id`, `device_name`, `browser`, `os`, `ip_address` | `user_sessions` | High |
| Admin JWT | Cookie `admin_token` + body on login | Payload: `sub`, `email`, `role` | **Critical** |
| Admin password | `admin_users.password` bcrypt `select: false` | | **Critical** |
| KwikPass token | Transient request body | `POST /auth/kwikpass/exchange` | High |

---

## Orders & payments

| Data | Location | Endpoints | Risk |
|------|----------|-----------|------|
| Shipping snapshot (name, phone, address) | `orders.*` | `/orders`, `/admin/orders` | **Critical** |
| Order notes (free text) | `orders.notes` | checkout/order | High |
| Payment refs / links | `payment_requests` | `/payment-requests`, `/admin/payment-requests`, webhooks | High |
| Customer create fields on payment request | DTO only → resolves user/address | Admin wizard | High |
| GoKwik phone | `gokwik_orders.customer_phone` | `/gokwik/*` | **Critical** |
| GoKwik address/email/phone/PAN (input) | DTOs `GokwikAddressDto`, `GokwikUserDetailsDto` (`pan` optional) | create/place order | **Critical** (PAN intake) |
| Webhook / abandoned cart JSON | `gokwik_webhook_events.payload`, `gokwik_abandoned_carts.payload` | webhooks | High–Critical |

---

## Support / content

| Data | Location | Risk |
|------|----------|------|
| Guest name/email/mobile | `support_tickets` | High / Critical |
| Ticket description / messages | free text (+ possible health notes) | High |
| Blog guest name/email | `blog_comments` | Medium–High |
| Review customer_name + text | `product_reviews` | Medium–High |

---

## Admin & staff

| Data | Location | Risk |
|------|----------|------|
| Admin full_name, email, phone, password | `admin_users` | High / Critical |
| Staff (vendor/telecaller) as `users` with roles | `/staff-users` | High — **unguarded** |

---

## Redis (PII keys / values)

| Key pattern | PII | Risk |
|-------------|-----|------|
| `otp:send:cooldown:{purpose}:{mobile}` | mobile in key | High |
| `otp:rate:mobile:{mobile}` | mobile in key | High |
| `otp:rate:ip:{ip}` | IP in key | Medium |
| `session:context:token:{hash}` | cached full profile | **Critical** |
| `session:context:id:{sessionId}` | same | **Critical** |
| `wishlist:*:{userId}` | user UUID | Medium |

---

## Not found in codebase

- Aadhaar columns  
- User-linked medical records (health concerns = **product taxonomy** only)  
- Firebase references  
- Consent / privacy-policy acceptance fields  

**Manual Verification Required:** Whether free-text support notes routinely contain health diagnoses; whether live GoKwik abandoned-cart payloads include full PII.
