import {
  buildPublicMediaAbsoluteUrl,
  cacheControlForPublicMediaKey,
  isAllowedPublicMediaKey,
  normalizePublicMediaKey,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PUBLIC_MEDIA_DERIVATIVE_CACHE_CONTROL,
} from './public-media.util';

describe('public-media.util', () => {
  it('allows merchandising banners, products, logos, and derivatives', () => {
    expect(isAllowedPublicMediaKey('banners/hero.png')).toBe(true);
    expect(isAllowedPublicMediaKey('images/p.jpg')).toBe(true);
    expect(isAllowedPublicMediaKey('logos/brand.webp')).toBe(true);
    expect(isAllowedPublicMediaKey('icons/hc.png')).toBe(true);
    expect(isAllowedPublicMediaKey('derivatives/v1/abc/w800.webp')).toBe(true);
    expect(isAllowedPublicMediaKey('gallery/shot.jpg')).toBe(true);
  });

  it('rejects private folders and path traversal even when they look public', () => {
    expect(isAllowedPublicMediaKey('avatars/me.png')).toBe(false);
    expect(isAllowedPublicMediaKey('return-evidence/photo.jpg')).toBe(false);
    expect(isAllowedPublicMediaKey('vendor-documents/gst.pdf')).toBe(false);
    expect(isAllowedPublicMediaKey('support-attachments/ticket.png')).toBe(false);
    expect(isAllowedPublicMediaKey('sitemaps/index.xml')).toBe(false);
    expect(normalizePublicMediaKey('banners/../avatars/x.png')).toBeNull();
    expect(normalizePublicMediaKey('https://evil.example/images/x.png')).toBeNull();
  });

  it('builds a stable storefront media URL without GCS signatures', () => {
    expect(
      buildPublicMediaAbsoluteUrl(
        'https://www.cureka.com/',
        'banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png',
      ),
    ).toBe(
      'https://www.cureka.com/api/v1/public/media/banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png',
    );
  });

  it('uses a long immutable TTL for derivatives and a shorter public TTL for masters', () => {
    expect(cacheControlForPublicMediaKey('derivatives/v1/h/w800.webp')).toBe(
      PUBLIC_MEDIA_DERIVATIVE_CACHE_CONTROL,
    );
    expect(cacheControlForPublicMediaKey('banners/hero.png')).toBe(PUBLIC_MEDIA_CACHE_CONTROL);
  });
});
