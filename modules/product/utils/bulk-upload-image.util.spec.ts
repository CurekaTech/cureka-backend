import { toLegacyCurekaImageUrl } from './bulk-upload-image.util';

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
