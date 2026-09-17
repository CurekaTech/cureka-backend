import {
  collectUniqueImageUrls,
  mapProductUrlsToGcsKeys,
} from './wp-image-harvest.util';

describe('wp-image-harvest.util', () => {
  it('collects unique image URLs in first-seen order', () => {
    const byProductId = new Map<string, string[]>([
      ['10', ['https://www.cureka.com/a.jpg', 'https://www.cureka.com/b.jpg']],
      ['11', ['https://www.cureka.com/b.jpg', 'https://www.cureka.com/c.jpg']],
    ]);
    expect(collectUniqueImageUrls(byProductId)).toEqual([
      'https://www.cureka.com/a.jpg',
      'https://www.cureka.com/b.jpg',
      'https://www.cureka.com/c.jpg',
    ]);
  });

  it('maps each product gallery to harvested GCS keys without requiring the product in DB', () => {
    const byProductId = new Map<string, string[]>([
      ['16794', ['https://www.cureka.com/a.jpg', 'https://www.cureka.com/b.jpg']],
      ['99999', ['https://www.cureka.com/a.jpg']],
    ]);
    const urlToGcsKey = new Map([
      ['https://www.cureka.com/a.jpg', 'images/aaa.jpg'],
      ['https://www.cureka.com/b.jpg', 'images/bbb.jpg'],
    ]);

    const mapped = mapProductUrlsToGcsKeys(byProductId, urlToGcsKey);
    expect(mapped.get('16794')).toEqual(['images/aaa.jpg', 'images/bbb.jpg']);
    expect(mapped.get('99999')).toEqual(['images/aaa.jpg']);
  });

  it('omits URLs that were not harvested yet', () => {
    const byProductId = new Map<string, string[]>([
      ['1', ['https://www.cureka.com/a.jpg', 'https://www.cureka.com/missing.jpg']],
    ]);
    const mapped = mapProductUrlsToGcsKeys(
      byProductId,
      new Map([['https://www.cureka.com/a.jpg', 'images/aaa.jpg']]),
    );
    expect(mapped.get('1')).toEqual(['images/aaa.jpg']);
  });
});
