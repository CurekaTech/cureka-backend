# FAQ Banner — Website Integration

Optional FAQ section banner on product listing pages scoped by health concern, brand, wellness goal, or category (any category level).

Migration: `1785984000000-add-faq-banner-to-masters.ts`.

---

## Where it appears

| Context object | Product list scoped by | Response path |
|----------------|------------------------|---------------|
| `healthConcern` | `healthConcernSlug` / `healthConcernRefId` | `data.healthConcern.faqBanner` |
| `brand` | `brandSlug` / `brandRefId` | `data.brand.faqBanner` |
| `wellnessGoal` | `wellnessGoalRefId` | `data.wellnessGoal.faqBanner` |
| `category` | `categorySlug` / `categoryRefId` | `data.category.faqBanner` (+ `selectedCategory.faqBanner`) |

Primary source: **GET** `/api/v1/public/products`.

Category trees / public master category lists also include `faqBanner` when media is returned (all levels).

Homepage strip cards do **not** include FAQ banners — use PLP context only.

---

## Optional behavior

`faqBanner` is always optional:

- `null` / missing → do not render a banner image
- present with signed `url` → show beside/above the FAQ block

Brands have **no** `showFaqBanner` flag. If admin uploaded a banner, public returns it; otherwise `null`.

---

## Category levels

Works for root, subcategory, and deeper levels.

Fallback (same idea as `banner`):

- Root listing: use `category.faqBanner`
- Child category filter: prefer child `faqBanner` when set, else root `faqBanner`
- `selectedCategory.faqBanner` is the matched category’s own value (no fallback)

---

## Media shape

```ts
type StorageFile = {
  key: string;
  name: string;
  url?: string;
} | null;
```

Render only when `faqBanner?.url` is present.

---

## Suggested UI

```tsx
const faqBanner = context?.faqBanner;
const faqs = context?.faqs ?? [];

{(faqs.length > 0 || faqBanner?.url) && (
  <FaqSection bannerUrl={faqBanner?.url ?? null} items={faqs} />
)}
```

---

## Sample snippets

```json
{
  "healthConcern": {
    "faqs": [{ "question": "...", "answer": "..." }],
    "faqBanner": { "key": "...", "name": "...", "url": "https://..." }
  }
}
```

```json
{
  "brand": {
    "faqs": [],
    "faqBanner": null
  }
}
```

```json
{
  "category": {
    "faqs": [],
    "faqBanner": { "key": "...", "name": "...", "url": "https://..." },
    "selectedCategory": {
      "faqs": [],
      "faqBanner": null
    }
  }
}
```

---

## Checklist

- [ ] Category PLP (all levels) uses `category.faqBanner` / `selectedCategory.faqBanner`
- [ ] Brand / HC / wellness PLP use optional `faqBanner`
- [ ] Null banner does not break FAQ layout
- [ ] No brand visibility toggle assumed on the website
