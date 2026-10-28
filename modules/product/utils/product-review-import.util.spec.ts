import { createHash } from 'crypto';
import {
  assertReviewImportWriteAllowed,
  buildReviewImportKey,
  classifyImportInsert,
  describeDatabaseTarget,
  prepareReviewImportRow,
} from './product-review-import.util';

const match = {
  id: 'variant-1',
  sku: 'SKU-1',
  productId: 'product-1',
  productRefId: 'PR1',
};

describe('product review import', () => {
  it('maps sheet columns and stores empty title, text, age, and location as null', () => {
    const prepared = prepareReviewImportRow({
      sku: ' SKU-1 ',
      customerName: ' Asha ',
      age: ' ',
      location: '',
      rating: '5',
      title: ' ',
      text: '',
      matches: [match],
    });

    expect(prepared.status).toBe('ready');
    if (prepared.status !== 'ready') return;
    expect(prepared.row).toEqual(
      expect.objectContaining({
        sku: 'SKU-1',
        customerName: 'Asha',
        rating: 5,
        title: null,
        description: null,
        customerAge: null,
        customerLocation: null,
        variantId: 'variant-1',
        productId: 'product-1',
      }),
    );
    expect(prepared.row.importKey).toHaveLength(64);
  });

  it('skips an unmatched SKU and an invalid rating', () => {
    expect(
      prepareReviewImportRow({
        sku: 'MISSING',
        customerName: 'Asha',
        age: '32',
        location: 'Ahmedabad',
        rating: 5,
        title: 'Good',
        text: 'Helpful',
        matches: [],
      }),
    ).toEqual({ status: 'skipped', reason: 'unmatched_sku' });

    expect(
      prepareReviewImportRow({
        sku: 'SKU-1',
        customerName: 'Asha',
        age: '',
        location: '',
        rating: 4.5,
        title: 'Good',
        text: 'Helpful',
        matches: [match],
      }),
    ).toEqual({ status: 'skipped', reason: 'invalid_rating' });
  });

  it('counts a duplicate import_key as skipped and changes the key when the SKU changes', () => {
    const first = buildReviewImportKey({
      sku: 'SKU-1',
      customerName: 'Asha',
      rating: 5,
      title: 'Good',
      description: 'Helpful',
    });
    const sameNameOnly = buildReviewImportKey({
      sku: 'SKU-1',
      customerName: 'Asha',
      rating: 4,
      title: 'Other',
      description: 'Different',
    });
    const renamedSku = buildReviewImportKey({
      sku: 'SKU-2',
      customerName: 'Asha',
      rating: 5,
      title: 'Good',
      description: 'Helpful',
    });

    expect(first).not.toBe(sameNameOnly);
    expect(first).not.toBe(renamedSku);
    expect(first).toBe(
      createHash('sha256')
        .update(['sku-1', 'asha', '5', 'good', 'helpful'].join('\u001f'))
        .digest('hex'),
    );
    expect(classifyImportInsert(null)).toBe('duplicate');
    expect(classifyImportInsert('row-id')).toBe('created');
  });

  it('refuses a live write when REVIEW_IMPORT_LIVE_DATABASE does not match', () => {
    const target = describeDatabaseTarget('postgres://user:secret@db.internal:5432/cureka_live');
    expect(target).toEqual({ host: 'db.internal', database: 'cureka_live' });
    expect(JSON.stringify(target)).not.toContain('secret');

    expect(() =>
      assertReviewImportWriteAllowed({
        mode: 'live',
        apply: true,
        confirmLive: true,
        databaseName: target.database,
        liveDatabaseName: 'cureka_staging',
      }),
    ).toThrow(/REVIEW_IMPORT_LIVE_DATABASE/);

    expect(() =>
      assertReviewImportWriteAllowed({
        mode: 'live',
        apply: true,
        confirmLive: false,
        databaseName: target.database,
        liveDatabaseName: target.database,
      }),
    ).toThrow(/confirm-live/);

    expect(() =>
      assertReviewImportWriteAllowed({
        mode: 'test',
        apply: true,
        confirmLive: false,
        databaseName: target.database,
        liveDatabaseName: target.database,
      }),
    ).toThrow(/live database/);
  });
});
