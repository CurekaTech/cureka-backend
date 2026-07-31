# CMS Pages — Frontend Cursor Agent Brief

Implement the **Admin Panel** edit screens for CMS **Pages**. Backend APIs already exist — **reuse them**.

---

## Goal

Under the existing **CMS** sidebar, **Pages** is a nested section with one menu item per policy page (no list page, **no Add button**).

| Sidebar label | Slug | Admin route |
|---------------|------|-------------|
| About Cureka | `about-cureka` | `/cms/pages/about-cureka` |
| Privacy Policy | `privacy-policy` | `/cms/pages/privacy-policy` |
| Terms & Conditions | `terms-and-conditions` | `/cms/pages/terms-and-conditions` |
| Returns & Refunds | `returns-refunds` | `/cms/pages/returns-refunds` |
| Shipping Policy | `shipping-policy` | `/cms/pages/shipping-policy` |

---

## Admin sidebar

```
CMS
 └── Pages
      ├── About Cureka
      ├── Privacy Policy
      ├── Terms & Conditions
      ├── Returns & Refunds
      └── Shipping Policy
```

- Menu comes from the admin menu API (`cms-pages` parent + child keys).
- Do **not** create a top-level menu.
- Do **not** show an Add / Create button.
- Do **not** build a pages listing table unless you need it for something else — primary UX is sidebar → edit that page.

---

## Auth

- Admin JWT.
- Permission: `cms_pages.read` to open; `cms_pages.update` to save.
- Roles: Admin / Super Admin.

---

## Admin APIs (base `/api/v1`)

| Method | Path | Use |
|--------|------|-----|
| `GET` | `/master/cms-pages/by-slug/:slug` | Load page for edit (preferred for sidebar routes) |
| `PATCH` | `/master/cms-pages/:refId` | Save title, content, meta, status |
| `PATCH` | `/master/cms-pages/:refId/status` | Status only |

Optional (not needed for this UX):

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/master/cms-pages` | List — skip for sidebar-only UX |
| `GET` | `/master/cms-pages/:refId` | Load by refId |
| `POST` / `DELETE` | … | **Do not expose Add/Delete in UI** for these policy pages |

### Load by slug

```http
GET /api/v1/master/cms-pages/by-slug/privacy-policy
```

Response `data` includes `refId`, `title`, `slug`, `content`, `metaTitle`, `metaDescription`, `status`, `isPredefined`, `updatedAt`, …

### Save

```http
PATCH /api/v1/master/cms-pages/{refId}
```

```json
{
  "title": "Privacy Policy",
  "content": "<p>HTML from rich text editor</p>",
  "metaTitle": "Privacy Policy | Cureka",
  "metaDescription": "…",
  "status": "active"
}
```

- Slug is **read-only** (`isPredefined: true`).
- Title and content required (non-empty).
- Toast on success/error; loading while fetch/save.

---

## Edit page UI (one screen, reused for all 5)

Route: `/cms/pages/:slug`  
On mount: `GET /master/cms-pages/by-slug/:slug` then bind form.

| Field | Behaviour |
|-------|-----------|
| Page Title | Editable, required |
| Slug | Read-only |
| Rich text | Editable HTML → `content` (reuse existing admin editor) |
| Meta Title | Optional |
| Meta Description | Optional |
| Status | Active / Inactive |
| Save | `PATCH` with `refId` from load response |

No Delete. No Add.

---

## Storefront / mobile

### Preferred — all pages in one call (homepage controller)

```http
GET /api/v1/public/homepage/cms-pages
```

Auth: none.

Returns every predefined CMS page under a **stable key**. Use this for footer / legal links so the UI does not need five separate requests.

| Key | Slug | Sidebar label |
|-----|------|---------------|
| `aboutCureka` | `about-cureka` | About Cureka |
| `privacyPolicy` | `privacy-policy` | Privacy Policy |
| `termsAndConditions` | `terms-and-conditions` | Terms & Conditions |
| `returnsRefunds` | `returns-refunds` | Returns & Refunds |
| `shippingPolicy` | `shipping-policy` | Shipping Policy |

Example `data`:

```json
{
  "aboutCureka": {
    "title": "About Cureka",
    "slug": "about-cureka",
    "content": "<p>…</p>",
    "metaTitle": "About Cureka",
    "metaDescription": null,
    "status": "active"
  },
  "privacyPolicy": { "title": "Privacy Policy", "slug": "privacy-policy", "content": "…", "metaTitle": "Privacy Policy", "metaDescription": null, "status": "active" },
  "termsAndConditions": { "…": "…" },
  "returnsRefunds": { "…": "…" },
  "shippingPolicy": { "…": "…" }
}
```

- Keys are **always present**.
- If a page is inactive or missing, that key is `null` — hide the footer link.
- `content` is HTML — sanitize before `dangerouslySetInnerHTML`.
- Use `metaTitle` / `metaDescription` on the dedicated page route for SEO.

Footer example:

```ts
const pages = await api.get('/public/homepage/cms-pages');
// pages.privacyPolicy?.slug → "/privacy-policy"
```

### Single page by slug (existing)

```http
GET /api/v1/cms/:slug
```

Examples: `/cms/about-cureka`, `/cms/privacy-policy`, `/cms/terms-and-conditions`, `/cms/returns-refunds`, `/cms/shipping-policy`.

Returns one active page: `title`, `slug`, `content`, `metaTitle`, `metaDescription`, `status`.  
Inactive / missing → **404**. Use this for the full page view after the user clicks a footer link.

---

## UX checklist

- [ ] CMS → Pages expands to the five page links
- [ ] Each link opens the edit form for that slug
- [ ] No Add button, no delete for these pages
- [ ] Slug locked
- [ ] Loading + toasts
- [ ] Matches existing CMS admin styling
- [ ] Storefront footer loads `GET /public/homepage/cms-pages` and links via the keys above
- [ ] Full page route uses `GET /cms/:slug` (or the matching key’s `slug`)

---

## Smoke test

1. Sidebar shows CMS → Pages → five items.
2. Open Terms & Conditions → form loads.
3. Edit content + meta → Save → reload OK.
4. Public `GET /api/v1/public/homepage/cms-pages` includes updated `termsAndConditions.content`.
5. Public `GET /api/v1/cms/terms-and-conditions` shows updated HTML.
6. Set inactive → homepage key is `null` and `/cms/:slug` returns 404; set active again → OK.
