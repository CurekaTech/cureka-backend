import { absoluteSitemapUrl } from './sitemap-url.builder';
import {
  SitemapXmlValidationError,
  buildSitemapIndexXml,
  buildUrlsetXml,
  escapeXml,
  validateSitemapIndexXml,
  validateUrlsetXml,
} from './sitemap-xml.builder';

const BASE = 'https://www.cureka.com';

describe('sitemap-xml.builder', () => {
  it('escapes XML special characters in loc', () => {
    expect(escapeXml('https://www.cureka.com/a&b<c>"\'')).toBe(
      'https://www.cureka.com/a&amp;b&lt;c&gt;&quot;&apos;',
    );
  });

  it('uses the entity lastmod, not now()', () => {
    const lastmod = new Date('2026-08-19T10:30:00.000Z');
    const xml = buildUrlsetXml(BASE, [
      { locPath: '/shop/example', lastmod },
    ]);
    expect(xml).toContain('<lastmod>2026-08-19T10:30:00Z</lastmod>');
    expect(xml).toContain('<loc>https://www.cureka.com/shop/example</loc>');
  });

  it('builds and validates a urlset', () => {
    const entries = [
      { locPath: '/shop/a', lastmod: new Date('2026-01-01T00:00:00Z') },
      { locPath: '/shop/b&c' },
    ];
    const xml = buildUrlsetXml(BASE, entries);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://www.cureka.com/shop/b&amp;c</loc>');
    validateUrlsetXml(xml, [
      absoluteSitemapUrl(BASE, '/shop/a'),
      absoluteSitemapUrl(BASE, '/shop/b&c'),
    ]);
  });

  it('builds a sitemap index that lists child files', () => {
    const xml = buildSitemapIndexXml(BASE, [
      { locPath: '/sitemaps/static.xml' },
      { locPath: '/sitemaps/products/products-1.xml' },
    ]);
    validateSitemapIndexXml(xml, [
      'https://www.cureka.com/sitemaps/static.xml',
      'https://www.cureka.com/sitemaps/products/products-1.xml',
    ]);
  });

  it('rejects unescaped ampersands', () => {
    expect(() =>
      validateUrlsetXml(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://www.cureka.com/a&b</loc></url></urlset>',
        ['https://www.cureka.com/a&b'],
      ),
    ).toThrow(SitemapXmlValidationError);
  });
});
