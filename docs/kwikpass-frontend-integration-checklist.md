# KwikPass Frontend Integration Checklist

> Share this document with the frontend developer to verify and fix the KwikPass SDK integration.

---

## How KwikPass Works (Quick Summary)

```
User enters phone
    │
    ▼
[Frontend SDK]  kpSendOTP(phone)          ← GoKwik sends SMS OTP directly
    │
    ▼  (user enters OTP)
[Frontend SDK]  kpVerifyOTP({phone, otp}) ← GoKwik verifies, returns kpToken
    │
    ▼
[Backend API]   POST /api/v1/auth/kwikpass/exchange  { kpToken }
    │
    ▼
[Backend]       Decrypts kpToken → creates Cureka session ✓
```

**Important:** The backend has NO role in sending or verifying the OTP.
All OTP communication is between the frontend SDK and GoKwik's servers.

---

## Step 1 — Verify SDK Script is Loading

### What to check
Open the browser DevTools → **Network** tab → filter by `kp-custom-merchant`.

**Expected:** A request to load the KwikPass JS file returns HTTP `200`.

### Correct script initialization code
```javascript
window.merchantInfo = {
  ...window.merchantInfo,
  mid: "19dq83228jtc",          // ← must match exactly (from GoKwik)
  environment: "sandbox",        // ← "sandbox" for testing, "production" for live
  type: "merchantInfo",
};

const script = document.createElement("script");
script.type = "text/javascript";
script.defer = true;
script.src = "https://sandbox.pdp.gokwik.co/kwikpass/plugin/build/kp-custom-merchant.js";
script.onload = function () {
  window.dispatchEvent(new CustomEvent("kp-script-loaded"));
};
document.head.appendChild(script);
```

### How to verify from browser console
```javascript
// Should print an object, NOT undefined
console.log(window.__KP_LOGIN_SDK_INSTANCE__);

// Should print "19dq83228jtc"
console.log(window.merchantInfo?.mid);
```

**If `window.__KP_LOGIN_SDK_INSTANCE__` is `undefined`** → script failed to load or wrong URL.

---

## Step 2 — Verify kpSendOTP Works

### Test from browser console
Open DevTools console on the Cureka website and run:

```javascript
const result = await window.__KP_LOGIN_SDK_INSTANCE__.kpSendOTP('9XXXXXXXXXX');
console.log('kpSendOTP result:', JSON.stringify(result));
```

### Expected success response
```json
{ "status": 200, "message": "OTP sent successfully" }
```

### Failure responses and what they mean

| Response | Meaning | Fix |
|----------|---------|-----|
| `status: 400, message: "OTP expired..."` | Previous OTP not expired yet | Wait 5 minutes and retry |
| `undefined` or error thrown | SDK not initialized | Check Step 1 — wrong `mid` or script not loaded |
| `status: 4xx, message: "Invalid merchant"` | Wrong `mid` in `window.merchantInfo` | Confirm `mid = "19dq83228jtc"` |
| `status: 5xx` | GoKwik server issue | Try again or contact GoKwik support |

**Note for sandbox testing:** In sandbox mode, GoKwik may only send OTPs to pre-whitelisted phone numbers. If your number is not whitelisted, OTP will not be delivered. Contact GoKwik to whitelist your test number.

---

## Step 3 — Verify kpVerifyOTP Works

### Test from browser console (after receiving OTP)
```javascript
const result = await window.__KP_LOGIN_SDK_INSTANCE__.kpVerifyOTP({
  phone: "9XXXXXXXXXX",
  otp: 1234  // the OTP received via SMS
});
console.log('kpVerifyOTP result:', JSON.stringify(result));
```

### Expected success response
```json
{
  "status": 200,
  "body": {
    "data": {
      "kpToken": "eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0...",
      "email": "",
      "token": "...",
      "coreToken": "..."
    }
  }
}
```

The `kpToken` from this response is what gets sent to the backend.

### Failure responses

| Response | Meaning | Fix |
|----------|---------|-----|
| `status: 400, message: "OTP is invalid"` | Wrong OTP entered | Re-enter correctly |
| `status: 400, message: "OTP expired"` | OTP timed out (5 min limit) | Call `kpSendOTP` again |

---

## Step 4 — Verify Backend Token Exchange Works

After getting a `kpToken` from `kpVerifyOTP`, test the backend exchange:

### API call
```
POST https://cureka.techbv.in/api/v1/auth/kwikpass/exchange
Content-Type: application/json

{
  "kpToken": "<paste kpToken here>"
}
```

### Expected success response
```json
{
  "statusCode": 200,
  "message": "KwikPass session created",
  "data": {
    "sessionId": "...",
    "isRegistered": true,
    "token": "...",
    "user": { "id": "...", "mobileNumber": "91XXXXXXXXXX", ... }
  }
}
```

### Probe endpoint (for detailed debugging)
If the exchange fails, use this endpoint to see exactly what's inside the kpToken:

```
POST https://cureka.techbv.in/api/v1/auth/kwikpass/probe
Content-Type: application/json

{
  "kpToken": "<paste kpToken here>"
}
```

Sample response when everything is correct:
```json
{
  "ok": true,
  "stage": "decrypted",
  "claims": {
    "mobile_number": "919876543210",
    "merchant_id": "19dq83228jtc",
    "exp": 1753786000
  },
  "derived": {
    "parsedPhone": "919876543210",
    "isExpired": false,
    "issuerMatch": "ok",
    "merchantIdMatch": "ok"
  }
}
```

Sample response when `encryptionKey` mismatch:
```json
{
  "ok": false,
  "stage": "decrypt",
  "error": "decryption operation failed",
  "hint": "Check that KWIKPASS_JWE_SECRET on the server matches the key GoKwik provided"
}
```

---

## Step 5 — Verify SSO Event Listener (for returning users)

For users who have previously logged in via any GoKwik merchant, the `kwikpass-sso` event fires automatically — **no OTP needed**.

### Check if the listener is set up
```javascript
// Run in browser console — should NOT throw
window.__KP_LOGIN_SDK_INSTANCE__?.handleKpSSOButton();
```

### Correct listener code
```javascript
window.addEventListener("kp-script-loaded", function () {
  window.__KP_LOGIN_SDK_INSTANCE__?.handleKpSSOButton();

  window.addEventListener("kwikpass-sso", async function (event) {
    const kpToken = event?.data?.detail?.kpToken;
    console.log("[KwikPass SSO] kpToken received:", kpToken ? "YES" : "NO");

    if (!kpToken) return;

    const response = await fetch("/api/v1/auth/kwikpass/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpToken }),
      credentials: "include",
    });
    const data = await response.json();
    console.log("[KwikPass SSO] Exchange result:", data);
    // Handle login → redirect or update UI
  });
});
```

---

## Step 6 — Verify Logout Handling

**Critical:** Without calling `handleKPLogout()`, `kpSendOTP` may silently fail on the next visit.

### Correct logout code
```javascript
// Always call this BEFORE your existing logout
window.__KP_LOGIN_SDK_INSTANCE__?.handleKPLogout();

// Then call Cureka logout
await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
```

---

## Step 7 — Backend Config Verification

Call this endpoint to confirm the backend has the correct config:

```
GET https://cureka.techbv.in/api/v1/auth/kwikpass/config
```

Expected response:
```json
{
  "statusCode": 200,
  "message": "KwikPass configuration",
  "data": {
    "enabled": true,
    "merchantId": "19dq83228jtc",
    "environment": "sandbox",
    "sdkUrl": "https://sandbox.pdp.gokwik.co/kwikpass/plugin/build/kp-custom-merchant.js"
  }
}
```

If `enabled: false` → the server environment variables (`KWIKPASS_MERCHANT_ID` or `KWIKPASS_JWE_SECRET`) are missing. Contact the backend team.

---

## Complete Integration Checklist

- [ ] `window.merchantInfo.mid` is set to `19dq83228jtc` before the script loads
- [ ] `window.merchantInfo.environment` is set to `"sandbox"` (or `"production"`)
- [ ] KwikPass SDK script is loaded from the correct URL
- [ ] `window.__KP_LOGIN_SDK_INSTANCE__` is defined after page load
- [ ] `kpSendOTP(phone)` returns `status: 200`
- [ ] OTP SMS is received on the phone
- [ ] `kpVerifyOTP({phone, otp})` returns `status: 200` with a `kpToken`
- [ ] `POST /api/v1/auth/kwikpass/exchange` with the `kpToken` returns a Cureka session
- [ ] `kwikpass-sso` event listener is set up for returning users
- [ ] `handleKPLogout()` is called on every logout

---

## Common Issues

### "Not getting OTP SMS"
1. In **sandbox**, only whitelisted phone numbers receive SMS. Ask GoKwik to whitelist your test number.
2. Check `kpSendOTP` return value — if `status: 200`, OTP was triggered but SMS may be delayed.
3. Check WhatsApp — GoKwik also sends OTP via WhatsApp by default.

### "kpToken exchange fails with 401"
1. Call `POST /api/v1/auth/kwikpass/probe` with the token to see the exact error.
2. Most likely cause: `kpToken` has expired (they are short-lived, ~5 minutes). Exchange immediately after `kpVerifyOTP`.

### "SSO button not appearing"
The SSO button only appears for users who have previously authenticated on **any** GoKwik merchant (including their test environment). First-time users must go through the OTP flow.

### "SDK not initialized / `__KP_LOGIN_SDK_INSTANCE__` is undefined"
Make sure `window.merchantInfo` is set **before** the script loads, not after.

---

## Environment Values Summary

| Value | What it is | Status |
|-------|-----------|--------|
| MID: `19dq83228jtc` | Merchant ID from GoKwik | ✅ Configured on backend |
| encryptionKey | JWE secret for token decryption | ✅ Configured on backend |
| `KWIKPASS_JWE_ISSUER` | Optional — not given by GoKwik | ✅ Correctly empty |
| `KWIKPASS_JWE_AUDIENCE` | Optional — not given by GoKwik | ✅ Correctly empty |
| SDK URL | Auto-derived from environment | ✅ Available via `/auth/kwikpass/config` |
