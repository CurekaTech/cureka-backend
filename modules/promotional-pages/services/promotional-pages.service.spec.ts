import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditService } from '@modules/master/services/audit.service';
import { PromotionalPageEntity } from '../entities/promotional-page.entity';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import { PromotionalPagesRepository } from '../repositories/promotional-pages.repository';
import { PromotionalPageReferenceService } from './promotional-page-reference.service';
import { PromotionalPagesService } from './promotional-pages.service';

const NOW = new Date('2026-06-01T00:00:00.000Z');

const basePage = (overrides: Partial<PromotionalPageEntity> = {}): PromotionalPageEntity =>
  ({
    id: 'page-id',
    refId: 'HIM2026000001',
    name: 'Himalaya Buy More Save More',
    slug: 'himalaya-buy-more-save-more',
    title: 'Buy More. Save More.',
    metaTitle: null,
    metaDescription: null,
    status: PromotionalPageStatus.DRAFT,
    startAt: null,
    endAt: null,
    couponId: null,
    coupon: null,
    sections: [],
    targets: [],
    createdBy: 'admin@cureka.com',
    updatedBy: 'admin@cureka.com',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }) as PromotionalPageEntity;

describe('PromotionalPagesService', () => {
  let stored: PromotionalPageEntity;
  let pagesRepository: {
    create: jest.Mock;
    existsByRefId: jest.Mock;
    existsBySlug: jest.Mock;
    findByRefId: jest.Mock;
    findBySlug: jest.Mock;
    findArchivedBySlug: jest.Mock;
    updateByRefId: jest.Mock;
    softDeleteByRefId: jest.Mock;
    findAllPaginated: jest.Mock;
    replaceChildren: jest.Mock;
  };
  let references: { assertCatalogRefs: jest.Mock; hydrate: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: PromotionalPagesService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    stored = basePage();
    pagesRepository = {
      create: jest.fn(async (data) => {
        stored = basePage({ ...stored, ...data });
        return stored;
      }),
      existsByRefId: jest.fn(async () => false),
      existsBySlug: jest.fn(async () => false),
      findByRefId: jest.fn(async () => stored),
      findBySlug: jest.fn(async () => null),
      findArchivedBySlug: jest.fn(async () => null),
      updateByRefId: jest.fn(async (_refId, data) => {
        stored = basePage({ ...stored, ...data });
        return stored;
      }),
      softDeleteByRefId: jest.fn(async () => undefined),
      findAllPaginated: jest.fn(async () => ({ data: [stored], total: 1 })),
      replaceChildren: jest.fn(async () => undefined),
    };
    references = {
      assertCatalogRefs: jest.fn(async () => ({ couponId: 'coupon-id' })),
      hydrate: jest.fn(async ({ sections }: { sections: Array<Record<string, unknown>> }) => ({
        sections: sections.map((section) => ({
          id: section.id,
          type: section.type,
          title: section.title,
          subtitle: section.subtitle,
          config: section.config,
          sortOrder: section.sortOrder,
          isActive: section.isActive,
          isCurrentlyVisible: true,
          startAt: section.startAt,
          endAt: section.endAt,
          products: [],
          categories: [],
          brands: [],
          blogs: [],
        })),
        targets: { products: [], categories: [], brands: [] },
      })),
    };
    auditService = { log: jest.fn(async () => ({})) };
    service = new PromotionalPagesService(
      pagesRepository as unknown as PromotionalPagesRepository,
      references as unknown as PromotionalPageReferenceService,
      auditService as unknown as AuditService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const createDto = {
    name: 'Himalaya Buy More Save More',
    slug: 'himalaya-buy-more-save-more',
    title: 'Buy More. Save More.',
  };

  it('creates a draft page', async () => {
    const created = await service.create(createDto, 'admin@cureka.com');

    expect(created.slug).toBe('himalaya-buy-more-save-more');
    expect(created.storedStatus).toBe(PromotionalPageStatus.DRAFT);
    expect(pagesRepository.create).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entityType: 'promotional_page' }),
    );
  });

  it('returns the saved page', async () => {
    const found = await service.findOne('HIM2026000001');
    expect(found.refId).toBe('HIM2026000001');
  });

  it('lists pages with the requested filters', async () => {
    const result = await service.findAll({
      page: 1,
      limit: 20,
      search: 'himalaya',
      status: PromotionalPageStatus.DRAFT,
      sortBy: 'name',
      sortOrder: 'ASC',
    });

    expect(result.total).toBe(1);
    expect(pagesRepository.findAllPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'himalaya',
        status: PromotionalPageStatus.DRAFT,
        sortBy: 'name',
        sortOrder: 'ASC',
      }),
    );
  });

  it('updates page details', async () => {
    const updated = await service.update(
      'HIM2026000001',
      { title: 'Save more this season' },
      'admin@cureka.com',
    );

    expect(updated.title).toBe('Save more this season');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'update' }));
  });

  it('archives a page instead of deleting the row', async () => {
    const result = await service.remove('HIM2026000001', 'admin@cureka.com');

    expect(result).toEqual({ refId: 'HIM2026000001' });
    expect(pagesRepository.updateByRefId).toHaveBeenCalledWith(
      'HIM2026000001',
      expect.objectContaining({ status: PromotionalPageStatus.ARCHIVED }),
    );
    expect(pagesRepository.softDeleteByRefId).toHaveBeenCalledWith('HIM2026000001');
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'archive' }));
  });

  it('rejects a duplicate slug', async () => {
    pagesRepository.existsBySlug.mockResolvedValue(true);

    await expect(service.create(createDto, 'admin@cureka.com')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(pagesRepository.create).not.toHaveBeenCalled();
  });

  it('schedules a page whose start is in the future', async () => {
    stored = basePage({
      startAt: new Date('2026-07-01T00:00:00.000Z'),
      endAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    const updated = await service.updateStatus(
      'HIM2026000001',
      { status: PromotionalPageStatus.PUBLISHED },
      'admin@cureka.com',
    );

    expect(updated.storedStatus).toBe(PromotionalPageStatus.SCHEDULED);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'schedule' }));
  });

  it('publishes a page that is already inside its window', async () => {
    stored = basePage({
      startAt: new Date('2026-05-01T00:00:00.000Z'),
      endAt: new Date('2026-07-01T00:00:00.000Z'),
    });

    const updated = await service.updateStatus(
      'HIM2026000001',
      { status: PromotionalPageStatus.PUBLISHED },
      'admin@cureka.com',
    );

    expect(updated.storedStatus).toBe(PromotionalPageStatus.PUBLISHED);
    expect(updated.status).toBe(PromotionalPageStatus.PUBLISHED);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish' }));
  });

  it('rejects publishing a page that has already ended', async () => {
    stored = basePage({ endAt: new Date('2026-01-01T00:00:00.000Z') });

    await expect(
      service.updateStatus(
        'HIM2026000001',
        { status: PromotionalPageStatus.PUBLISHED },
        'admin@cureka.com',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('unpublishes a page', async () => {
    stored = basePage({ status: PromotionalPageStatus.PUBLISHED });

    const updated = await service.updateStatus(
      'HIM2026000001',
      { status: PromotionalPageStatus.UNPUBLISHED },
      'admin@cureka.com',
    );

    expect(updated.storedStatus).toBe(PromotionalPageStatus.UNPUBLISHED);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'unpublish' }));
  });

  it('returns a published page on the public slug', async () => {
    stored = basePage({ status: PromotionalPageStatus.PUBLISHED });
    pagesRepository.findBySlug.mockResolvedValue(stored);

    const result = await service.findPublicBySlug('himalaya-buy-more-save-more');

    expect(result.slug).toBe('himalaya-buy-more-save-more');
    expect(result.status).toBe(PromotionalPageStatus.PUBLISHED);
    expect(result.preview).toBeUndefined();
  });

  it('returns not found for an unknown slug', async () => {
    await expect(service.findPublicBySlug('missing')).rejects.toThrow('Promotional page not found');
  });

  it('hides an unpublished page', async () => {
    pagesRepository.findBySlug.mockResolvedValue(
      basePage({ status: PromotionalPageStatus.UNPUBLISHED }),
    );

    await expect(service.findPublicBySlug('himalaya-buy-more-save-more')).rejects.toThrow(
      'Promotional page is not published',
    );
  });

  it('hides an expired page', async () => {
    pagesRepository.findBySlug.mockResolvedValue(
      basePage({
        status: PromotionalPageStatus.PUBLISHED,
        endAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    await expect(service.findPublicBySlug('himalaya-buy-more-save-more')).rejects.toThrow(
      'Promotional page has expired',
    );
  });

  it('hides an archived page', async () => {
    pagesRepository.findArchivedBySlug.mockResolvedValue(
      basePage({ status: PromotionalPageStatus.ARCHIVED, deletedAt: NOW }),
    );

    await expect(service.findPublicBySlug('himalaya-buy-more-save-more')).rejects.toThrow(
      'Promotional page is archived',
    );
  });

  it('replaces sections and records order and visibility', async () => {
    await service.replaceSections(
      'HIM2026000001',
      {
        sections: [
          {
            type: PromotionalSectionType.HERO_BANNER,
            title: 'Hero',
            sortOrder: 1,
            isActive: true,
          },
          {
            type: PromotionalSectionType.PRODUCT_COLLECTION,
            title: 'Kits',
            sortOrder: 0,
            isActive: false,
            items: [
              { targetType: PromotionalTargetType.PRODUCT, targetRefId: 'PRO2026000001' },
            ],
          },
        ],
      },
      'admin@cureka.com',
    );

    expect(pagesRepository.replaceChildren).toHaveBeenCalledWith(
      'page-id',
      [
        expect.objectContaining({ title: 'Hero', sortOrder: 1, isActive: true }),
        expect.objectContaining({ title: 'Kits', sortOrder: 0, isActive: false }),
      ],
      [],
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'sections_update',
        details: expect.objectContaining({
          productRefIds: ['PRO2026000001'],
          sortOrder: [1, 0],
          visibility: [true, false],
        }),
      }),
    );
  });

  it('does not save a page when a catalog reference is invalid', async () => {
    references.assertCatalogRefs.mockRejectedValue(
      new BadRequestException('Invalid product reference(s): PRO2026000001'),
    );

    await expect(
      service.create(
        {
          ...createDto,
          sections: [
            {
              type: PromotionalSectionType.PRODUCT_COLLECTION,
              items: [{ targetType: PromotionalTargetType.PRODUCT, targetRefId: 'PRO2026000001' }],
            },
          ],
        },
        'admin@cureka.com',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pagesRepository.create).not.toHaveBeenCalled();
  });

  it('returns not found when the admin page does not exist', async () => {
    pagesRepository.findByRefId.mockResolvedValue(null);
    await expect(service.findOne('HIM2026000001')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('previews a draft without requiring it to be published', async () => {
    const preview = await service.preview('HIM2026000001');
    expect(preview.preview).toBe(true);
    expect(preview.status).toBe(PromotionalPageStatus.DRAFT);
  });
});
