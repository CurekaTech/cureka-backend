import { existingPublicMediaStorageKey, reuseStoredBulkUploadImageKey, toLegacyCurekaImageUrl } from './bulk-upload-image.util';

describe('toLegacyCurekaImageUrl', () => {
  it('rewrites www.cureka.com image hosts to legacy.cureka.com', () => {
    expect(
      toLegacyCurekaImageUrl('https://www.cureka.com/wp-content/uploads/2019/11/161.jpg'),
    ).toBe('https://legacy.cureka.com/wp-content/uploads/2019/11/161.jpg');
  });

  it('rewrites cureka.com without www', () => {
    expect(toLegacyCurekaImageUrl('http://cureka.com/wp-content/uploads/a.webp')).toBe(
      'https://legacy.cureka.com/wp-content/uploads/a.webp',
    );
  });

  it('keeps our public media URLs on www.cureka.com', () => {
    const url =
      'https://www.cureka.com/api/v1/public/media/gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png';
    expect(toLegacyCurekaImageUrl(url)).toBe(url);
    expect(existingPublicMediaStorageKey(url)).toBe(
      'gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png',
    );
  });

  it('leaves legacy, GCS, and other hosts unchanged', () => {
    expect(
      toLegacyCurekaImageUrl('https://legacy.cureka.com/wp-content/uploads/a.jpg'),
    ).toBe('https://legacy.cureka.com/wp-content/uploads/a.jpg');
    expect(toLegacyCurekaImageUrl('https://storage.googleapis.com/bucket/images/a.jpg')).toBe(
      'https://storage.googleapis.com/bucket/images/a.jpg',
    );
    expect(toLegacyCurekaImageUrl('images/already-in-gcs.jpg')).toBe('images/already-in-gcs.jpg');
  });
});

describe('reuseStoredBulkUploadImageKey', () => {
  const galleryUrl =
    'https://www.cureka.com/api/v1/public/media/gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png';
  const wordpressUrl = 'https://www.cureka.com/wp-content/uploads/2019/11/161.jpg';

  it('reuses a public gallery URL as the stored gallery key', () => {
    expect(reuseStoredBulkUploadImageKey(galleryUrl)).toBe(
      'gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png',
    );
  });

  it('reuses a bare gallery storage key', () => {
    expect(reuseStoredBulkUploadImageKey('gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png')).toBe(
      'gallery/9ad3d398-1501-4f98-b140-dfb871606dd7.png',
    );
  });

  it('reuses a harvested WordPress URL instead of downloading it', () => {
    const cache = new Map<string, string>([[wordpressUrl, 'images/harvested-161.jpg']]);
    expect(reuseStoredBulkUploadImageKey(wordpressUrl, cache)).toBe('images/harvested-161.jpg');
  });

  it('leaves an uncached WordPress URL for download', () => {
    expect(reuseStoredBulkUploadImageKey(wordpressUrl, new Map())).toBeNull();
  });
});
