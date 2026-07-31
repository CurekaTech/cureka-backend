# Home Section Banner (Product / Category Sliders) — Frontend Integration

Admin can attach an optional **banner** to custom home sections of type `productSlider` and `categorySlider` (e.g. **Deal of the Day**, **Curated Wellness Essentials**).

The storefront receives that banner on homepage sections + section detail APIs.

**Base URL:** `/api/v1`

---

## What changed

| Area | Change |
|------|--------|
| Admin create/update | Optional multipart `banner_image` (+ optional `mobileImageUrl`, `linkUrl`) for `productSlider` / `categorySlider` |
| Admin GET | Existing `banners[]` on the section includes the promo banner when set |
| Public homepage sections | `data.banner` on `productSlider` / `categorySlider` |
| Public section by slug | Same `data.banner` on `GET /public/homepage/home-sections/:slug` |

No DB migration — reuses the existing `home_sections.banners` JSON column (single slide).

---

## Admin — configure banner

Endpoints (unchanged paths):

```http
POST   /api/v1/master/home-sections
PATCH  /api/v1/master/home-sections/:refId
```

`multipart/form-data`.

### Extra fields for `productSlider` / `categorySlider`

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `banner_image` | file | No | Desktop / primary banner. Required only when setting a banner for the first time (or replacing). Omit on update to **keep** the current banner. |
| `mobileImageUrl` | file | No | Mobile banner crop/image |
| `linkUrl` | text | No | Banner click URL (default `#`) |
| `productRefIds` / `categoryRefIds` | JSON/array | Yes (as today) | Existing product/category picks |
| `pageTitle` / `pageDescription` / `pageCanonicalUrl` | text | No | SEO (as today) |

Example update (Deal of the Day):

```
PATCH /api/v1/master/home-sections/HOM2026xxxxxx
Content-Type: multipart/form-data

title=Deal of the Day
productRefIds=["PRD20261234","PRD20265678"]
linkUrl=https://cureka.com/deals
banner_image=<file>
mobileImageUrl=<file>   # optional
```

Admin list/detail still expose:

```json
{
  "type": "productSlider",
  "title": "Deal of the Day",
  "banners": [
    {
      "imageUrl": { "key": "banners/…", "url": "https://…" },
      "mobileImageUrl": { "key": "banners/…", "url": "https://…" },
      "linkUrl": "https://cureka.com/deals"
    }
  ],
  "productRefIds": ["PRD20261234", "PRD20265678"]
}
```

`banners` is `null` or `[]` when no banner is set.

### CMS UI

On edit screens for **Deal of the Day** / **Curated Wellness Essentials** (and any other `productSlider` / `categorySlider`):

1. Keep existing product/category multi-select + SEO fields  
2. Add **Banner** image upload (desktop)  
3. Optional **Mobile banner** upload  
4. Optional **Banner link** (`linkUrl`)  
5. Show current banner preview from `banners[0]` when editing  

---

## Storefront — display banner

### Homepage sections

```http
GET /api/v1/public/homepage/sections
```

(or with `productSlider=true` / section flags as today)

For `type: "productSlider"` or `"categorySlider"`:

```json
{
  "refId": "HOM2026xxxxxx",
  "index": 3,
  "type": "productSlider",
  "title": "Deal of the Day",
  "slug": "deal-of-the-day",
  "data": {
    "banner": {
      "imageUrl": { "key": "banners/…", "url": "https://…" },
      "mobileImageUrl": { "key": "banners/…", "url": "https://…" },
      "linkUrl": "https://cureka.com/deals"
    },
    "products": [ /* product cards */ ]
  }
}
```

- `data.banner` is `null` when no banner configured — hide the banner block.  
- Prefer signed `url` on `imageUrl` / `mobileImageUrl`.  
- Use `mobileImageUrl` when present on small viewports; else fall back to `imageUrl`.  
- If `linkUrl` is set and not `#`, wrap the banner in an anchor.

### Section detail / View all page

```http
GET /api/v1/public/homepage/home-sections/:slug
```

Same `data.banner` + `data.products` (or `data.categories`) shape, plus SEO fields on the payload.

---

## UI checklist

### Admin

- [ ] Product slider edit: banner desktop upload  
- [ ] Optional mobile banner + link URL  
- [ ] Preview existing `banners[0]`  
- [ ] Saving products without re-uploading banner keeps previous banner  

### Website

- [ ] Deal of the Day / Curated Wellness Essentials: show `data.banner` above (or beside) the product row  
- [ ] Hide banner when `data.banner` is `null`  
- [ ] Responsive: mobile image when available  
- [ ] Banner click uses `linkUrl` when meaningful  

---

## Smoke test

1. Admin: open Deal of the Day → upload banner → save.  
2. Admin GET section → `banners[0].imageUrl` present.  
3. Public `GET /public/homepage/sections` → matching `productSlider` has `data.banner` with signed URL.  
4. Public `GET /public/homepage/home-sections/deal-of-the-day` → same banner.  
5. Update products only (no new file) → banner still present.  
6. Section with no banner → `data.banner: null`.
