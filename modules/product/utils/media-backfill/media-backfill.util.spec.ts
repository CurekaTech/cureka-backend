import {
  basenameFromUrl,
  basenameKey,
  buildLegacyUrlFromRelativePath,
  isMalformedLegacyUrl,
  rewriteToLegacyOrigin,
} from './url.util';
import { normalizeImageMime, validateImageBuffer } from './mime.util';
import { lookupManifestCandidates, normalizeManifestRelativePath } from './manifest.util';
import { ManifestIndex } from './types';

describe('media-backfill url.util', () => {
  it('rewrites www and apex cureka origins only', () => {
    expect(rewriteToLegacyOrigin('https://www.cureka.com/wp-content/uploads/a.jpg')).toBe(
      'https://legacy.cureka.com/wp-content/uploads/a.jpg',
    );
    expect(rewriteToLegacyOrigin('https://cureka.com/wp-content/uploads/a.jpg')).toBe(
      'https://legacy.cureka.com/wp-content/uploads/a.jpg',
    );
    expect(rewriteToLegacyOrigin('https://cdn.example.com/cureka.com/x.jpg')).toBe(
      'https://cdn.example.com/cureka.com/x.jpg',
    );
  });

  it('detects malformed truncated URLs', () => {
    expect(isMalformedLegacyUrl('https://legacy.cureka.com/wp-')).toBe(true);
    expect(isMalformedLegacyUrl('https://legacy.cureka.com/wp-content/uploads/a.jpg')).toBe(false);
  });

  it('decodes basename from URL', () => {
    expect(basenameFromUrl('https://legacy.cureka.com/wp-content/uploads/2024/12/p75-3.jpg')).toBe(
      'p75-3.jpg',
    );
    expect(basenameKey('P75-3.JPG')).toBe('p75-3.jpg');
  });
});

describe('media-backfill mime.util', () => {
  it('normalizes image/x-ms-bmp to image/bmp', () => {
    expect(normalizeImageMime('image/x-ms-bmp')).toBe('image/bmp');
    expect(normalizeImageMime('image/x-ms-bmp; charset=binary')).toBe('image/bmp');
  });

  it('rejects HTML body', () => {
    const html = Buffer.from('<!DOCTYPE html><html><title>404</title></html>');
    const result = validateImageBuffer(html, 'image/jpeg', 1024 * 1024);
    expect(result.ok).toBe(false);
  });

  it('accepts JPEG magic bytes', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const result = validateImageBuffer(jpeg, 'image/x-ms-bmp', 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/jpeg');
  });

  it('accepts BMP magic bytes as image/bmp', () => {
    const bmp = Buffer.alloc(16, 0);
    bmp[0] = 0x42;
    bmp[1] = 0x4d;
    const result = validateImageBuffer(bmp, 'image/x-ms-bmp', 1024);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.mime).toBe('image/bmp');
  });
});

describe('media-backfill manifest.util', () => {
  it('normalizes paths and rejects outside uploads', () => {
    expect(normalizeManifestRelativePath('wp-content/uploads/2024/10/p74-2.jpg')).toBe(
      'wp-content/uploads/2024/10/p74-2.jpg',
    );
    expect(normalizeManifestRelativePath('2024/10/p74-2.jpg')).toBe(
      'wp-content/uploads/2024/10/p74-2.jpg',
    );
    expect(normalizeManifestRelativePath('C:\\evil\\secret.txt')).toBeNull();
    expect(normalizeManifestRelativePath('wc-product-export-1.csv')).toBeNull();
    expect(
      normalizeManifestRelativePath('/var/www/wp-content/uploads/2024/11/p74-2.jpg'),
    ).toBe('wp-content/uploads/2024/11/p74-2.jpg');
  });

  it('looks up case-insensitive basename with 0/1/many candidates', () => {
    const index: ManifestIndex = {
      byBasename: new Map([
        ['p74-2.jpg', ['wp-content/uploads/2024/10/p74-2.jpg', 'wp-content/uploads/2024/11/p74-2.jpg']],
        ['unique.jpg', ['wp-content/uploads/2025/01/Unique.jpg']],
      ]),
      entryCount: 3,
      fingerprint: 'x',
    };
    expect(lookupManifestCandidates(index, 'missing.jpg')).toEqual([]);
    expect(lookupManifestCandidates(index, 'UNIQUE.JPG')).toEqual([
      'wp-content/uploads/2025/01/Unique.jpg',
    ]);
    expect(lookupManifestCandidates(index, 'P74-2.JPG').length).toBe(2);
    expect(buildLegacyUrlFromRelativePath('wp-content/uploads/2024/10/p74-2.jpg')).toBe(
      'https://legacy.cureka.com/wp-content/uploads/2024/10/p74-2.jpg',
    );
  });
});
