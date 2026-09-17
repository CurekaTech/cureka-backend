# Frontend image integration

The backend can now return **real resized WebP bytes**. Existing fields are unchanged. Downloaded bytes will not improve until the storefront uses `imageDelivery.variants` instead of full-size `storage.googleapis.com` originals (and continues to bypass Next.js `/_next/image` for these hosts unless that path is separately re-validated).

## Flags

`imageDelivery` is present only when `IMAGE_DELIVERY_ENABLED=true`. If the field is missing, keep current original-URL behavior.

## Shared contract

Every storage object the API already returned as `{ key, name, url }` may now also include `imageDelivery`. **`url` remains a string.** Never treat `url` as an object.

```json
{
  "key": "images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg",
  "name": "cureka-files-prod",
  "url": "https://storage.googleapis.com/cureka-files-prod/images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=86400&...",
  "imageDelivery": {
    "status": "ready",
    "original": {
      "url": "https://storage.googleapis.com/cureka-files-prod/images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256&...",
      "width": 1500,
      "height": 1500,
      "bytes": 420000,
      "format": "image/jpeg"
    },
    "variants": [
      {
        "url": "https://storage.googleapis.com/cureka-files-prod/derivatives/v1/<sha256>/w240.webp?X-Goog-Algorithm=GOOG4-RSA-SHA256&...",
        "width": 240,
        "height": 240,
        "format": "webp",
        "bytes": 18440
      },
      {
        "url": "https://storage.googleapis.com/cureka-files-prod/derivatives/v1/<sha256>/w800.webp?X-Goog-Algorithm=GOOG4-RSA-SHA256&...",
        "width": 800,
        "height": 800,
        "format": "webp",
        "bytes": 91200
      }
    ]
  }
}
```

Pending example (original still works):

```json
{
  "key": "banners/hero.jpg",
  "name": "cureka-files-prod",
  "url": "https://storage.googleapis.com/cureka-files-prod/banners/hero.jpg?...",
  "imageDelivery": {
    "status": "pending",
    "original": { "url": "https://storage.googleapis.com/cureka-files-prod/banners/hero.jpg?...", "width": null, "height": null },
    "variants": []
  }
}
```

`null` image fields stay `null`. Empty `variants` means use `url` / `imageDelivery.original.url`.

Statuses: `pending` | `partial` | `ready` | `failed` | `unsupported`. Only listed variants exist. Dimensions are actual output, not requested CSS sizes.

String fields such as order/cart `imageUrl` remain strings. Use sibling `primaryImageUrl.imageDelivery` for variants.

## Affected endpoints (prefix `/api/v1`)

Use the same helper everywhere a `{ key, name, url }` image appears.

| Endpoint | Fields |
|----------|--------|
| `GET /public/homepage/sections` | Hero/custom banners `imageUrl` / `mobileImageUrl`, product `primaryImageUrl`, brand logos, HC icons, blog `featuredImage`, watch-and-shop `mediaUrl`, expert-talk `thumbnail`, testimonial `image` |
| `GET /public/homepage/banners` | `imageUrl` |
| `GET /public/homepage/best-sellers` (and other homepage section routes) | Product card `primaryImageUrl` |
| `GET /public/products` listing/search/filters | `primaryImageUrl` |
| `GET /public/products/:slug` PDP | `media[].url`, variant `images[]`, `sizeChart`, manufacturer/packer/importer `logo`, PDP banners |
| `GET /public/products/you-may-also-like`, `frequently-bought-together`, `shop/*` | cards |
| `GET /public/bundles`, `GET /public/bundles/:slug` | `bundleIcon`, `primaryImageUrl`, nested media |
| `GET /public/masters?type=brand\|category` | logos/banners/images |
| `GET /public/watch-and-shop`, `GET /public/expert-talks` | media/thumbnails + nested product images |
| Cart / orders / wishlist | `primaryImageUrl` (+ string `imageUrl` unchanged) |

Admin gallery list still returns a string `url`; storefront does not use it.

## Variant selection

```ts
function pickVariant(delivery, cssPx: number, dpr = 2) {
  const target = Math.ceil(cssPx * dpr);
  const variants = delivery?.variants ?? [];
  const sorted = [...variants].sort((a, b) => a.width - b.width);
  return sorted.find((v) => v.width >= target) ?? sorted.at(-1) ?? null;
}

function srcSet(delivery): string {
  return (delivery?.variants ?? [])
    .map((v) => `${v.url} ${v.width}w`)
    .join(', ');
}
```

`sizes` examples:

- Card ~100–120 CSS px: `sizes="120px"` → browser picks ~240w at DPR 2
- Hero ~388 CSS px mobile: `sizes="(max-width: 768px) 100vw, 800px"` → ~800w at DPR 2, not 240
- PDP gallery: card-size thumbs + 800/1200 for stage; keep `original.url` for zoom/lightbox

Build `srcSet` only from `variants`. Fallback `src` = chosen variant URL or `image.url` / `imageDelivery.original.url`.

Preserve `alt` from existing product/banner fields. Set width/height from `original` or chosen variant to stop CLS. Do not stretch.

## Fallback

1. If `imageDelivery` missing or `variants` empty → existing `url`
2. If `status` is `failed` / `unsupported` / `pending` → original `url`
3. Single `onError`: swap to original `url` once; if that also fails, show placeholder. Do **not** loop variant→original→variant
4. Do not hot-link derivative keys without the signed query string

## Signed URLs

URLs expire (production target 24h). Homepage ISR 60s is not the signed TTL.

- Re-fetch the API (not a stale static JSON blob) when a GCS URL returns 403
- Do not persist signed URLs in localStorage
- Next.js `images.remotePatterns` must allow `storage.googleapis.com` **without** sending these through `/_next/image` until that optimizer is proven not to 504
- New hostname: none, unless DevOps later puts a CDN in front. Still `storage.googleapis.com` today

## Loading

Only the actual LCP image (typically the first homepage hero) should be `priority` / `fetchPriority="high"` / eager. All other images lazy-load. That is a frontend concern.

## Acceptance checks

- Mobile hero request is a ~800w (or similar) WebP, typically well under the original ~891 KiB, visually acceptable
- Listing cards request ~240w WebP, not 1254/1500 originals
- DevTools: no 5xx from an image optimizer proxy
- PDP zoom still has a full original
- `imageUrl` / `url` types still strings
- Signed URL still required; unauthenticated curl of the object path without query fails for private objects
