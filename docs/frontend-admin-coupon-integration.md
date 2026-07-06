# Admin Coupon Integration Guide (Latest Changes)

This guide documents the latest changes in the payment requests module to support coupon application within the Admin Order Panel / Payment Link Wizard.

---

## 1. Dynamic Coupon Validation Endpoint

Use this endpoint to validate a coupon code and calculate the discount before creating or updating a payment request.

*   **Endpoint:** `POST /admin/payment-requests/validate-coupon`
*   **Authentication:** Required (Bearer Token)
*   **Headers:**
    ```http
    Authorization: Bearer <ADMIN_TOKEN>
    Content-Type: application/json
    ```

### Request Payload (`ValidateAdminCouponDto`):
```json
{
  "couponCode": "CUREKA20", // The coupon code string to check
  "customerId": "2701a5b8-501b-402c-aef6-92d507ad62d2", // Optional User ID
  "items": [
    {
      "productId": "e15a9757-cd18-4903-8d63-b8e734bc1e28",
      "variantId": "3202b28c-d2ff-4b10-827c-c4ab896e05ad",
      "quantity": 2,
      "unitPrice": "400.00"
    }
  ]
}
```

### Response Payload (200 OK):
```json
{
  "success": true,
  "message": "Coupon validated successfully",
  "data": {
    "couponCode": "CUREKA20",
    "discountAmount": "160.00", // Calculated discount based on coupon rules
    "subtotal": "800.00",       // Total items price before discount
    "platformFee": "50.00",     // Platform fee (e.g. 50 if subtotal < 900, else 0)
    "finalAmount": "690.00"     // Subtotal minus coupon discount plus platform fee
  }
}
```

*Note: If the coupon is expired, inactive, user-limit exceeded, or not applicable to these products, a `400 Bad Request` error is returned with a descriptive message.*

---

## 2. Updated Create & Edit API Payloads

When saving the payment request, pass the `couponCode` field optionally.

### A. Create Payment Request (`POST /admin/payment-requests`)
Pass `couponCode` if you successfully validated a coupon for the customer:
```json
{
  "customerPhone": "+919876543210",
  "couponCode": "CUREKA20", // Optional field
  "discount": "0.00",        // Optional manual discount (coupon discount is added automatically by backend)
  "items": [
    {
      "productId": "e15a9757-cd18-4903-8d63-b8e734bc1e28",
      "variantId": "3202b28c-d2ff-4b10-827c-c4ab896e05ad",
      "quantity": 2,
      "unitPrice": "400.00"
    }
  ]
}
```

### B. Edit Payment Request (`PUT /admin/payment-requests/:id`)
```json
{
  "couponCode": "CUREKA20", // Optional field to add/change coupon
  "discount": "10.00",      // Optional manual discount
  "items": [
    {
      "productId": "e15a9757-cd18-4903-8d63-b8e734bc1e28",
      "variantId": "3202b28c-d2ff-4b10-827c-c4ab896e05ad",
      "quantity": 2,
      "unitPrice": "400.00"
    }
  ]
}
```

---

## 3. Database & Response Changes
The backend stores four new columns on each payment request / order row, which are returned in all Payment Request/Order detail, list, create, and edit API responses:
1.  `couponCode`: The code of the applied coupon (or `null` if none).
2.  `couponDiscount`: The calculated discount amount attributed to that coupon (e.g. `"20.00"`).
3.  `platformFee`: The platform fee applied to this request/order.
4.  `codCharge`: The Cash on Delivery (COD) charge applied to this order (if COD payment method was used).

### Rules for Shipping, Platform Fee & COD Charges:
*   **Shipping Charge (`shipping_charge`):** The shipping fee is now dynamically resolved from database settings instead of static config files. A flat shipping charge of `50.00` is applied to checkouts if the payable amount is below the `shipping_charge_threshold` (`900.00`). If it is equal to or greater than `900.00` (or if a free shipping coupon is applied), the shipping charge is free (`0.00`).
*   **Platform Fee (`platform_fee`):** A flat fee of `50.00` is automatically charged on all checkouts if the subtotal is below the `platform_fee_threshold` (`900.00`). If the subtotal is equal to or greater than `900.00`, the platform fee is free (`0.00`).
*   **COD Charges (`cod_charge`):** A flat charge of `50.00` is applied only to orders placed using Cash on Delivery (`COD`). Online payment request links will always show a COD charge of `0.00`.

### Note on Total Computation:
*   `discount` contains the **combined sum** of any manual discount plus the calculated coupon discount.
*   The final payable amount is computed as: `subtotal - discount + tax + shipping + handling + platformFee + codCharge`.

When the customer completes their payment, these coupon, platform fee, and COD details will automatically propagate to the created Order record (persisted in `coupon_code`, `platform_fee`, `cod_charge`, etc.), and the coupon's total usage metric will be incremented.

---

## 4. Razorpay Hosted Payment Link Display
When generating a hosted checkout link (via `/admin/payment-requests/:id/generate-link`), the backend automatically formats the payment description sent to Razorpay to show the applied coupon and coupon discount:

*   **Format:** `[Product Name/List] (Qty: X) | Coupon: [CODE] applied (-₹[AMOUNT])`
*   **Result:** When the user opens the generated payment link, they will see a clear breakdown showing that the coupon was applied and the total amount reflects the discount.

