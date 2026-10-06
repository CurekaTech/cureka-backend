import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { IStorageProviderWithAccessibleUrl } from './storage-accessible-url.interface';

describe('StorageService stable public media URLs', () => {
  const provider: Pick<IStorageProviderWithAccessibleUrl, 'getAccessibleUrl'> = {
    getAccessibleUrl: jest.fn(async (key: string) => `https://signed.test/${key}?X-Goog-Signature=abc`),
  };

  const configValues: Record<string, unknown> = {
    'storage.publicMedia.stableUrls': true,
    'storage.publicMedia.baseUrl': 'https://www.cureka.com',
    'storage.driver': 'gcs',
    'storage.gcs.bucket': 'cureka-files-prod',
    'storage.gcs.signedUrlTtlSeconds': 86400,
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
    getOrThrow: jest.fn((key: string) => {
      const value = configValues[key];
      if (value === undefined) throw new Error(key);
      return value;
    }),
  };

  const service = new StorageService(
    provider as never,
    configService as never,
    { get: jest.fn() } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configValues['storage.publicMedia.stableUrls'] = true;
    configValues['storage.publicMedia.baseUrl'] = 'https://www.cureka.com';
  });

  it('returns a stable storefront media URL for merchandising keys', async () => {
    const result = await service.toFileReferenceResponse({
      key: 'banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png',
      name: 'cureka-files-prod',
    });

    expect(result?.url).toBe(
      'https://www.cureka.com/api/v1/public/media/banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png',
    );
    expect(provider.getAccessibleUrl).not.toHaveBeenCalled();
  });

  it('returns the same URL on consecutive calls (no signature rotation)', async () => {
    const first = await service.resolveAccessibleUrl('images/product.jpg');
    const second = await service.resolveAccessibleUrl('images/product.jpg');
    expect(first).toBe(second);
    expect(first).toBe('https://www.cureka.com/api/v1/public/media/images/product.jpg');
  });

  it('still signs private folders', async () => {
    const url = await service.resolveAccessibleUrl('avatars/user.png');
    expect(url).toBe('https://signed.test/avatars/user.png?X-Goog-Signature=abc');
    expect(provider.getAccessibleUrl).toHaveBeenCalledWith('avatars/user.png');
  });

  it('falls back to signed URLs when stable media URLs are disabled', async () => {
    configValues['storage.publicMedia.stableUrls'] = false;
    const url = await service.resolveAccessibleUrl('banners/hero.png');
    expect(url).toContain('X-Goog-Signature=abc');
  });
});
