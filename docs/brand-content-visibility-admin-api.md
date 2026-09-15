# Brand Content Visibility Flags - Admin API

Use these flags in Brand master CRUD to control which brand content blocks should be shown on the website when a product list is filtered by that brand.

Migration: `1785974000000-add-brand-content-visibility-flags.ts`  
Run: `npm run migration:run`

---

## Endpoints

- `POST /api/v1/master/brands`
- `PATCH /api/v1/master/brands/:refId`
- `GET /api/v1/master/brands/:refId`
- `GET /api/v1/master/brands`

Auth: admin JWT.

Content type for create/update: `multipart/form-data`

---

## New visibility flags

All flags are optional in admin create/update payloads.  
Default for all flags: `true`

| Flag | Controls |
|------|----------|
| `showBanner` | `banner` |
| `showVideo` | `video` |
| `showFeaturedBanner` | `featuredBanner` |
| `showPromotionalBanner` | `promotionalBanner` |
| `showSecondaryBanner` | `secondaryBanner` |
| `showSecondaryVideo` | `secondaryVideo` |
| `showOfferBanner` | `offerBanner` |
| `showBrandHighlights` | `brandHighlights` |
| `showDescription` | `description` |

These flags do not delete the stored media/content. They only control storefront visibility.

---

## Create / update payload

Send the usual brand fields plus the new boolean form fields.

### Multipart text fields

| Field | Type | Example |
|------|------|---------|
| `name` | string | `Similac` |
| `slug` | string | `similac` |
| `description` | string | `Brand story...` |
| `status` | enum | `active` |
| `inHomePage` | boolean | `true` |
| `metaTitle` | string | optional |
| `metaDescription` | string | optional |
| `metaKeywords` | JSON string array | `["similac","baby"]` |
| `brandHighlights` | JSON string array / `null` | see existing secondary-media MD |
| `showBanner` | boolean | `true` / `false` |
| `showVideo` | boolean | `true` / `false` |
| `showFeaturedBanner` | boolean | `true` / `false` |
| `showPromotionalBanner` | boolean | `true` / `false` |
| `showSecondaryBanner` | boolean | `true` / `false` |
| `showSecondaryVideo` | boolean | `true` / `false` |
| `showOfferBanner` | boolean | `true` / `false` |
| `showBrandHighlights` | boolean | `true` / `false` |
| `showDescription` | boolean | `true` / `false` |

### Multipart file fields

| Field | Folder |
|------|--------|
| `logo` | `logos` |
| `banner` | `banners` |
| `video` | `videos` |
| `featuredBanner` | `banners` |
| `promotionalBanner` | `banners` |
| `secondaryBanner` | `banners` |
| `secondaryVideo` | `videos` |
| `offerBanner` | `banners` |
| `faqBanner` | `banners` |

---

## Example create

```bash
curl --location 'https://beta.cureka.com/api/v1/master/brands' \
  --header 'Authorization: Bearer <ADMIN_TOKEN>' \
  --form 'name="Similac"' \
  --form 'slug="similac"' \
  --form 'showBanner="true"' \
  --form 'showVideo="false"' \
  --form 'showFeaturedBanner="true"' \
  --form 'showPromotionalBanner="false"' \
  --form 'showSecondaryBanner="true"' \
  --form 'showSecondaryVideo="true"' \
  --form 'showOfferBanner="true"' \
  --form 'showBrandHighlights="true"' \
  --form 'showDescription="true"' \
  --form 'banner=@"/path/to/banner.jpg"' \
  --form 'secondaryBanner=@"/path/to/secondary-banner.jpg"' \
  --form 'offerBanner=@"/path/to/offer-banner.jpg"'
```

---

## Example update

```bash
curl --location --request PATCH 'https://beta.cureka.com/api/v1/master/brands/BRA2026XXXX' \
  --header 'Authorization: Bearer <ADMIN_TOKEN>' \
  --form 'showBanner="false"' \
  --form 'showPromotionalBanner="true"' \
  --form 'showDescription="false"'
```

Omit a flag on update to keep the existing value unchanged.

---

## Admin response

Admin GET/list/create/update responses now include the flags.

```json
{
  "id": "uuid",
  "refId": "BRA2026XXXX",
  "name": "Similac",
  "slug": "similac",
  "logo": { "key": "logos/a.webp", "name": "bucket", "url": "https://..." },
  "banner": { "key": "banners/a.webp", "name": "bucket", "url": "https://..." },
  "showBanner": true,
  "video": null,
  "showVideo": false,
  "featuredBanner": null,
  "showFeaturedBanner": true,
  "promotionalBanner": null,
  "showPromotionalBanner": false,
  "secondaryBanner": { "key": "banners/b.webp", "name": "bucket", "url": "https://..." },
  "showSecondaryBanner": true,
  "secondaryVideo": null,
  "showSecondaryVideo": true,
  "offerBanner": { "key": "banners/c.webp", "name": "bucket", "url": "https://..." },
  "showOfferBanner": true,
  "brandHighlights": [],
  "showBrandHighlights": true,
  "description": "Brand story...",
  "showDescription": true,
  "status": "active",
  "inHomePage": false,
  "metaTitle": null,
  "metaDescription": null,
  "metaKeywords": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

Admin should:
- save and edit the visibility booleans
- show the stored media/content even when a flag is `false`
- use the flags only as storefront visibility controls
