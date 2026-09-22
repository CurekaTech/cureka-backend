# Frontend image integration

The backend can now return **real resized WebP bytes** at stable `/api/v1/public/media/{key}` URLs. Existing field types are unchanged. Downloaded bytes will not improve until the storefront uses `imageDelivery.variants` (especially width 800 WebP for the homepage hero) instead of pending originals.

## Flags

`imageDelivery` is present only when `IMAGE_DELIVERY_ENABLED=true`. If the field is missing, keep current original-URL behavior.

## Shared contract

Every storage object the API already returned as `{ key, name, url }` may now also include `imageDelivery`. **`url` remains a string.** Never treat `url` as an object.

```json
{
  "key": "images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg",
  "name": "cureka-files-prod",
  "url": "https://www.cureka.com/api/v1/public/media/images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg",
  "imageDelivery": {
    "status": "ready",
    "original": {
      "url": "https://www.cureka.com/api/v1/public/media/images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg",
      "width": 1500,
      "height": 1500,
      "bytes": 420000,
      "format": "image/jpeg"
    },
    "variants": [
      {
        "url": "https://www.cureka.com/api/v1/public/media/derivatives/v1/<sha256>/w240.webp",
        "width": 240,
        "height": 240,
        "format": "webp",
        "bytes": 18440
      },
      {
        "url": "https://www.cureka.com/api/v1/public/media/derivatives/v1/<sha256>/w800.webp",
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
  "url": "https://www.cureka.com/api/v1/public/media/banners/hero.jpg",
  "imageDelivery": {
    "status": "pending",
    "original": { "url": "https://www.cureka.com/api/v1/public/media/banners/hero.jpg", "width": null, "height": null },
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
4. Do not hot-link GCS object keys. Use the `url` / `imageDelivery` values from the API (stable `/api/v1/public/media/{key}` for merchandising)

## Media URLs

Merchandising images (banners, products, logos, icons, gallery, derivatives) use **stable** storefront URLs:

`https://www.cureka.com/api/v1/public/media/{storageKey}`

The storefront route proxies to the API, which streams from the private GCS bucket with the service account. The bucket is **not** public. Avatars, return evidence, vendor documents, and support attachments still use short-lived signed GCS URLs.

`PUBLIC_MEDIA_STABLE_URLS=false` restores rotating signed URLs (not recommended: it fragments `/_next/image` cache).

- Do not persist image URLs in localStorage as a substitute for API JSON
- Next.js `images.remotePatterns` must allow the storefront origin (and still `storage.googleapis.com` for any remaining signed private files)
- Prefer serving merchandising variants **without** `/_next/image` once `imageDelivery.variants` is `ready` (bytes are already WebP at the right width)

## Loading

Only the actual LCP image (typically the first homepage hero) should be `priority` / `fetchPriority="high"` / eager. All other images lazy-load. That is a frontend concern.

## Acceptance checks

- Mobile hero request is a ~800w (or similar) WebP, typically well under the original ~891 KiB, visually acceptable
- Listing cards request ~240w WebP, not 1254/1500 originals
- DevTools: no 5xx from an image optimizer proxy
- PDP zoom still has a full original
- `imageUrl` / `url` types still strings
- Signed URL still required for **private** folders (avatars, return evidence, vendor documents); merchandising uses `/api/v1/public/media/{key}`
