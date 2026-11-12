# Product ratings and reviews — Mobile App Integration

Use this guide so the mobile app shows and submits product ratings the same way the Cureka website does. The public APIs below are the source of truth. Do not calculate an average on the device, and do not mix one variant’s stars with another variant’s review list.

Base path: `/api/v1`.

Related website behavior:

- Product cards read `averageRating` and `reviewCount` on the public product card.
- The product page reloads `GET /public/products/:slug/reviews` when the selected variant changes, and uses that response for the stars next to the title and for the review list together.

---

## 1. What the website shows

| Surface | Rating source | What to draw |
|---|---|---|
| Listing, search, homepage, and recommendation cards | `averageRating` and `reviewCount` already on the product card | `4.5 ★ (12)` when either value is above 0. Hide the line when both are 0. |
| Product page, next to the title | `summary` from the reviews call for the **selected variant** | Stars, one-decimal average, and the count: `4.5 (12)`. Show `0.0 (0)` when that set is empty. Tapping it scrolls to the review section. |
| Product page review section | The same reviews response as the stars | Average, star breakdown, and the review cards. |
| Write a review | `GET .../can-review` | The button is visible only when `canReview` is true. |

Listing cards are always the **product** total: every approved review for that product, on any variant, including older reviews that have no variant. The product page is different. It uses the selected variant when that variant has approved reviews, and otherwise falls back to the product total.

---

## 2. Rules the app must keep

1. Stars, count, and list on the product page come from one response. When `scope` is `variant`, show that variant only. When `scope` is `product`, show the product total for all three. Never pair a variant average with the product count.
2. Changing the selected variant replaces the whole set. Clear the previous stars and list, then render the new response. Do not keep the old average while the new list loads.
3. Public reads contain approved reviews only. A review the customer just submitted stays hidden until an admin approves it.
4. Do not send `userId`. The server sets it from the signed-in customer.
5. The title field is `review`. It is required. Description, age, and location are optional.
6. Attach the review to the variant the customer is looking at by sending that variant’s `variantId`.
7. `canReview` means the customer is signed in, verified, and has a **delivered** order of this product. It is not limited to the selected variant. Guests see no Write a review button; send them to sign-in if they try. My Orders shows Write a Review per delivered line item, then Reviewed once submitted.
8. There is no helpful or report API. Do not show those actions.
9. Do not hard-code `0` when the card payload includes `averageRating` or `reviewCount`.

---

## 3. Auth and envelope

`GET /public/products/:slug/reviews` needs no session.

`GET /public/products/:slug/can-review` sends the session when the customer is signed in. Without a session the API returns `canReview: false`.

`POST /public/products/:slug/reviews` requires the same verified customer session the app uses for cart and orders:

```http
Authorization: Bearer <customer_session>
```

Success:

```json
{
  "success": true,
  "data": {},
  "message": "Product reviews retrieved successfully",
  "timestamp": "2026-10-28T06:30:00.000Z"
}
```

Error:

```json
{
  "success": false,
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Only customers with a delivered order of this product can submit a review",
  "timestamp": "2026-10-28T06:30:00.000Z",
  "path": "/api/v1/public/products/serum/reviews"
}
```

Show `message`. Do not invent a local error string when the API returned one.

---

## 4. Product cards

Use the fields already returned on public product cards (listing, search, homepage, recommendations):

```json
{
  "averageRating": 4.5,
  "reviewCount": 12
}
```

- `averageRating` is the product total, rounded to one decimal. `0` means no approved reviews.
- `reviewCount` is that same approved set.
- Draw `4.5 ★ (12)` only when `averageRating > 0` or `reviewCount > 0`.
- These numbers do not change when a card is showing one SKU. Variant-specific stars exist only on the product page.

---

## 5. Product page

Call this when the product page opens and again whenever the selected variant changes.

```http
GET /public/products/{productSlug}/reviews?variantId={selectedVariantUuid}
```

Use the parent product `slug`, plus the selected variant id. Do not send a variant slug and a different `variantId` together. If both are sent, they must be the same variant.

### 5.1 Response

```json
{
  "summary": {
    "averageRating": 4.5,
    "ratingsCount": 2,
    "reviewsCount": 2,
    "breakdown": [
      { "rating": 5, "percent": 50 },
      { "rating": 4, "percent": 0 },
      { "rating": 3, "percent": 0 },
      { "rating": 2, "percent": 0 },
      { "rating": 1, "percent": 50 }
    ]
  },
  "reviews": [
    {
      "refId": "REV2026000001",
      "customerName": "Asha",
      "rating": 5,
      "review": "Gentle on skin",
      "reviewDescription": "Used it for two weeks. No irritation.",
      "customerAge": "32",
      "customerLocation": "Ahmedabad",
      "variantId": "0f1c2a48-3b7e-4d1a-9c22-6a0b1d2e3f40",
      "createdAt": "2026-10-01T08:00:00.000Z"
    }
  ],
  "scope": "variant",
  "variantId": "0f1c2a48-3b7e-4d1a-9c22-6a0b1d2e3f40"
}
```

| Field | Use |
|---|---|
| `summary.averageRating` | Stars next to the title and the large average in the review section. One decimal. |
| `summary.reviewsCount` | The count next to the title, `(12)`, and the “Ratings, Reviews” line. |
| `summary.ratingsCount` | Same number as `reviewsCount`. The website prints both. |
| `summary.breakdown` | Five rows, 5 down to 1. `percent` is the share of this same set. |
| `scope` | `variant` or `product`. |
| `variantId` | Set only when `scope` is `variant`. Null on the product fallback. |
| `reviews[].review` | Title. Hide the line when null or blank. |
| `reviews[].reviewDescription` | Body under the title. Hide when null or blank. |
| `reviews[].customerAge`, `customerLocation` | One meta line, joined with ` · `. Omit a part that is null or blank. |
| `reviews[].createdAt` | `Posted on Oct 1, 2026` (US month-day-year). |
| `reviews[].customerName` | Name on the card. |
| `reviews[].rating` | Integer 1–5 badge. |

`scope: "variant"` means this variant has approved reviews. Show only `reviews` and `summary` from this payload.

`scope: "product"` means this variant has no approved reviews. The API has already replaced the stars, the count, and the list with every approved review on the product. Render that payload as-is. Do not filter it down to the selected variant on the device, or the stars and the list will diverge.

Empty set: average `0`, counts `0`, every breakdown percent `0`, `reviews: []`. Show “No approved reviews yet. Be the first to review this product.”

A failed reviews call uses the same empty state. Do not block the rest of the product page.

### 5.2 Variant switch

```text
Open PDP
  → GET reviews?variantId={current variant}
  → Draw title stars and the review section from that one payload

Customer selects another variant
  → GET reviews?variantId={new variant}
  → Replace stars, count, breakdown, and cards together
```

If the request fails, keep the last successful payload.

---

## 6. Write a review

Check eligibility when the product page opens. Repeat after sign-in.

```http
GET /public/products/{productSlug}/can-review?variantId={selectedVariantId}
Authorization: Bearer <customer_session>
```

Pass the on-screen `variantId` the same way as the reviews list. Eligibility is true only when the customer has a delivered order of this product and has not already submitted a review for it.

```json
{ "canReview": true }
```

| `canReview` | Write a review |
|---|---|
| `false` or no session | Hidden. If the customer still tries, open sign-in with “Please sign in to write a review.” |
| `true` | Show the button. |

The form matches the website:

| Input | API field | Required | Limit |
|---|---|---|---|
| Stars | `rating` | Yes, integer 1–5 | — |
| Title | `review` | Yes, trimmed | 2000 |
| Longer text | `reviewDescription` | Yes, trimmed | 5000 |
| Selected variant | `variantId` | Send the variant on screen | UUID |

Do **not** send `customerAge` or `customerLocation`. The API derives age from the customer’s date of birth and location as `City, State` from the latest qualifying order (then default address), and stores them as snapshots on the review.

Local checks before the request, same copy as the website:

- No stars: “Please select a star rating.”
- Empty title: “Please write a review.”

```http
POST /public/products/{productSlug}/reviews
Authorization: Bearer <customer_session>
Content-Type: application/json
```

```json
{
  "rating": 5,
  "review": "Gentle on skin",
  "reviewDescription": "Used it for two weeks. No irritation.",
  "variantId": "0f1c2a48-3b7e-4d1a-9c22-6a0b1d2e3f40"
}
```

The new row is `pending`. It is not in the public list. Close the form and show:

“Thanks! Your review was submitted and will appear after admin approval.”

Do not insert the create response into the list. On any other failure, show the API `message`, or “Could not submit your review. Please try again.” when there is no message.

| Status | Message | App |
|---|---|---|
| 403 | Please sign in to submit a product review | Open sign-in |
| 403 | Only customers with a delivered order of this product can submit a review | Show the message. Hide the button on the next `can-review`. |
| 409 | You have already submitted a review for this variant | Show the message. Hide Write a Review for that variant. |
| 400 | Rating must be an integer between 1 and 5 | Show the message |
| 400 | Review text is required | Show the message |
| 400 | Variant does not belong to this product | Show the message. Send the variant id from the product payload. |
| 404 | Product with slug … not found | Show the message |

---

## 7. See-all screen

Optional. The website opens `/products/{slug}/reviews` and, when the product page `scope` was `variant`, calls the same reviews URL with that `variantId`.

Filter stars on the device from the list already returned. There is no page query for “only 5 stars.” “Popular” on the website does nothing useful because helpful votes are not stored. Do not add that filter in the app.
