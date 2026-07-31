# Homepage View-all APIs — Frontend Integration

Frontend handoff for **new** paginated “View all” endpoints under `/public/homepage`.

Use these from each homepage section’s **View all** button. Homepage section previews (limited strips) stay on `/public/homepage/sections` (and the existing health-concerns strip API).

**Base URL:** `/api/v1`  
**Auth:** none (public)

---

## Summary

| Homepage section | View all endpoint |
|------------------|-------------------|
| Brands We Trust | `GET /public/homepage/brands` |
| Shop by Wellness Goals | `GET /public/homepage/wellness-goals` |
| Health concerns / Expert-Curated | `GET /public/homepage/health-concerns/view-all` |

All return **every active** item (not only `inHomePage`), with pagination.

Related (already documented elsewhere):

| Topic | Doc |
|-------|-----|
| Free delivery + product-list `bestSeller` flag | [frontend-free-delivery-and-bestseller-flag.md](./frontend-free-delivery-and-bestseller-flag.md) |
| CMS pages footer keys | [frontend-cms-static-pages.md](./frontend-cms-static-pages.md) |
| Best sellers view-all products | `GET /public/homepage/best-sellers` (existing) |

---

## Shared query params

| Param | Type | Default | Notes |
|-------|------|---------|--------|
| `page` | number | `1` | |
| `limit` | number | `20` | Max `100` |
| `search` | string | — | Name / slug / refId where applicable |
| `sortBy` | string | `name` | See per-endpoint |
| `sortOrder` | `ASC` \| `DESC` | `ASC` | |

### Paginated envelope

```json
{
  "data": [],
  "total": 40,
  "page": 1,
  "limit": 20,
  "totalPages": 2,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

Images (`logo`, `image`, `icon`, `banner`) include a signed `url` when available — prefer that field in the UI.

---

## 1. Brands — View all

```http
GET /api/v1/public/homepage/brands?page=1&limit=20&search=
```

**Wire from:** Brands We Trust → **View all**

Returns all **active** brands (not only `inHomePage`).

`sortBy`: `name` | `slug` | `createdAt`

```json
{
  "data": [
    {
      "refId": "BRA20261234",
      "name": "Himalaya",
      "slug": "himalaya",
      "logo": { "key": "…", "name": "…", "url": "https://…" }
    }
  ],
  "total": 40,
  "page": 1,
  "limit": 20,
  "totalPages": 2,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

Card tap → products filtered by `brandSlug` / `brandRefId`.

---

## 2. Wellness goals — View all

```http
GET /api/v1/public/homepage/wellness-goals?page=1&limit=20
```

**Wire from:** Shop by Wellness Goals → **View all**

Returns all **active** wellness goals.

`sortBy`: `name` | `createdAt`

```json
{
  "data": [
    {
      "refId": "WEL20260001",
      "name": "Immunity",
      "description": "…",
      "image": { "key": "…", "name": "…", "url": "https://…" }
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

Card tap → products filtered by `wellnessGoalRefId`.

---

## 3. Health concerns — View all

```http
GET /api/v1/public/homepage/health-concerns/view-all?page=1&limit=20
```

**Wire from:** health-concerns / Expert-Curated section → **View all**

Returns all **active** health concerns (not only `inHomePage`).

`sortBy`: `name` | `slug` | `sortIndex` | `createdAt`

```json
{
  "data": [
    {
      "refId": "HLT20260001",
      "name": "Immunity",
      "slug": "immunity",
      "description": "…",
      "icon": { "key": "…", "name": "…", "url": "https://…" },
      "banner": { "key": "…", "name": "…", "url": "https://…" },
      "sortIndex": 1
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 20
}
```

Card tap → products filtered by `healthConcernSlug` / `healthConcernRefId`.

### Do not confuse with the homepage strip

```http
GET /api/v1/public/homepage/health-concerns
```

That endpoint is **unchanged**: non-paginated list of `inHomePage = true` concerns, ordered by `sortIndex`, with icon + banner. Use it for the homepage strip only — **not** for View all.

---

## UI checklist

- [ ] Brands We Trust → View all → `GET /public/homepage/brands` with infinite scroll or page controls
- [ ] Shop by Wellness Goals → View all → `GET /public/homepage/wellness-goals`
- [ ] Health concerns / Expert-Curated → View all → `GET /public/homepage/health-concerns/view-all`
- [ ] Support `search` on listing screens if the design has a search box
- [ ] Prefer signed `url` on media fields
- [ ] Keep using `/public/homepage/health-concerns` (no `/view-all`) for the homepage ordered strip

---

## Smoke test

1. Homepage Brands We Trust shows a short list; View all loads page 1 of `/brands` with `total` > strip count.
2. Page 2 / higher `limit` returns more brands; `hasNextPage` flips correctly.
3. Same for wellness goals and health-concerns view-all.
4. Homepage strip `GET /health-concerns` still returns the full `inHomePage` array (no pagination envelope).
