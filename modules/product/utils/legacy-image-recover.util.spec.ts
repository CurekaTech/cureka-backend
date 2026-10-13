import type { HarvestMapRow, VariantMatchCandidate } from './legacy-image-reconcile.util';
import {
  applyOrphanMapUpdate,
  classifyOrphanResult,
  findMapKeysForPair,
  groupLegacyRows,
  lookupLegacyPair,
  splitUrlsByCache,
  upsertPairMapRow,
  variantNeedsImageRecovery,
  variantRecoverIdentity,
} from './legacy-image-recover.util';

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

const sheet = (
  rows: Array<{ productId: string; sku: string; imageUrls: string[] }>,
) => groupLegacyRows(rows);

describe('legacy-image-recover.util', () => {
  it('matches SKU and product ID together', () => {
    const lookup = lookupLegacyPair(
      sheet([{ productId: '12345', sku: 'HER/ZIN/08945', imageUrls: ['https://a.jpg'] }]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('match');
    if (lookup.status === 'match') expect(lookup.imageUrls).toEqual(['https://a.jpg']);
  });

  it('rejects a SKU match when the product ID differs', () => {
    const lookup = lookupLegacyPair(
      sheet([{ productId: '99999', sku: 'HER/ZIN/08945', imageUrls: ['https://a.jpg'] }]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('sku_mismatch');
  });

  it('rejects a product ID match when the SKU differs', () => {
    const lookup = lookupLegacyPair(
      sheet([{ productId: '12345', sku: 'HER/ZIN/99999', imageUrls: ['https://a.jpg'] }]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('product_id_mismatch');
  });

  it('reports no match when both SKU and product ID differ', () => {
    const lookup = lookupLegacyPair(
      sheet([{ productId: '99999', sku: 'OTHER', imageUrls: ['https://a.jpg'] }]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('none');
  });

  it('treats identical duplicate rows as one record', () => {
    const lookup = lookupLegacyPair(
      sheet([
        { productId: '12345', sku: 'HER/ZIN/08945', imageUrls: ['https://a.jpg', 'https://b.jpg'] },
        { productId: '12345.0', sku: ' HER/ZIN/08945 ', imageUrls: ['https://a.jpg', 'https://b.jpg'] },
      ]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('match');
  });

  it('conflicts when the same SKU and product ID list different images', () => {
    const lookup = lookupLegacyPair(
      sheet([
        { productId: '12345', sku: 'HER/ZIN/08945', imageUrls: ['https://a.jpg'] },
        { productId: '12345', sku: 'HER/ZIN/08945', imageUrls: ['https://b.jpg'] },
      ]),
      'HER/ZIN/08945',
      '12345',
    );
    expect(lookup.status).toBe('conflict');
  });

  it('does not attach new keys to a SKU-only map row', () => {
    const rows: HarvestMapRow[] = [{ productId: '', sku: 'ABC', keys: ['images/sku-only.jpg'] }];
    expect(upsertPairMapRow(rows, { sku: 'ABC', productId: '200', keys: ['images/both.jpg'] })).toEqual([
      { productId: '', sku: 'ABC', keys: ['images/sku-only.jpg'] },
      { productId: '200', sku: 'ABC', keys: ['images/both.jpg'] },
    ]);
  });

  it('reuses a map row only when SKU and product ID both match', () => {
    const rows: HarvestMapRow[] = [
      { productId: '100', sku: 'ABC', keys: ['images/abc-100.jpg'] },
      { productId: '200', sku: 'ABC', keys: ['images/abc-200.jpg'] },
    ];
    expect(findMapKeysForPair(rows, 'ABC', '200')).toEqual({
      status: 'keys',
      keys: ['images/abc-200.jpg'],
    });
    expect(findMapKeysForPair(rows, 'ABC', '300').status).toBe('none');
    expect(findMapKeysForPair(rows, 'OTHER', '100').status).toBe('none');
  });

  it('falls through to legacy URLs when the cached key is invalid', () => {
    const cache = new Map([['https://legacy.cureka.com/a.jpg', 'images/bad.jpg']]);
    const split = splitUrlsByCache(
      ['https://legacy.cureka.com/a.jpg', 'https://legacy.cureka.com/b.jpg'],
      cache,
      new Set(['images/bad.jpg']),
    );
    expect(split.reuse).toEqual([]);
    expect(split.download).toEqual([
      'https://legacy.cureka.com/a.jpg',
      'https://legacy.cureka.com/b.jpg',
    ]);
  });

  it('keeps multiple legacy images in order and does not download a stored key again', () => {
    const cache = new Map([
      ['https://legacy.cureka.com/a.jpg', 'images/a.jpg'],
      ['https://legacy.cureka.com/b.jpg', 'images/b.jpg'],
    ]);
    const first = splitUrlsByCache(['https://a.jpg', 'https://b.jpg'], new Map());
    expect(first.download).toEqual(['https://a.jpg', 'https://b.jpg']);
    const second = splitUrlsByCache(
      ['https://legacy.cureka.com/a.jpg', 'https://legacy.cureka.com/b.jpg'],
      cache,
    );
    expect(second.download).toEqual([]);
    expect(second.reuse.map((item) => item.key)).toEqual(['images/a.jpg', 'images/b.jpg']);
  });

  it('uses the parent product ID only when the variant ID is empty', () => {
    expect(
      variantRecoverIdentity(variant({ id: 'v1', sku: 'SIM/1', productExternalProductId: '55' })),
    ).toEqual({ sku: 'SIM/1', productId: '55' });
    expect(
      variantRecoverIdentity(
        variant({ id: 'v1', sku: 'SIM/1', externalProductId: '99', productExternalProductId: '55' }),
      ),
    ).toEqual({ sku: 'SIM/1', productId: '99' });
  });

  it('skips a variant that already has a valid image', () => {
    expect(variantNeedsImageRecovery([])).toBe(true);
    expect(variantNeedsImageRecovery([{ key: '', valid: false }])).toBe(true);
    expect(variantNeedsImageRecovery([{ key: 'images/old.jpg', valid: false }])).toBe(true);
    expect(
      variantNeedsImageRecovery([
        { key: 'images/old.jpg', valid: false },
        { key: 'images/ok.jpg', valid: true },
      ]),
    ).toBe(false);
  });

  it('stores an orphan pair with both keys and does not invent a database action', () => {
    const stored = upsertPairMapRow([], {
      sku: 'ABC/XYZ/123',
      productId: '12345',
      keys: ['images/one.jpg', 'images/two.jpg'],
    });
    expect(stored).toEqual([
      { productId: '12345', sku: 'ABC/XYZ/123', keys: ['images/one.jpg', 'images/two.jpg'] },
    ]);
    expect(classifyOrphanResult({
      imageUrls: ['https://a.jpg'],
      downloaded: 1,
      failed: 0,
      reused: 0,
      deferred: 0,
    })).toBe('NOT_IN_DB_BACKUP_CREATED');
  });

  it('leaves the existing map row unchanged when the orphan legacy rows conflict', () => {
    const existing: HarvestMapRow[] = [
      { productId: '12345', sku: 'ABC', keys: ['images/kept.jpg'] },
    ];
    const grouped = sheet([
      { productId: '12345', sku: 'ABC', imageUrls: ['https://a.jpg'] },
      { productId: '12345', sku: 'ABC', imageUrls: ['https://b.jpg'] },
    ]);
    const pair = grouped.byPair.get('ABC\u000012345');
    expect(pair?.status).toBe('conflict');
    if (!pair) return;
    expect(applyOrphanMapUpdate(existing, pair, ['images/new.jpg'])).toEqual(existing);
  });

  it('classifies a second pass with a stored key as reuse and not a new download', () => {
    expect(classifyOrphanResult({
      imageUrls: ['https://a.jpg'],
      downloaded: 0,
      failed: 0,
      reused: 1,
      deferred: 0,
    })).toBe('NOT_IN_DB_BACKUP_REUSED');
    expect(classifyOrphanResult({
      imageUrls: [],
      downloaded: 0,
      failed: 0,
      reused: 0,
      deferred: 0,
    })).toBe('NOT_IN_DB_NO_VALID_IMAGE');
    expect(classifyOrphanResult({
      imageUrls: ['https://a.jpg'],
      downloaded: 0,
      failed: 1,
      reused: 0,
      deferred: 0,
    })).toBe('NOT_IN_DB_BACKUP_FAILED');
  });
});
