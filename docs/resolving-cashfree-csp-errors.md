# Resolving Content Security Policy (CSP) Errors for Cashfree Payment Gateway

## 1. Problem Statement & Root Cause Analysis

When attempting to check out using the **Cashfree Payment Gateway**, the browser blocks the checkout submission and SDK source map request with the following console errors:

1. **Form Submission Blocked:**
   > *Sending form data to `https://sandbox.cashfree.com/pg/view/sessions/checkout` violates the following Content Security Policy directive: `form-action 'self'`. The request has been blocked.*

2. **SDK Connection Blocked:**
   > *Connecting to `https://sdk.cashfree.com/js/v3/cashfree.js.map` violates the following Content Security Policy directive: `connect-src 'self' ...`.*

### Why is this a Frontend/Hosting Concern?
* **Content Security Policy (CSP)** is a browser-enforced security mechanism. It is declared via HTTP response headers on the **HTML document** page loaded in the client's browser (or via a `<meta>` tag in `index.html`).
* Since the backend API (`Cureka-backend`) only serves JSON responses (e.g. `application/json`) and static files under `/uploads/`, it does **not** serve the primary HTML web app document and cannot dictate the browser's document-level CSP.
* The CSP header is being served by the **Next.js Frontend server / Nginx / reverse proxy** (hosting the user interface at `https://cureka.techbv.in`).

---

## 2. Action Required by Frontend Developer / System Administrator

The frontend developer or hosting administrator must update the `Content-Security-Policy` header policy to allow the browser to contact and navigate to Cashfree domains.

### Needed Directive Modifications:

1. **`form-action` Directive:**
   * **Current:** `form-action 'self'`
   * **New:** Add Cashfree checkout endpoints.
   * **Value to add:** `https://sandbox.cashfree.com` `https://api.cashfree.com` `https://payments.cashfree.com`

2. **`connect-src` Directive:**
   * **Current:** `connect-src 'self' ...`
   * **New:** Allow SDK connections and map files.
   * **Value to add:** `https://sdk.cashfree.com` `https://*.cashfree.com`

3. **`script-src` Directive (Recommended):**
   * Ensure Cashfree SDK script is allowed.
   * **Value to add:** `https://sdk.cashfree.com` `https://*.cashfree.com`

4. **`frame-src` Directive (Recommended for inline checkout modals/iframes):**
   * Allow Cashfree frames to open inside the page.
   * **Value to add:** `https://sandbox.cashfree.com` `https://api.cashfree.com` `https://payments.cashfree.com`

---

## 3. Configuration Fixes (Examples)

Depending on how the frontend team serves headers, they should use one of the following methods:

### Option A: In Nginx Server Block (Recommended if using Nginx reverse proxy)
If headers are set on the Nginx configuration, modify the `add_header Content-Security-Policy ...` directive.

**Update the Nginx header block to:**
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://sdk.cashfree.com https://*.cashfree.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://cureka.techbv.in wss://cureka.techbv.in https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com https://sdk.cashfree.com https://*.cashfree.com; frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com;";
```

---

### Option B: In Next.js Configuration (`next.config.js` / `next.config.mjs`)
If headers are defined inside Next.js, add/modify the `headers` key inside `next.config.js`:

```javascript
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://sdk.cashfree.com https://*.cashfree.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob: https:;
      media-src 'self' data: blob: https:;
      font-src 'self';
      connect-src 'self' https://cureka.techbv.in wss://cureka.techbv.in https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com https://sdk.cashfree.com https://*.cashfree.com;
      frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com;
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com;
    `.replace(/\s{2,}/g, ' ').trim()
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

---

### Option C: In Netlify / Vercel configurations (If applicable)
If the project is deployed on **Vercel** (`vercel.json`), configure custom headers under the `headers` property:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://*.razorpay.com https://sdk.cashfree.com https://*.cashfree.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; font-src 'self'; connect-src 'self' https://cureka.techbv.in wss://cureka.techbv.in https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://api.cashfree.com https://sandbox.cashfree.com https://sdk.cashfree.com https://*.cashfree.com; frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://sandbox.cashfree.com https://api.cashfree.com https://payments.cashfree.com;"
        }
      ]
    }
  ]
}
```
