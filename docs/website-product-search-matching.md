# Website Product Search Matching

Product search now normalizes case and repeated whitespace, then matches either the full query or any query term of at least four characters. The full phrase and all-term matches rank ahead of partial-word matches. Existing availability ranking, explicit sort choices, pincode filters, product visibility, and pagination remain in effect.

The shared search planner binds all query values and escapes SQL `LIKE` wildcards. PostgreSQL searches product/variant names, slugs, SKU, brand, category, and variant attributes. Typesense continues to query its existing searchable fields, adds per-term prefix searches, and uses `searchText` with infix search for four-character substring matches.

## PostgreSQL Deployment

Migration `1786010000000-add-product-search-trigram-indexes` adds guarded GIN `pg_trgm` indexes to the product, variant, brand, category, and variant-attribute text columns used by substring matching. The `pg_trgm` extension is already enabled by `1785994000000-enable-pg-trgm`.

Run pending migrations through the normal deployment workflow. No product data is rewritten.

## Typesense Deployment

The collection manager adds an optional infix-enabled `searchText` field to an existing collection. The product index mapper populates it with the product title, variant title, SKU, slugs, brand/category names, tags, health/wellness names, and description.

After deploying the schema and mapper changes, reindex the existing product catalog so old documents receive `searchText`. Until reindex completes, the service still uses the existing full-query and per-term Typesense searches, plus the PostgreSQL fallback.

```bash
npm run typesense:reindex
```

No public endpoint, query parameter, or response shape changes.
