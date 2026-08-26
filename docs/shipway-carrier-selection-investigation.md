# Shipway carrier selection investigation

**Date:** 2026-08-26  
**Scope:** Read-only — how this account should obtain / assign a courier before or during `POST /api/v2orders`  
**Do not:** change code, webhook logic, or hardcode a carrier id  

**Proven on fresh order `ORD249353482947`:**

| Fact | Evidence |
| --- | --- |
| `carrier_id` omitted from HTTP body | Logs: `carrierIdPresent: false` |
| Shipway still rejected push | HTTP **202**, `success: false` |
| Messages | `carrier_id does not exist.` + `awb_response: "No Courier Found."` |
| `GET /api/carriers` | `"The Entity carriers not found"` |
| `SHIPWAY_CARRIER_ID` | Not set in env |

Omit-null fix is **working**. Remaining blocker is **how this Shipway account expects courier selection / serviceability**, not JSON null serialization.

---

## 1. `ShipwayService.getCarriers()`

| Item | Value |
| --- | --- |
| Method | `GET` |
| Path | `/api/carriers` |
| Full URL | `{SHIPWAY_BASE_URL}/api/carriers` (default host `https://app.shipway.com`) |
| Auth | HTTP **Basic** — username `SHIPWAY_EMAIL`, password `SHIPWAY_LICENSE_KEY` (same as `pushOrder`) |
| Query/body params | None |
| Used in push / admin / controllers? | **No** — method exists only on `ShipwayService`; **zero call sites** elsewhere |

```ts
// modules/shipping/services/shipway.service.ts
getCarriers(): Promise<IShipwayCarriersResponse> {
  return this.request<IShipwayCarriersResponse>('/api/carriers', { method: 'GET' });
}
```

### Origin

Introduced in the initial shipping module commit (`feat: implement shipping module with Shipway integration`, Jul 2026) together with typed interfaces:

```ts
// modules/shipping/interfaces/shipway-api.interface.ts
// Carrier List (GET /api/carriers)
```

There is **no** linked Shipway PDF, support email, or external URL in-repo proving this path. It appears to be an **assumed** OMS endpoint scaffold, not a verified integration used in production flows.

---

## 2. Codebase search summary (`carrier` / `courier` / `serviceability` / …)

| Area | What exists |
| --- | --- |
| Push payload `carrier_id` | Optional env `SHIPWAY_CARRIER_ID` only |
| Response `courier_name` / `courier_id` | Persisted on `shipments` after successful push / webhook / sync |
| Webhook `carrier` / `carrier_id` | Parsed from panel payload; not used for push selection |
| Classic `/api/track` | Optional `carrier_id` in body when known from OMS |
| `GET /api/carriers` | Stub only (unused) |
| Serviceability API | **None** |
| Courier recommendation API | **None** |
| Rate calculation API | **None** |
| Carrier assignment workflow | **None** (no pre-push selection step) |
| Warehouse → carrier mapping | **None** (warehouse id is env string only) |
| Vendor `warehouse_*` / GoKwik `serviceable_status` | Unrelated to Shipway courier APIs |

Shipway HTTP surface actually used in code:

| Endpoint | Host | Used for |
| --- | --- | --- |
| `POST /api/v2orders` | OMS `SHIPWAY_BASE_URL` | Create order / book |
| `GET /api/getorders?orderid=` | OMS | Lookup |
| `GET /api/tracking?awb_numbers=` | OMS | Tracking |
| `POST /api/cancel` | OMS | Cancel (defined; usage limited) |
| `POST /api/ndr/action` | OMS | NDR (defined; unused in controllers found) |
| `GET /api/carriers` | OMS | Defined; **unused**; **fails on this account** |
| `POST /api/getOrderShipmentDetails` | Classic `SHIPWAY_TRACKING_BASE_URL` | Tracking |
| `POST /api/track` | Classic | AWB track |

---

## 3. Do we already integrate serviceability / recommendation / rates?

**No.**

The only carrier-list related code is the unused `getCarriers()` stub. There is no serviceability check by pincode/weight/COD, no rate API, and no recommendation step before `v2orders`.

---

## 4. Push typing: does Shipway expect `carrier_id` before `v2orders`?

From interfaces only:

```ts
// Shipment booking (for label generation)
carrier_id?: number;           // optional on request
warehouse_id?: string;
return_warehouse_id?: string;

// Response
success: boolean;
message: string;
awb_number?: string;
courier_name?: string;
courier_id?: string | number;
// NOTE: awb_response is NOT in our TypeScript type (but Shipway returned it live)
```

Repo intent (comments in `shipway.config.ts`):

- `carrier_id` optional; empty → “Shipway will auto-select based on serviceability”
- `warehouse_id` required for **label-generation** mode (AWB assignment)

So **in-repo assumption = Flow A** (push without carrier → Shipway assigns).

**Live evidence for this account contradicts pure auto-select success:** omit still fails. That does **not** by itself prove Flow B is required; it may mean auto-select ran and found **no courier** (see §9).

---

## 5. Warehouse `91656` and carrier selection

- Push sends `warehouse_id` / `return_warehouse_id` from `SHIPWAY_WAREHOUSE_ID` / `SHIPWAY_RETURN_WAREHOUSE_ID`.
- Stored later on `shipments.warehouse_id` after a successful push.
- Config: warehouse is for label-generation / AWB booking origin.
- **No code** ties warehouse `91656` to a carrier list, serviceability matrix, or pincode rules inside Cureka.

Warehouse is therefore **relevant as Shipway-side booking context** (origin), but Cureka does not implement warehouse-based carrier selection.

---

## 6. Expected flow from repository alone

| Flow | Description | Repo says | Live test says |
| --- | --- | --- | --- |
| **A** | `POST /api/v2orders` without `carrier_id` → Shipway auto-assigns | **Yes** (config comments + optional field) | **Failed** for this account/order with “No Courier Found” |
| **B** | Serviceability/carrier API → then push with `carrier_id` | **Not implemented**; only unused `/api/carriers` stub | `/api/carriers` invalid here |

**Conclusion from repo:** authors intended **A**.  
**Conclusion from live evidence:** A did not succeed for warehouse + destination + COD + parcel on this account. Whether B is mandatory, or A fails due to **serviceability / account courier setup**, **cannot be proven from this repository**.

---

## 7. Why `GET /api/carriers` → `"The Entity carriers not found"`

Observed with same Basic Auth as working OMS calls (`v2orders` was reached and returned a structured JSON error).

Most likely interpretations **consistent with evidence** (without inventing a new URL):

1. **Endpoint wrong / obsolete** for this Shipway OMS API version or account type  
2. **Resource name not exposed** on `app.shipway.com` for this merchant (“Entity … not found” reads like a generic API router miss)  
3. **Not** clearly an auth failure (auth failures elsewhere look like classic “Invalid Username or Password”; OMS push authenticated enough to validate order + courier logic)

Repo does **not** document:

- required query params  
- alternate path/version  
- panel-only carrier id discovery  

**Shipway documentation/support confirmation required.**  
Do **not** invent a replacement endpoint from guesswork.

---

## 8. Correct next API call if proven from repository?

**None.**

`GET /api/carriers` is the only carrier-list call in code, and it is **invalid for this account**. No other serviceability/carrier endpoint is defined in the repository.

Next step is **operational / Shipway support**, not another unverified Cureka HTTP call.

---

## 9. `carrier_id does not exist` + `No Courier Found` — field missing vs serviceability?

Both came back together on a body that **omitted** `carrier_id`.

| Signal | Interpretation |
| --- | --- |
| `message: "carrier_id does not exist."` | Ambiguous: missing required field **or** no resolvable carrier id after auto-select |
| `awb_response: "No Courier Found."` | Stronger signal: Shipway could **not assign a courier** for the booking attempt |

Push context for the failed order (from your test; no secrets):

| Factor | Value |
| --- | --- |
| `warehouse_id` | `91656` |
| Destination pincode | `627356` |
| `payment_type` | `C` (COD) |
| Weight | `500` g |
| Dimensions | `14 × 10 × 20` cm |

So this can mean:

1. Account requires an explicit `carrier_id` (Flow B), **and/or**  
2. Auto-select ran but **no courier is serviceable** for that warehouse → pincode → COD → weight/dims (couriers not enabled, COD not enabled for lane, warehouse misconfigured, etc.)

Cureka code **cannot distinguish** (1) vs (2) from the message pair alone. `"No Courier Found"` leans toward **serviceability / account courier coverage**, not merely “you forgot a JSON key.”

---

## 10. What not to do next

- Do **not** set a random `SHIPWAY_CARRIER_ID`  
- Do **not** treat `GET /api/carriers` as the source of truth for this account  
- Do **not** create another test order until Shipway clarifies carrier selection / serviceability for warehouse `91656` and pincode `627356`  
- Do **not** change webhook / AWB fallback yet  

---

## Questions for Shipway support (suggested)

1. For OMS `POST /api/v2orders` on our account: is `carrier_id` **required** or optional (auto-assign)?  
2. What is the **correct API** (if any) to list carriers or check serviceability for warehouse + destination pincode + COD?  
3. Why does `GET /api/carriers` return `The Entity carriers not found`? What is the supported replacement?  
4. For warehouse `91656` → pincode `627356`, COD, ~500g: which couriers should be available? Is the warehouse fully configured / activated for booking?  
5. How should we interpret combined `carrier_id does not exist` + `awb_response: No Courier Found`?

Contact already referenced in-repo: `contact@shipway.in` (`docs/shipway-webhook.md`).

---

## Checkpoint

```text
Current blocker:
  Shipway rejects v2orders without carrier_id with "No Courier Found" even though
  Cureka correctly omits carrier_id. Carrier discovery path in code is invalid.

GET /api/carriers validity:
  INVALID for this account/API — "The Entity carriers not found"

Existing carrier/serviceability API in code:
  Only unused stub GET /api/carriers. No serviceability, rates, or recommendation APIs.

Does Shipway require carrier_id before v2orders:
  UNKNOWN from repo. Repo assumes optional (auto-select). Live test fails without it.

Can Shipway auto-select based on current evidence:
  NOT successfully for this warehouse/pincode/COD/parcel. Auto-select intent in config
  is unproven for this account.

Warehouse 91656 relevant:
  YES as booking origin on push; no Cureka-side carrier mapping for it.

"No Courier Found" significance:
  Strongly suggests no serviceable/assignable courier for the booking attempt
  (coverage/account setup), not only a missing JSON field.

Correct next API call if proven from repository:
  NONE — no verified carrier/serviceability endpoint remains after /api/carriers failed.

Need Shipway documentation/support confirmation: YES

Code change required now: NO

Next action for me:
  Ask Shipway support how this account should select/assign carriers for
  POST /api/v2orders (required carrier_id vs auto-select; correct list/serviceability API;
  why warehouse 91656 → pincode 627356 COD returns No Courier Found).
  Do not place another Cureka test order until that is answered.
```

No code or database data was modified for this document.
