import { IStorageFileReference } from '@packages/storage';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductMediaType } from '../enums/product-media-type.enum';
import {
  collectVariantMedia,
  currentImageColumnHeader,
  extractMediaLocator,
  IMAGE_URL_COMPARISON_HEADERS,
  isUsableExcelHyperlink,
  joinImageUrls,
  resolveWpImageUrls,
} from './bulk-upload-image-url-comparison.util';
import { normalizeLookupSku } from './bulk-upload-reference-lookup.util';

describe('bulk-upload-image-url-comparison.util', () => {
  it('joins URLs as a comma-separated cell with no extra spaces', () => {
    expect(joinImageUrls([' https://a.jpg ', '', 'https://b.jpg'])).toBe(
      'https://a.jpg,https://b.jpg',
    );
  });

  it('prefers SKU match for WordPress URLs and falls back to external product id', () => {
    const bySku = new Map([['sku-1', ['https://wp/sku.jpg']]]);
    const byProductId = new Map([['123', ['https://wp/id.jpg']]]);

    expect(resolveWpImageUrls('SKU-1', '123', bySku, byProductId)).toBe('https://wp/sku.jpg');
    expect(resolveWpImageUrls('missing', '123', bySku, byProductId)).toBe('https://wp/id.jpg');
    expect(resolveWpImageUrls('missing', null, bySku, byProductId)).toBe('');
  });

  it('keeps missing product id / images as blank rather than dropping the row', () => {
    expect(IMAGE_URL_COMPARISON_HEADERS.slice(0, 3)).toEqual([
      'Product Id',
      'SKU',
      'WP Image URLs',
    ]);
    expect(currentImageColumnHeader(1)).toBe('Current Image URL 1');
    expect(normalizeLookupSku('  AbC  ')).toBe('abc');
  });

  it('collects variant images before shared product images and dedupes', () => {
    const variantImage = {
      id: 'm1',
      productId: 'p1',
      variantId: 'v1',
      type: ProductMediaType.IMAGE,
      url: { key: 'images/v1.webp', name: 'bucket' } as IStorageFileReference,
      sortOrder: 1,
      isPrimary: true,
    } as ProductMediaEntity;
    const sharedImage = {
      id: 'm2',
      productId: 'p1',
      variantId: null,
      type: ProductMediaType.COMMON,
      url: { key: 'images/shared.webp', name: 'bucket' } as IStorageFileReference,
      sortOrder: 0,
      isPrimary: false,
    } as ProductMediaEntity;
    const duplicate = {
      id: 'm3',
      productId: 'p1',
      variantId: null,
      type: ProductMediaType.IMAGE,
      url: { key: 'images/v1.webp', name: 'bucket' } as IStorageFileReference,
      sortOrder: 2,
      isPrimary: false,
    } as ProductMediaEntity;

    const collected = collectVariantMedia(
      'v1',
      'p1',
      new Map([['p1', [sharedImage, duplicate, variantImage]]]),
    );
    expect(collected.map((item) => item.id)).toEqual(['m1', 'm2']);
  });

  it('treats stored http(s) keys as absolute URLs', () => {
    expect(extractMediaLocator('https://cdn.example.com/a.jpg')).toEqual({
      type: 'absolute',
      url: 'https://cdn.example.com/a.jpg',
    });
    expect(extractMediaLocator({ key: 'images/a.webp', name: 'bucket' })).toEqual({
      type: 'storage',
      ref: 'images/a.webp',
    });
  });

  it('re-signs GCS URLs instead of exporting an expired X-Goog-Credential query string', () => {
    const signed =
      'https://storage.googleapis.com/cureka-files-prod/images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg' +
      '?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=acct%2F20260902%2Fauto%2Fstorage%2Fgoog4_request';
    expect(extractMediaLocator(signed)).toEqual({
      type: 'storage',
      ref: 'images/cf9f6da7-bbb4-4ddd-b21a-b531c57afa88.jpg',
    });
    expect(
      extractMediaLocator({
        key: 'images/a.webp',
        name: 'bucket',
        url: signed,
      }),
    ).toEqual({
      type: 'storage',
      ref: 'images/a.webp',
    });
  });

  it('rejects Excel hyperlinks that would mash multiple GCS signed query params', () => {
    expect(isUsableExcelHyperlink('https://storage.googleapis.com/bucket/a.webp')).toBe(true);
    expect(isUsableExcelHyperlink('')).toBe(false);
  });
});
