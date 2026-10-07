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
    ).toThrow(/end must be on or after the start/);
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

  it('rejects a javascript CTA and a brand collection without a brand', () => {
    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.HERO_BANNER,
          config: { ctaUrl: 'javascript:alert(1)' },
        },
      ]),
    ).toThrow(/not a supported URL/);

    expect(() =>
      normalizeSections([
        {
          type: PromotionalSectionType.PRODUCT_COLLECTION,
          config: { selectionMode: 'brand' },
        },
      ]),
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
          config: { videoUrl: 'https://videos.cureka.com/offer.mp4' },
        },
      ]),
    ).toThrow(/end must be on or after the start/);
  });
});
