import { mapAssetToDelivery } from './image-delivery.mapper';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';

describe('mapAssetToDelivery', () => {
  it('should return pending with original fallback when metadata is missing', () => {
    const payload = mapAssetToDelivery({
      asset: null,
      originalUrl: 'https://example.test/original.jpg',
      variantUrls: new Map(),
    });
    expect(payload.status).toBe('pending');
    expect(payload.original.url).toBe('https://example.test/original.jpg');
    expect(payload.variants).toEqual([]);
  });

  it('should omit variants whose upload URL is not yet available', () => {
    const payload = mapAssetToDelivery({
      asset: {
        status: ImageAssetStatus.PARTIAL,
        sourceBucket: 'local',
        sourceKey: 'images/a.jpg',
        sourceWidth: 800,
        sourceHeight: 800,
        sourceMime: 'image/jpeg',
        sourceBytes: 1000,
        pipelineVersion: 'v1',
        variants: [
          { width: 240, height: 240, format: 'webp', bytes: 12, key: 'derivatives/v1/h/w240.webp' },
          { width: 480, height: 480, format: 'webp', bytes: 20, key: 'derivatives/v1/h/w480.webp' },
        ],
        errorCode: null,
      },
      originalUrl: 'https://example.test/original.jpg',
      variantUrls: new Map([['derivatives/v1/h/w240.webp', 'https://example.test/w240.webp']]),
    });
    expect(payload.status).toBe('partial');
    expect(payload.variants).toEqual([
      {
        url: 'https://example.test/w240.webp',
        width: 240,
        height: 240,
        format: 'webp',
        bytes: 12,
      },
    ]);
  });
});
