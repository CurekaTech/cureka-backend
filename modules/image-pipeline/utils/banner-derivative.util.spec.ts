import { selectBannerStorefrontVariant } from './banner-derivative.util';
import { IImageDeliveryVariant } from '@packages/storage';

const variant = (width: number, key = `derivatives/v1/abc/w${width}.webp`): IImageDeliveryVariant => ({
  url: `https://www.cureka.com/api/v1/public/media/${key}`,
  width,
  height: Math.round(width / 2),
  format: 'webp',
  bytes: width * 10,
});

describe('selectBannerStorefrontVariant', () => {
  it('should pick the smallest ready WebP that covers the homepage hero target', () => {
    const selected = selectBannerStorefrontVariant({
      sourceKey: 'banners/hero.png',
      status: 'ready',
      sourceWidth: 2400,
      variants: [variant(240), variant(800), variant(1200), variant(1600)],
    });
    expect(selected?.width).toBe(800);
  });

  it('should use the largest derivative when the source is narrower than the hero target', () => {
    const selected = selectBannerStorefrontVariant({
      sourceKey: 'banners/small.png',
      status: 'partial',
      sourceWidth: 480,
      variants: [variant(240), variant(480)],
    });
    expect(selected?.width).toBe(480);
  });

  it('should fall back when no suitable derivative exists', () => {
    expect(
      selectBannerStorefrontVariant({
        sourceKey: 'banners/wide.png',
        status: 'ready',
        sourceWidth: 2400,
        variants: [variant(240)],
      }),
    ).toBeNull();
  });

  it('should fall back for pending, failed, and unsupported assets', () => {
    for (const status of ['pending', 'failed', 'unsupported'] as const) {
      expect(
        selectBannerStorefrontVariant({
          sourceKey: 'banners/hero.png',
          status,
          sourceWidth: 2400,
          variants: [variant(800)],
        }),
      ).toBeNull();
    }
  });

  it('should leave non-banner images on their original URL selection', () => {
    expect(
      selectBannerStorefrontVariant({
        sourceKey: 'images/product.jpg',
        status: 'ready',
        sourceWidth: 1500,
        variants: [variant(800)],
      }),
    ).toBeNull();
  });

  it('should reject derivative URLs that are not storage-service paths', () => {
    expect(
      selectBannerStorefrontVariant({
        sourceKey: 'banners/hero.png',
        status: 'ready',
        sourceWidth: 2400,
        variants: [{ ...variant(800), url: 'https://storage.googleapis.com/bucket/avatars/secret.png' }],
      }),
    ).toBeNull();
  });
});
