import {
  classifyLegacyMatches,
  decideCachedImageReuse,
  findHarvestedGcsKey,
  mergeHarvestedImageRows,
  matchMissingToLegacy,
  indexIdentities,
  parseLegacyImageList,
  rememberHarvestCacheKey,
  resolveHarvestedImageKeys,
  type VariantMatchCandidate,
  validateBackedUpImageBuffer,
} from './legacy-image-reconcile.util';

const variant = (
  overrides: Partial<VariantMatchCandidate> & Pick<VariantMatchCandidate, 'id' | 'sku'>,
): VariantMatchCandidate => ({
  externalProductId: null,
  productExternalProductId: null,
  productId: 'product-1',
  productRefId: 'pref',
  productSlug: 'slug',
  ...overrides,
});

describe('legacy-image-reconcile.util', () => {
  it('parses comma-separated URLs, trims, and keeps the first occurrence', () => {
    expect(parseLegacyImageList(' https://a.jpg, ,https://b.jpg, https://a.jpg ')).toEqual([
      'https://a.jpg',
      'https://b.jpg',
    ]);
  });

  it('matches SKU and Product ID on the same variant', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '123', sku: 'HER/ZIN/08945' }],
      [variant({ id: 'v1', sku: 'HER/ZIN/08945', externalProductId: '123' })],
    );
    expect(result?.kind).toBe('sku_and_product_id');
    expect(result?.updateAllowed).toBe(true);
    expect(result?.variant?.id).toBe('v1');
  });

  it('uses the parent Product ID for a simple product whose variant Product ID is empty', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '55', sku: 'SIM/1' }],
      [variant({ id: 'v1', sku: 'SIM/1', externalProductId: '', productExternalProductId: '55' })],
    );
    expect(result?.kind).toBe('sku_and_product_id');
    expect(result?.updateAllowed).toBe(true);
  });

  it('does not use the parent Product ID when the variant Product ID is set', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '55', sku: 'SIM/1' }],
      [
        variant({
          id: 'v1',
          sku: 'SIM/1',
          externalProductId: '99',
          productExternalProductId: '55',
        }),
      ],
    );
    expect(result?.kind).toBe('sku_match_product_id_mismatch');
    expect(result?.updateAllowed).toBe(false);
  });

  it('allows a SKU-only match and a Product ID-only match', () => {
    const results = classifyLegacyMatches(
      [
        { productId: '', sku: 'SKU-1' },
        { productId: '7', sku: '' },
      ],
      [
        variant({ id: 'v1', sku: 'SKU-1' }),
        variant({ id: 'v2', sku: 'OTHER', externalProductId: '7' }),
      ],
    );
    expect(results.map((result) => result.kind)).toEqual(['sku_only', 'product_id_only']);
    expect(results.every((result) => result.updateAllowed)).toBe(true);
  });

  it('reports SKU and Product ID pointing at different variants', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '2', sku: 'AAA' }],
      [
        variant({ id: 'v1', sku: 'AAA', externalProductId: '1' }),
        variant({ id: 'v2', sku: 'BBB', externalProductId: '2' }),
      ],
    );
    expect(result?.kind).toBe('sku_match_product_id_mismatch');
    expect(result?.updateAllowed).toBe(false);
  });

  it('reports Product ID match with a different SKU', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '2', sku: 'MISSING' }],
      [variant({ id: 'v2', sku: 'BBB', externalProductId: '2' })],
    );
    expect(result?.kind).toBe('product_id_match_sku_mismatch');
    expect(result?.updateAllowed).toBe(false);
  });

  it('does not update duplicate sheet SKUs, duplicate DB SKUs, or multiple rows for one variant', () => {
    const sheetDupes = classifyLegacyMatches(
      [
        { productId: '1', sku: 'DUP' },
        { productId: '2', sku: 'DUP' },
      ],
      [variant({ id: 'v1', sku: 'DUP', externalProductId: '1' })],
    );
    expect(sheetDupes.every((result) => result.kind === 'duplicate_sku' && !result.updateAllowed)).toBe(
      true,
    );

    const [dbDupe] = classifyLegacyMatches(
      [{ productId: '', sku: 'SAME' }],
      [variant({ id: 'v1', sku: 'SAME' }), variant({ id: 'v2', sku: 'SAME' })],
    );
    expect(dbDupe?.kind).toBe('db_duplicate_sku');

    const multi = classifyLegacyMatches(
      [
        { productId: '', sku: 'A' },
        { productId: '1', sku: '' },
      ],
      [variant({ id: 'v1', sku: 'A', externalProductId: '1' })],
    );
    expect(multi.every((result) => result.kind === 'multiple_legacy_rows' && !result.updateAllowed)).toBe(
      true,
    );
  });

  it('reports identifiers that are not in the database', () => {
    const [result] = classifyLegacyMatches(
      [{ productId: '404', sku: 'NOPE' }],
      [variant({ id: 'v1', sku: 'OTHER', externalProductId: '1' })],
    );
    expect(result?.kind).toBe('not_in_db');
    expect(result?.reason).toBe('SKU and Product ID were not found');
  });

  it('matches a missing-images row to legacy data and reports conflicts', () => {
    const records = [
      { productId: '10', sku: 'A' },
      { productId: '11', sku: 'B' },
    ];
    const index = indexIdentities(records);
    expect(matchMissingToLegacy({ productId: '10', sku: 'A' }, records, index.bySku, index.byProductId).status).toBe(
      'found',
    );
    expect(matchMissingToLegacy({ productId: '99', sku: 'Z' }, records, index.bySku, index.byProductId)).toEqual({
      status: 'none',
      reason: 'No legacy image record found',
    });
    expect(matchMissingToLegacy({ productId: '11', sku: 'A' }, records, index.bySku, index.byProductId).status).toBe(
      'conflict',
    );
  });

  it('reuses a cached key only when the GCS object exists and validates', () => {
    expect(
      decideCachedImageReuse({ cachedKey: 'images/a.jpg', objectExists: true, validationOk: true }),
    ).toEqual({ action: 'reuse', key: 'images/a.jpg' });
    expect(
      decideCachedImageReuse({ cachedKey: 'images/a.jpg', objectExists: false, validationOk: false }),
    ).toEqual({ action: 'redownload', reason: 'GCS object missing' });
    expect(
      decideCachedImageReuse({ cachedKey: 'images/a.jpg', objectExists: true, validationOk: false }),
    ).toEqual({ action: 'redownload', reason: 'GCS object is empty or not a readable image' });
    expect(decideCachedImageReuse({ cachedKey: '', objectExists: false, validationOk: false }).action).toBe(
      'redownload',
    );
  });

  it('does not replace a non-empty gallery with an empty list and appends new keys in order', () => {
    const merged = mergeHarvestedImageRows(
      [{ productId: '1', sku: '', keys: ['images/a.jpg'] }],
      [{ productId: '1', sku: 'SKU-1', keys: [] }],
    );
    expect(merged).toEqual([{ productId: '1', sku: 'SKU-1', keys: ['images/a.jpg'] }]);

    const appended = mergeHarvestedImageRows(merged, [
      { productId: '1', sku: 'SKU-1', keys: ['images/b.jpg', 'images/a.jpg'] },
    ]);
    expect(appended[0]?.keys).toEqual(['images/a.jpg', 'images/b.jpg']);
  });

  it('drops an invalid key when a replacement exists and keeps the old list when it does not', () => {
    const replaced = mergeHarvestedImageRows(
      [{ productId: '1', sku: 'A', keys: ['images/bad.jpg'] }],
      [{ productId: '1', sku: 'A', keys: ['images/good.jpg'] }],
      new Set(['images/bad.jpg']),
    );
    expect(replaced[0]?.keys).toEqual(['images/good.jpg']);

    const kept = mergeHarvestedImageRows(
      [{ productId: '1', sku: 'A', keys: ['images/bad.jpg'] }],
      [{ productId: '1', sku: 'A', keys: [] }],
      new Set(['images/bad.jpg']),
    );
    expect(kept[0]?.keys).toEqual(['images/bad.jpg']);
  });

  it('keeps mappings for products that are not in the database', () => {
    const merged = mergeHarvestedImageRows(
      [],
      [{ productId: '999', sku: 'NEW/1', keys: ['images/new.jpg'] }],
    );
    expect(merged).toEqual([{ productId: '999', sku: 'NEW/1', keys: ['images/new.jpg'] }]);
  });

  it('resolves bulk-upload images by Product ID, then SKU, and skips conflicts', () => {
    const byProductId = new Map([['10', ['images/a.jpg']]]);
    const bySku = new Map([
      ['SKU-1', ['images/a.jpg']],
      ['SKU-2', ['images/b.jpg']],
    ]);
    expect(resolveHarvestedImageKeys('10', 'SKU-1', byProductId, bySku)).toEqual({
      keys: ['images/a.jpg'],
      conflict: false,
    });
    expect(resolveHarvestedImageKeys('', 'SKU-2', byProductId, bySku)).toEqual({
      keys: ['images/b.jpg'],
      conflict: false,
    });
    expect(resolveHarvestedImageKeys('10', 'SKU-2', byProductId, bySku)).toEqual({
      keys: [],
      conflict: true,
    });
  });

  it('rejects an empty or HTML body and accepts JPEG bytes', () => {
    expect(validateBackedUpImageBuffer(Buffer.alloc(0), 100).ok).toBe(false);
    expect(validateBackedUpImageBuffer(Buffer.from('<html><title>404</title></html>'), 100).ok).toBe(false);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(validateBackedUpImageBuffer(jpeg, 100)).toEqual({ ok: true, mime: 'image/jpeg' });
  });

  it('finds a harvested GCS key from either the live or legacy URL and does not require another download', () => {
    const cache = new Map<string, string>();
    rememberHarvestCacheKey(cache, 'https://www.cureka.com/wp-content/a.jpg', 'images/a.jpg');
    expect(findHarvestedGcsKey(cache, 'https://legacy.cureka.com/wp-content/a.jpg')).toBe('images/a.jpg');
    expect(findHarvestedGcsKey(cache, 'https://cdn.example.com/a.jpg')).toBeUndefined();
  });
});
