# FAQ Banner — Admin Panel Integration

Optional FAQ section banner (`faqBanner`) on health concerns, brands, wellness goals, and categories (all hierarchy levels).

Migration: `1785984000000-add-faq-banner-to-masters.ts`  
Run: `npm run migration:run`

---

## Auth / content type

| Master | Base path | Create / update body |
|--------|-----------|----------------------|
| Health concern | `/api/v1/master/health-concerns` | `multipart/form-data` |
| Brand | `/api/v1/master/brands` | `multipart/form-data` |
| Wellness goal | `/api/v1/master/wellness-goals` | `multipart/form-data` |
| Category | `/api/v1/master/categories` | `multipart/form-data` |

Use existing admin JWT + role/permission rules for each master.

---

## Field

| Form field | DB column | Type | Required | Notes |
|------------|-----------|------|----------|--------|
| `faqBanner` | `faq_banner` | optional file → storage JSON | **no** | Omit on create/update to leave unset / keep existing |

Upload folder: `banners` (same as other master banners).

There is **no** show/hide flag for FAQ banner on brands (or any master). Presence of the image is enough; `null` means none.

---

## Categories — all levels

`faqBanner` is stored on the category row itself. It works for:

- Root
- Subcategory
- Sub-subcategory (any hierarchy level)

Admin create/update for any category level can optionally attach `faqBanner`. No level-specific restriction.

---

## UI work

For each master’s create/edit form:

1. Add an optional **FAQ Banner** image upload (field name must be exactly `faqBanner`).
2. Show current signed URL from GET detail when `faqBanner` is not null.
3. On update: omit the file to keep the existing image; upload a new file to replace.
4. Do **not** add a visibility toggle for brands.

No change to existing `faqs` JSON handling — this is only the banner image for the FAQ block.

---

## Endpoints (unchanged paths)

| Master | Create | Update | Get / List |
|--------|--------|--------|------------|
| Health concern | `POST /master/health-concerns` | `PATCH /master/health-concerns/:refId` | `GET ...` |
| Brand | `POST /master/brands` | `PATCH /master/brands/:refId` | `GET ...` |
| Wellness goal | `POST /master/wellness-goals` | `PATCH /master/wellness-goals/:refId` | `GET ...` |
| Category | `POST /master/categories` | `PATCH /master/categories/:refId` | `GET ...` |

---

## Multipart example

```http
PATCH /api/v1/master/categories/{refId}
Authorization: Bearer <admin_jwt>
Content-Type: multipart/form-data

faqBanner: <image file>
```

Same field name for health concerns, brands, and wellness goals.

---

## Admin response shape

```json
{
  "faqBanner": {
    "key": "banners/....",
    "name": "faq-banner.webp",
    "url": "https://signed-url..."
  }
}
```

When unset: `faqBanner: null`.

---

## Checklist

- [ ] Migration run on each environment
- [ ] HC / brand / wellness / category forms: optional FAQ Banner upload + preview
- [ ] Category form works for root, sub, and sub-sub categories
- [ ] Brand form has **no** show/hide FAQ banner toggle
- [ ] Create without `faqBanner` succeeds (field stays `null`)
- [ ] Update without uploading keeps previous `faqBanner`
