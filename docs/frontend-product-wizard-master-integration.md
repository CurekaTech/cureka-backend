# Add / Update Product Form — Master Data Integration Guide

**Date:** 2026-07-06  
**Audience:** Admin UI developers  
**API:** Product wizard master bootstrap (cursor-paginated, type-based)

---

## 1. Overview

The Add Product and Update Product forms need many master lists (brand, category, wellness goal, etc.). Instead of calling 12 separate master CRUD list endpoints, use **one endpoint** and pass a `type` query param.

On a **single form page**, fire **one request per master type** when the page loads (in parallel). Each dropdown/combobox manages its own list state, search, and “load more” using cursor pagination.

**Endpoint:**

```
GET /api/v1/master/product-wizard/bootstrap
```

**Authentication:** Required — Bearer JWT (`SUPER_ADMIN` or `ADMIN`)

**Default behavior:** `status=active` when omitted (only active masters).

---

## 2. Quick reference — master types

| `type` value | Typical form field | Multi-select? |
|--------------|-------------------|---------------|
| `brand` | Brand | No |
| `category` | Category (see §6 for hierarchy) | Usually one leaf category |
| `health-concern` | Health concerns | Yes |
| `wellness-goal` | Wellness goals | Yes |
| `product-tag` | Product tags | Yes |
| `unit` | Unit of measure | No |
| `attribute` | Variant attributes | Yes (variable products) |
| `product-information-label` | Information labels | Yes |
| `manufacturer` | Manufacturer | No |
| `packer` | Packer | No |
| `importer` | Importer | No |
| `country` | Country of origin | No |

---

## 3. Request parameters

| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | **Yes** | — | Master list to load (see table above) |
| `status` | No | `active` | `active`, `inactive`, or `all` |
| `limit` | No | `20` | Page size (1–100) |
| `cursor` | No | — | Opaque token from previous `nextCursor` |
| `search` | No | — | Case-insensitive search (name, slug/code where applicable, **and `refId`**) |
| `sortBy` | No | Per-type default | See §5 |
| `sortOrder` | No | Per-type default | `ASC` or `DESC` |
| `categoryHierarchyLevel` | No | — | **Category only** — `0` root, `1` child, `2` grandchild, `3` great-grandchild |
| `parentCategoryRefId` | No | — | **Category only** — load children of this parent |

### Example — initial brand load

```http
GET /api/v1/master/product-wizard/bootstrap?type=brand&limit=30&sortBy=name&sortOrder=ASC
Authorization: Bearer <token>
```

### Example — search wellness goals

```http
GET /api/v1/master/product-wizard/bootstrap?type=wellness-goal&search=immunity&limit=20
```

### Example — next page

```http
GET /api/v1/master/product-wizard/bootstrap?type=brand&limit=30&cursor=eyJpZCI6Li4uLCJzb3J0VmFsdWUiOiIuLi4ifQ
```

> Keep `type`, `search`, `sortBy`, `sortOrder`, and category filters **the same** when passing `cursor`. Changing them between pages can skip or duplicate rows.

---

## 4. Response envelope

```json
{
  "success": true,
  "data": {
    "type": "brand",
    "data": [ /* items */ ],
    "nextCursor": "eyJpZCI6...",
    "hasMore": true,
    "limit": 30
  },
  "message": "Product wizard master data retrieved successfully",
  "timestamp": "2026-07-06T12:00:00.000Z"
}
```

### Pagination fields (`data` object)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Echo of requested `type` |
| `data` | array | Current page of master items |
| `nextCursor` | string \| null | Pass as `cursor` for the next page; `null` when done |
| `hasMore` | boolean | `true` if more rows exist |
| `limit` | number | Page size used |

### Cursor pagination (UI rules)

1. **First load:** omit `cursor`.
2. **Load more:** if `hasMore === true`, call again with `cursor = nextCursor`.
3. **Append** new items to the dropdown list (do not replace).
4. Treat `nextCursor` as an **opaque string** — do not decode or build it on the client.
5. **Search / sort change:** reset list, clear stored cursor, fetch from scratch.

---

## 5. Sorting and search per type

### Search

`search` matches **name** (all types), plus type-specific fields, and always **`refId`**:

| `type` | Additional search fields |
|--------|--------------------------|
| `brand` | `slug`, `refId` |
| `category` | `refId` |
| `health-concern` | `slug`, `refId` |
| `wellness-goal` | `refId` |
| `product-tag` | `refId` |
| `unit` | `refId` |
| `attribute` | `refId` |
| `product-information-label` | `refId` |
| `manufacturer` | `code`, `refId` |
| `packer` | `code`, `refId` |
| `importer` | `code`, `iec`, `refId` |
| `country` | `code`, `refId` |

Useful for Update form: `?search=BRD20241234` finds by refId quickly.

### Default sort

| `type` | Default `sortBy` | Default `sortOrder` | Allowed `sortBy` |
|--------|------------------|---------------------|------------------|
| `brand` | `name` | `ASC` | `name`, `slug`, `status`, `createdAt` |
| `category` | `position` | `ASC` | `position`, `hierarchyId`, `name`, `hierarchyLevel`, `status`, `createdAt` |
| `health-concern` | `name` | `ASC` | `name`, `slug`, `status`, `createdAt` |
| `wellness-goal` | `name` | `ASC` | `name`, `status`, `createdAt` |
| `product-tag` | `name` | `ASC` | `name`, `status`, `createdAt` |
| `unit` | `name` | `ASC` | `name`, `status`, `createdAt` |
| `attribute` | `name` | `ASC` | `name`, `status`, `createdAt` |
| `product-information-label` | `sortOrder` | `ASC` | `sortOrder`, `name`, `status`, `createdAt` |
| `manufacturer` | `name` | `ASC` | `name`, `code`, `status`, `createdAt` |
| `packer` | `name` | `ASC` | `name`, `code`, `status`, `createdAt` |
| `importer` | `name` | `ASC` | `name`, `code`, `iec`, `status`, `createdAt` |
| `country` | `name` | `ASC` | `name`, `code`, `status`, `createdAt` |

---

## 6. Category field (hierarchy)

Categories are hierarchical. The API returns each category **with** `parent` and `categoryFilters` (active filters only when `status=active`).

### Recommended UX — cascading selects

```
[ Root category ▼ ]  →  [ Sub-category ▼ ]  →  [ Leaf category ▼ ]
```

| Step | Request |
|------|---------|
| Roots | `type=category&categoryHierarchyLevel=0&limit=50` |
| Children of selected root | `type=category&parentCategoryRefId=<rootRefId>&limit=50` |
| Deeper levels | Same pattern with the newly selected parent `refId` |

`categoryHierarchyLevel` is optional but helps restrict a level when building fixed step UI.

### Category item shape (simplified)

```typescript
interface CategoryMaster {
  id: string;
  refId: string;           // use this in product save payload
  name: string;
  slug: string;
  hierarchyLevel: 0 | 1 | 2 | 3;
  parentCategoryRefId: string | null;
  position: number;
  parent: { refId: string; name: string; /* ... */ } | null;
  categoryFilters: Array<{
    refId: string;
    name: string;
    values: string[];
    status: 'active' | 'inactive';
  }>;
  image: { url: string } | null;
  banner: { url: string } | null;
}
```

Use `categoryFilters` on the selected category when rendering category-specific product filters on the form.

---

## 7. Single-page load strategy

All master types are on **one page**. Recommended approach:

### 7.1 Parallel initial fetch (page mount)

Fire all 12 requests in parallel with a sensible `limit` (e.g. `30` for dropdowns, `50` for tags/concerns if lists are long).

```typescript
const PRODUCT_FORM_MASTER_TYPES = [
  'brand',
  'category',
  'health-concern',
  'wellness-goal',
  'product-tag',
  'unit',
  'attribute',
  'product-information-label',
  'manufacturer',
  'packer',
  'importer',
  'country',
] as const;

async function loadAllMastersOnMount() {
  const results = await Promise.all(
    PRODUCT_FORM_MASTER_TYPES.map((type) =>
      api.get('/master/product-wizard/bootstrap', {
        params: { type, limit: 30, sortBy: type === 'product-information-label' ? 'sortOrder' : 'name', sortOrder: 'ASC' },
      }),
    ),
  );
  return Object.fromEntries(
    PRODUCT_FORM_MASTER_TYPES.map((type, i) => [type, results[i].data.data]),
  );
}
```

> For **category**, initial load is usually **roots only** (`categoryHierarchyLevel=0`), not the full tree.

### 7.2 Per-field state

Keep independent state per type:

```typescript
type MasterListState<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  search: string;
};
```

### 7.3 Searchable async select pattern

| Event | Action |
|-------|--------|
| User types in combobox | Debounce 300ms → `search=query`, reset items, fetch page 1 |
| Dropdown scroll to bottom | If `hasMore`, fetch with `cursor=nextCursor`, append |
| User clears search | Reset and refetch default first page |

### 7.4 Optional: lazy open

If the form is heavy, you may still defer fetch until the user **opens** a dropdown — but the API contract is the same. Parallel on mount is preferred when all fields are visible on one page.

---

## 8. Add Product vs Update Product

### Add Product

- Load all master lists on mount (§7).
- User selections store **`refId`** values (match your existing product create API).
- Empty lists are fine until the user searches.

### Update Product

The product detail API returns current selections (e.g. `brandRefId`, `categoryRefId`, arrays of concern refIds). Those values **may not appear** in the first paginated page.

**Handle pre-selected values:**

1. **Preferred:** Merge product detail labels into dropdown options:
   ```typescript
   const options = mergeByRefId(apiListItems, productDetail.currentBrand);
   ```
2. **Or** when opening a select, if the selected `refId` is missing from `items`, call:
   ```http
   GET .../bootstrap?type=brand&search=<refId>&limit=1
   ```
3. **Or** show the label from product detail as the selected chip/option even before the list loads.

Never rely on the user scrolling until the current value appears in the list.

---

## 9. TypeScript helpers

```typescript
type ProductWizardMasterType =
  | 'brand'
  | 'category'
  | 'health-concern'
  | 'wellness-goal'
  | 'product-tag'
  | 'unit'
  | 'attribute'
  | 'product-information-label'
  | 'manufacturer'
  | 'packer'
  | 'importer'
  | 'country';

interface WizardMasterPage<T> {
  type: ProductWizardMasterType;
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

interface BootstrapParams {
  type: ProductWizardMasterType;
  limit?: number;
  cursor?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  status?: 'active' | 'inactive' | 'all';
  categoryHierarchyLevel?: 0 | 1 | 2 | 3;
  parentCategoryRefId?: string;
}

async function fetchWizardMaster<T>(params: BootstrapParams): Promise<WizardMasterPage<T>> {
  const res = await api.get<{ data: WizardMasterPage<T> }>(
    '/master/product-wizard/bootstrap',
    { params },
  );
  return res.data.data;
}
```

### Reusable hook sketch

```typescript
function useWizardMaster<T>(type: ProductWizardMasterType, baseParams?: Partial<BootstrapParams>) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (opts: { search?: string; cursor?: string; reset?: boolean } = {}) => {
    setLoading(true);
    try {
      const page = await fetchWizardMaster<T>({
        type,
        limit: 30,
        ...baseParams,
        search: opts.search,
        cursor: opts.cursor,
      });
      setItems((prev) => (opts.reset || !opts.cursor ? page.data : [...prev, ...page.data]));
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  };

  const search = (q: string) => load({ search: q || undefined, reset: true });
  const loadMore = () => nextCursor && hasMore && load({ cursor: nextCursor });
  const refresh = () => load({ reset: true });

  return { items, loading, hasMore, search, loadMore, refresh };
}
```

Use one hook instance per dropdown on the form, e.g.:

```typescript
const brand = useWizardMaster<Brand>('brand', { sortBy: 'name', sortOrder: 'ASC' });
const wellnessGoals = useWizardMaster<WellnessGoal>('wellness-goal');
const roots = useWizardMaster<Category>('category', { categoryHierarchyLevel: 0, limit: 50 });
```

Call `refresh()` in `useEffect` on mount for each field.

---

## 10. Item shapes (common fields)

All items include at least:

```typescript
{ id: string; refId: string; name: string; status: 'active' | 'inactive'; }
```

Types with media return resolved URLs on `logo`, `banner`, `image`, or `icon` (same storage reference shape as other admin APIs).

| `type` | Notable fields beyond `refId` / `name` |
|--------|----------------------------------------|
| `brand` | `slug`, `logo`, `banner` |
| `category` | `slug`, `hierarchyLevel`, `parent`, `categoryFilters`, `image`, `banner` |
| `health-concern` | `slug`, `icon`, `banner` |
| `wellness-goal` | `image`, `description` |
| `product-tag` | `slug` |
| `unit` | — |
| `attribute` | `dataType`, `values` (for variant options) |
| `product-information-label` | `sortOrder` |
| `manufacturer` | `code`, `logo` |
| `packer` | `code`, `logo` |
| `importer` | `code`, `iec`, `logo` |
| `country` | `code` |

---

## 11. Errors

| Status | Meaning |
|--------|---------|
| `400` | Invalid `type`, `sortBy`, `cursor`, or query validation |
| `401` | Missing or expired token |
| `403` | User is not `ADMIN` / `SUPER_ADMIN` |
| `404` | Invalid `parentCategoryRefId` (category children fetch) |

Validation errors use the standard API error envelope.

---

## 12. UI checklist

- [ ] On Add/Update form mount, load each master `type` (parallel) or on first dropdown open
- [ ] Store selections by **`refId`**, not internal `id`
- [ ] Implement debounced **search** per dropdown (`search` supports name + refId)
- [ ] Implement **load more** via `nextCursor` when list scrolls or user clicks “Load more”
- [ ] Reset cursor when search or sort changes
- [ ] Category: cascading loads with `parentCategoryRefId`
- [ ] Update form: ensure current values appear in options (merge from product detail or search by refId)
- [ ] Use `status=active` (default) unless admin needs inactive masters
- [ ] Show loading / empty states per field independently

---

## 13. Related APIs

| Endpoint | Use |
|----------|-----|
| `GET /api/v1/master/product-wizard/bootstrap` | **This guide** — all master lists for the product form |
| `POST /api/v1/products` | Create product (uses refIds from selections) |
| `PATCH /api/v1/products/:refId` | Update product |
| `GET /api/v1/products/:refId` | Load product for Update form prefill |

Do **not** use the public storefront listing API for admin master data.
