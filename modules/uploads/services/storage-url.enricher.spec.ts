import { StorageUrlEnricher } from './storage-url.enricher';

describe('StorageUrlEnricher image delivery', () => {
  const storage = {
    persistFileReference: jest.fn((value: { key: string; name: string } | string | null) => {
      if (!value) return null;
      if (typeof value === 'string') return { key: value, name: 'bucket' };
      return { key: value.key, name: value.name };
    }),
    toFileReferenceResponse: jest.fn(async (ref: { key: string; name: string } | null) =>
      ref ? { ...ref, url: `https://cdn.test/${ref.key}` } : null,
    ),
    toFileReferenceResponses: jest.fn(async (refs: Array<{ key: string; name: string } | null>) =>
      refs.map((ref) => (ref ? { ...ref, url: `https://cdn.test/${ref.key}` } : null)),
    ),
  };

  const delivery = {
    attachToResponse: jest.fn(async (_ref: unknown, signed: { url: string }) => ({
      ...signed,
      imageDelivery: {
        status: 'ready',
        original: { url: signed.url, width: 100, height: 100 },
        variants: [
          { url: 'https://cdn.test/w240.webp', width: 240, height: 240, format: 'webp', bytes: 12 },
        ],
      },
    })),
    attachToMany: jest.fn(async (refs: Array<{ key: string } | null>, signed: Array<{ url: string } | null>) =>
      signed.map((item, index) =>
        item
          ? {
              ...item,
              imageDelivery: {
                status: 'pending',
                original: { url: item.url, width: null, height: null },
                variants: [],
              },
              key: refs[index]?.key,
            }
          : null,
      ),
    ),
  };

  const moduleRef = {
    get: jest.fn(() => delivery),
  };

  const enricher = new StorageUrlEnricher(storage as never, moduleRef as never);

  it('should keep existing url field type and add imageDelivery additively', async () => {
    const result = await enricher.toReference({ key: 'images/a.jpg', name: 'bucket' });
    expect(typeof result?.url).toBe('string');
    expect(result?.key).toBe('images/a.jpg');
    expect(result?.imageDelivery?.status).toBe('ready');
  });

  it('should batch nested homepage and product images in enrichDeep', async () => {
    const payload = {
      hero: { imageUrl: { key: 'banners/hero.jpg', name: 'bucket' } },
      products: [{ primaryImageUrl: { key: 'images/p.jpg', name: 'bucket' } }],
      label: 'unchanged',
    };

    const result = await enricher.enrichDeep(payload);
    expect(result.label).toBe('unchanged');
    const hero = result.hero.imageUrl as unknown as {
      url: string;
      imageDelivery: { status: string };
    };
    expect(hero.url).toBe('https://cdn.test/banners/hero.jpg');
    expect(hero.imageDelivery.status).toBe('pending');
    expect(storage.toFileReferenceResponses).toHaveBeenCalledTimes(1);
    expect(delivery.attachToMany).toHaveBeenCalledTimes(1);
  });

  it('should omit delivery when the module is unavailable', async () => {
    moduleRef.get.mockImplementation(() => {
      throw new Error('not ready');
    });
    const result = await enricher.toReference({ key: 'images/a.jpg', name: 'bucket' });
    expect(result?.url).toBe('https://cdn.test/images/a.jpg');
    expect(result?.imageDelivery).toBeUndefined();
    moduleRef.get.mockImplementation(() => delivery);
  });
});
