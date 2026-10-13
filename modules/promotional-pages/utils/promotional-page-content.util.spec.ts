import { BadRequestException } from '@nestjs/common';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import {
  assertCanPublish,
  isSectionVisible,
  normalizeSections,
  publicUnavailableReason,
  resolveEffectiveStatus,
  resolveRequestedStatus,
  stripHtml,
} from './promotional-page-content.util';

const NOW = new Date('2026-06-01T00:00:00.000Z');

describe('promotional page schedule', () => {
  it('keeps a draft unpublished and hides it from the public URL', () => {
    expect(
      resolveEffectiveStatus({ status: PromotionalPageStatus.DRAFT }, NOW),
    ).toBe(PromotionalPageStatus.DRAFT);
    expect(
      publicUnavailableReason({ status: PromotionalPageStatus.DRAFT }, NOW),
    ).toBe('Promotional page is not published');
  });

  it('stores a future publish as scheduled', () => {
    expect(
      assertCanPublish(new Date('2026-07-01T00:00:00.000Z'), new Date('2026-08-01T00:00:00.000Z'), NOW),
    ).toBe(PromotionalPageStatus.SCHEDULED);
    expect(
      publicUnavailableReason(
        {
          status: PromotionalPageStatus.SCHEDULED,
          startAt: new Date('2026-07-01T00:00:00.000Z'),
          endAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        NOW,
      ),
    ).toBe('Promotional page is not available yet');
  });

  it('publishes a page that is inside its window', () => {
    expect(
      assertCanPublish(new Date('2026-05-01T00:00:00.000Z'), new Date('2026-07-01T00:00:00.000Z'), NOW),
    ).toBe(PromotionalPageStatus.PUBLISHED);
    expect(
      publicUnavailableReason(
        {
          status: PromotionalPageStatus.PUBLISHED,
          startAt: new Date('2026-05-01T00:00:00.000Z'),
          endAt: new Date('2026-07-01T00:00:00.000Z'),
        },
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects publishing after the end date and treats a live page as expired', () => {
    expect(() =>
      assertCanPublish(new Date('2026-01-01T00:00:00.000Z'), new Date('2026-02-01T00:00:00.000Z'), NOW),
    ).toThrow(BadRequestException);
    expect(
      resolveEffectiveStatus(
        {
          status: PromotionalPageStatus.PUBLISHED,
          endAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        NOW,
      ),
    ).toBe(PromotionalPageStatus.EXPIRED);
    expect(
      publicUnavailableReason(
        {
          status: PromotionalPageStatus.PUBLISHED,
          endAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        NOW,
      ),
    ).toBe('Promotional page has expired');
  });

  it('keeps unpublished and archived pages off the public URL', () => {
    expect(
      publicUnavailableReason({ status: PromotionalPageStatus.UNPUBLISHED }, NOW),
    ).toBe('Promotional page is not published');
    expect(
      publicUnavailableReason({ status: PromotionalPageStatus.ARCHIVED, deletedAt: NOW }, NOW),
    ).toBe('Promotional page is archived');
  });

  it('rejects an end date before the start date', () => {
    expect(() =>
      resolveRequestedStatus(
        PromotionalPageStatus.DRAFT,
        new Date('2026-08-01T00:00:00.000Z'),
        new Date('2026-07-01T00:00:00.000Z'),
        NOW,
      ),
    ).toThrow(/Campaign start date must be before or equal to campaign end date/);
  });

  it('hides inactive and out-of-window sections', () => {
    expect(isSectionVisible({ isActive: false, startAt: null, endAt: null }, NOW)).toBe(false);
    expect(
      isSectionVisible(
        { isActive: true, startAt: new Date('2026-07-01T00:00:00.000Z'), endAt: null },
        NOW,
      ),
    ).toBe(false);
    expect(
      isSectionVisible(
        { isActive: true, startAt: null, endAt: new Date('2026-05-01T00:00:00.000Z') },
        NOW,
      ),
    ).toBe(false);
    expect(isSectionVisible({ isActive: true, startAt: null, endAt: null }, NOW)).toBe(true);
  });
});

describe('promotional page content', () => {
  it('strips script markup from text', () => {
    expect(stripHtml('<script>alert(1)</script><b>Hello</b>')).toBe('Hello');
  });

  it('rejects a javascript CTA and, on publish, a brand collection without a brand', () => {
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.HERO_BANNER,
          config: { ctaUrl: 'javascript:alert(1)' },
        },
      ]),
    ).toThrow(/not a supported URL/);

    expect(
      normalizeSections([
        {
          type: PromotionalSectionType.PRODUCT_COLLECTION,
          config: { selectionMode: 'brand' },
        },
      ])[0]?.config.brandRefId,
    ).toBeNull();

    expect(() =>
      normalizeSections(
        [
          {
            type: PromotionalSectionType.PRODUCT_COLLECTION,
            config: { selectionMode: 'brand', layout: 'grid' },
          },
        ],
        { mode: 'publish' },
      ),
    ).toThrow(/brand reference/);
  });

  it('keeps section order, visibility, and product references', () => {
    const sections = normalizeSections([
      {
        type: PromotionalSectionType.PRODUCT_COLLECTION,
        title: 'Kits',
        sortOrder: 2,
        isActive: false,
        startAt: '2026-06-01T00:00:00.000Z',
        endAt: '2026-07-01T00:00:00.000Z',
        items: [
          { targetType: PromotionalTargetType.PRODUCT, targetRefId: 'PRO2026000001', sortOrder: 1 },
          { targetType: PromotionalTargetType.PRODUCT, targetRefId: 'PRO2026000002', sortOrder: 0 },
        ],
      },
    ]);

    expect(sections[0]).toMatchObject({
      sortOrder: 2,
      isActive: false,
      title: 'Kits',
    });
    expect(sections[0]?.items.map((item) => item.targetRefId)).toEqual([
      'PRO2026000001',
      'PRO2026000002',
    ]);
  });

  it('rejects a section whose schedule ends before it starts', () => {
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.VIDEO,
          startAt: '2026-08-01T00:00:00.000Z',
          endAt: '2026-07-01T00:00:00.000Z',
          config: { videoUrl: 'https://www.youtube.com/watch?v=abc123' },
        },
      ]),
    ).toThrow(/start date must be before or equal to section end date/);
  });
});

const image = (key: string) => ({ key, name: key.split('/').pop() ?? key });

const productItem = (n: number) => ({
  targetType: PromotionalTargetType.PRODUCT,
  targetRefId: `PRO${String(20260000 + n)}`,
});

const publishHero = {
  type: PromotionalSectionType.HERO_BANNER,
  config: {
    desktopImage: image('banners/desktop.png'),
    mobileImage: image('banners/mobile.png'),
  },
};

const validationMessages = (run: () => void): string[] => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as { message: string | string[] };
    return Array.isArray(response.message) ? response.message : [response.message];
  }
  throw new Error('expected section validation to fail');
};

describe('promotional section validation', () => {
  it('allows an incomplete hero on a draft and blocks it on publish', () => {
    expect(normalizeSections([{ type: PromotionalSectionType.HERO_BANNER }])).toHaveLength(1);

    const messages = validationMessages(() =>
      normalizeSections([{ type: PromotionalSectionType.HERO_BANNER }], { mode: 'publish' }),
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'Section 1 desktop image is required',
        'Section 1 mobile image is required',
      ]),
    );
  });

  it('requires CTA text and URL together only when publishing', () => {
    expect(
      normalizeSections([
        {
          type: PromotionalSectionType.HERO_BANNER,
          config: { ctaText: 'Shop now' },
        },
      ]),
    ).toHaveLength(1);

    expect(() =>
      normalizeSections(
        [
          {
            ...publishHero,
            config: { ...publishHero.config, ctaText: 'Shop now' },
          },
        ],
        { mode: 'publish' },
      ),
    ).toThrow(/CTA text and CTA URL must both be set or both be empty/);
  });

  it('rejects a section that starts after the page ends', () => {
    expect(() =>
      normalizeSections(
        [
          {
            type: PromotionalSectionType.HERO_BANNER,
            startAt: '2026-11-01T00:00:00.000Z',
            endAt: '2026-11-05T00:00:00.000Z',
          },
        ],
        { pageEndAt: new Date('2026-10-31T00:00:00.000Z') },
      ),
    ).toThrow(/end date cannot be after the campaign end date/);
  });

  it('rejects a video URL that is not YouTube, and requires one to publish', () => {
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.VIDEO,
          config: { videoUrl: 'https://videos.cureka.com/offer.mp4' },
        },
      ]),
    ).toThrow(/must be a YouTube URL/);

    expect(
      normalizeSections([
        {
          type: PromotionalSectionType.VIDEO,
          config: { videoUrl: 'https://youtu.be/abc123' },
        },
      ])[0]?.config.videoUrl,
    ).toBe('https://youtu.be/abc123');

    expect(() =>
      normalizeSections([{ type: PromotionalSectionType.VIDEO }], { mode: 'publish' }),
    ).toThrow(/video URL is required/);
  });

  it('caps manual products and rejects max items below the selection', () => {
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.PRODUCT_COLLECTION,
          config: { selectionMode: 'manual', maxItems: 1 },
          items: [productItem(1), productItem(2)],
        },
      ]),
    ).toThrow(/max items cannot be lower than the number of selected products/);

    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.PRODUCT_COLLECTION,
          items: Array.from({ length: 51 }, (_, index) => productItem(index + 1)),
        },
      ]),
    ).toThrow(/at most 50 products/);
  });

  it('requires a product, layout, and selection mode to publish a manual collection', () => {
    expect(() =>
      normalizeSections(
        [{ type: PromotionalSectionType.PRODUCT_COLLECTION, config: { selectionMode: 'manual' } }],
        { mode: 'publish' },
      ),
    ).toThrow(/needs at least 1 product/);

    const messages = validationMessages(() =>
      normalizeSections([{ type: PromotionalSectionType.PRODUCT_COLLECTION }], { mode: 'publish' }),
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'Section 1 selection mode is required',
        'Section 1 layout is required',
      ]),
    );
  });

  it('requires categories and brands within their caps', () => {
    expect(() =>
      normalizeSections([{ type: PromotionalSectionType.CATEGORY }], { mode: 'publish' }),
    ).toThrow(/needs at least 1 category/);

    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.BRAND,
          items: Array.from({ length: 21 }, (_, index) => ({
            targetType: PromotionalTargetType.BRAND,
            targetRefId: `BRA${String(20260000 + index + 1)}`,
          })),
        },
      ]),
    ).toThrow(/at most 20 brands/);
  });

  it('requires selected blogs and allows featured mode without posts', () => {
    expect(() =>
      normalizeSections(
        [
          {
            type: PromotionalSectionType.BLOG,
            config: { blogMode: 'selected' },
          },
        ],
        { mode: 'publish' },
      ),
    ).toThrow(/needs at least 1 blog post/);

    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.BLOG,
          config: { blogMode: 'selected' },
          items: Array.from({ length: 13 }, (_, index) => ({
            targetType: PromotionalTargetType.BLOG,
            targetRefId: `BLG${String(20260000 + index + 1)}`,
          })),
        },
      ]),
    ).toThrow(/at most 12 blog posts/);

    expect(
      normalizeSections(
        [
          {
            type: PromotionalSectionType.BLOG,
            config: { blogMode: 'featured' },
          },
        ],
        { mode: 'publish' },
      ),
    ).toHaveLength(1);
  });

  it('limits title, subtitle, and heading length', () => {
    expect(() =>
      normalizeSections([
        { type: PromotionalSectionType.HERO_BANNER, title: 'a'.repeat(101) },
      ]),
    ).toThrow(/title must be at most 100/);
    expect(() =>
      normalizeSections([
        { type: PromotionalSectionType.HERO_BANNER, subtitle: 'a'.repeat(201) },
      ]),
    ).toThrow(/subtitle must be at most 200/);
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.HERO_BANNER,
          config: { heading: 'a'.repeat(101) },
        },
      ]),
    ).toThrow(/heading must be at most 100/);
  });

  it('rejects publish when every section is inactive', () => {
    expect(() =>
      normalizeSections([{ ...publishHero, isActive: false }], { mode: 'publish' }),
    ).toThrow(/At least one active section is required to publish/);
  });

  it('keeps a section that matches the campaign dates and rejects one outside them', () => {
    const window = {
      pageStartAt: new Date('2026-10-01T00:00:00.000Z'),
      pageEndAt: new Date('2026-10-31T00:00:00.000Z'),
    };
    expect(
      normalizeSections(
        [
          {
            type: PromotionalSectionType.HERO_BANNER,
            startAt: '2026-10-01T00:00:00.000Z',
            endAt: '2026-10-31T00:00:00.000Z',
          },
        ],
        { ...window, requireSectionDates: true },
      ),
    ).toHaveLength(1);

    expect(() =>
      normalizeSections(
        [
          {
            type: PromotionalSectionType.HERO_BANNER,
            title: 'Featured',
            startAt: '2026-09-15T00:00:00.000Z',
            endAt: '2026-10-10T00:00:00.000Z',
          },
        ],
        window,
      ),
    ).toThrow(/start date cannot be before the campaign start date/);

    expect(
      normalizeSections(
        [
          {
            type: PromotionalSectionType.HERO_BANNER,
            startAt: '2026-10-10T00:00:00.000Z',
            endAt: '2026-10-10T00:00:00.000Z',
          },
        ],
        { ...window, requireSectionDates: true },
      ),
    ).toHaveLength(1);

    expect(() =>
      normalizeSections([{ type: PromotionalSectionType.HERO_BANNER }], { requireSectionDates: true }),
    ).toThrow(/start date is required/);
  });
});
