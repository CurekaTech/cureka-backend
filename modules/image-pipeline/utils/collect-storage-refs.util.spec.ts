import { collectStorageReferences } from './collect-storage-refs.util';

describe('collectStorageReferences', () => {
  it('should collect nested gallery and single-image refs without duplication walk errors', () => {
    const payload = {
      imageUrl: { key: 'banners/a.jpg', name: 'bucket' },
      media: [
        { url: { key: 'images/b.jpg', name: 'bucket' } },
        { url: { key: 'images/c.jpg', name: 'bucket' } },
      ],
    };
    const refs = collectStorageReferences(payload);
    expect(refs).toHaveLength(3);
    expect(refs.map((item) => item.key).sort()).toEqual([
      'banners/a.jpg',
      'images/b.jpg',
      'images/c.jpg',
    ]);
  });
});
