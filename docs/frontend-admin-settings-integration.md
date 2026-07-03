# Frontend Integration Guide: Admin Settings Updates

This document outlines the changes to the Admin Settings UI structure, API endpoints, database, and integration requirements.

---

## 1. UI Sidebar and Menu Renaming

The sidebar menu structure under "System Setting -> Admin Setting" has been refactored in the backend's dynamic menu response (`MENU_HIERARCHY`) to the following structure:

* **Settings** (key: `settings`, icon: `Settings`)
  * **Cart Charges** (key: `cart-charges-view`, icon: `Percent`, href: `/settings/cart-charges`): Configures all charges and thresholds.
  * **Payment Methods** (key: `payment-methods-view`, icon: `CreditCard`, href: `/settings/payment-methods`): Configures payment gateways (Razorpay, PayU, Cashfree). Enforces that only one gateway is active at a time.
  * **Logistic Partners** (key: `logistic-partners-view`, icon: `Truck`, href: `/settings/logistic-partners`): Configures logistics settings (currently returns `[]` placeholder).

---

## 2. API Endpoints

### 2.1 Get Admin Settings (Filtered by Type)

Returns a filtered list of settings corresponding to the active view.

* **Path**: `GET /api/v1/admin/settings` (or current base path for `/admin/settings`)
* **Headers**:
  * `Authorization: Bearer <token>`
* **Query Parameters**:
  * `type` (optional, string):
    * `cart_charges`: Restricts response to all charge and threshold settings.
    * `payment_methods`: Restricts response to payment gateways (`razor_pay`, `pay_you`, `cash_free`).
    * `logistic_partners`: Returns an empty array `[]` (placeholder).
    * *Omitted*: Returns all settings.

#### Example A: Fetching Cart Charges
`GET /admin/settings?type=cart_charges`
```json
{
  "statusCode": 200,
  "message": "Admin settings retrieved successfully",
  "data": [
    {
      "id": "uuid-1",
      "refId": "SET20261005",
      "key": "shipping_charge_threshold",
      "value": "900",
      "status": "active",
      "description": "Order payable amount threshold (subtotal minus discount) for free shipping.",
      "createdAt": "2026-07-03T11:47:50.000Z",
      "updatedAt": "2026-07-03T11:47:50.000Z"
    },
    {
      "id": "uuid-2",
      "refId": "SET20261006",
      "key": "handling_charge",
      "value": "50",
      "status": "active",
      "description": "Flat handling/packaging fee applied to orders.",
      "createdAt": "2026-07-03T11:47:50.000Z",
      "updatedAt": "2026-07-03T11:47:50.000Z"
    },
    {
      "id": "uuid-3",
      "refId": "SET20261011",
      "key": "handling_charge_threshold",
      "value": "900",
      "status": "active",
      "description": "Order payable amount threshold (subtotal minus discount) for free handling charge.",
      "createdAt": "2026-07-03T11:47:50.000Z",
      "updatedAt": "2026-07-03T11:47:50.000Z"
    },
    {
      "id": "uuid-4",
      "refId": "SET20261012",
      "key": "cod_charge_threshold",
      "value": "0",
      "status": "active",
      "description": "Order payable amount threshold (subtotal minus discount) above which COD charge is waived.",
      "createdAt": "2026-07-03T12:03:00.000Z",
      "updatedAt": "2026-07-03T12:03:00.000Z"
    },
    {
      "id": "uuid-5",
      "refId": "SET20261013",
      "key": "prepaid_charge",
      "value": "0",
      "status": "active",
      "description": "Flat prepaid order charge/discount applied.",
      "createdAt": "2026-07-03T12:03:00.000Z",
      "updatedAt": "2026-07-03T12:03:00.000Z"
    },
    {
      "id": "uuid-6",
      "refId": "SET20261014",
      "key": "prepaid_charge_threshold",
      "value": "0",
      "status": "active",
      "description": "Order payable amount threshold (subtotal minus discount) above which prepaid charge is waived.",
      "createdAt": "2026-07-03T12:03:00.000Z",
      "updatedAt": "2026-07-03T12:03:00.000Z"
    }
  ]
}
```

---

### 2.2 Bulk Update Admin Settings

Updates multiple settings belonging to a specific setting type in a single transaction.

* **Path**: `PUT /api/v1/admin/settings`
* **Headers**:
  * `Authorization: Bearer <token>`
  * `Content-Type: application/json`
* **Query Parameters**:
  * `type` (required, string): `cart_charges`, `payment_methods`, or `logistic_partners`.
* **Request Body**:
```json
{
  "settings": [
    {
      "key": "key_name",
      "value": "new_value", // optional
      "status": "active"    // optional ('active' | 'inactive')
    }
  ]
}
```

#### Example A: Updating Cart Charges
`PUT /admin/settings?type=cart_charges`
```json
{
  "settings": [
    { "key": "shipping_charge", "value": "60" },
    { "key": "shipping_charge_threshold", "value": "1000" },
    { "key": "cod_charge_threshold", "value": "1500" },
    { "key": "prepaid_charge", "value": "20" },
    { "key": "prepaid_charge_threshold", "value": "1000" }
  ]
}
```

#### Example B: Activating a Payment Method
*Note: Activating one payment method (setting status to `active`) automatically deactivates all other payment methods in the backend.*
`PUT /admin/settings?type=payment_methods`
```json
{
  "settings": [
    { "key": "cash_free", "status": "active" }
  ]
}
```

---

## 3. Frontend Action Items

1. **Sidebar Navigation**:
   - The backend's dynamic menu response now outputs **Settings** (key: `settings`) instead of System Settings.
   - Map the new subItems keys to your page routes:
     - `cart-charges-view` -> Route: `/settings/cart-charges`
     - `payment-methods-view` -> Route: `/settings/payment-methods`
     - `logistic-partners-view` -> Route: `/settings/logistic-partners`

2. **Cart Charges Config Page**:
   - Fetch initial data using: `GET /admin/settings?type=cart_charges`.
   - Update settings by submitting changes via: `PUT /admin/settings?type=cart_charges`.
   - Ensure you render forms for the new fields: `cod_charge_threshold`, `prepaid_charge`, and `prepaid_charge_threshold`.

3. **Payment Methods Config Page**:
   - Fetch initial data using: `GET /admin/settings?type=payment_methods`.
   - Update active payment method using: `PUT /admin/settings?type=payment_methods`.
   - Display/verify that only one is toggled on (the backend automatically turns off the other methods when you set one to active).

4. **Logistic Partners Page**:
   - Place a placeholder or list (empty for now).
   - Fetch initial data using: `GET /admin/settings?type=logistic_partners`.
