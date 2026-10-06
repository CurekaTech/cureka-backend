import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalPageSectionItemEntity } from '../entities/promotional-page-section-item.entity';
import { PromotionalPageSectionEntity } from '../entities/promotional-page-section.entity';
import { PromotionalPageTargetEntity } from '../entities/promotional-page-target.entity';
import { PromotionalPageEntity } from '../entities/promotional-page.entity';
import { NormalizedSection, NormalizedTarget } from '../utils/promotional-page-content.util';

export interface PromotionalPageFindOptions extends PaginationOptions {
  status?: PromotionalPageStatus;
  startDate?: Date;
  endDate?: Date;
  now: Date;
}

const PAGE_RELATIONS = {
  sections: { items: true },
  targets: true,
  coupon: {
    categoryMappings: { category: true },
    productMappings: { product: true },
    brandMappings: { brand: true },
  },
} as const;

/**
 * Matches `resolveEffectiveStatus`. Stored draft/unpublished/archived/expired stay as-is.
 * Published and scheduled follow the window.
 */
const EFFECTIVE_STATUS_SQL = `
CASE
  WHEN page.status IN ('draft', 'unpublished', 'archived', 'expired') THEN page.status::text
  WHEN page.end_at IS NOT NULL AND page.end_at <= :statusNow THEN 'expired'
  WHEN page.start_at IS NOT NULL AND page.start_at > :statusNow
    AND page.status IN ('published', 'scheduled') THEN 'scheduled'
  WHEN page.status IN ('published', 'scheduled') THEN 'published'
  ELSE page.status::text
END
`;

@Injectable()
export class PromotionalPagesRepository {
  constructor(
    @InjectRepository(PromotionalPageEntity)
    private readonly pages: Repository<PromotionalPageEntity>,
  ) {}

  async create(data: Partial<PromotionalPageEntity>): Promise<PromotionalPageEntity> {
    const entity = this.pages.create(data);
    return this.pages.save(entity);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.pages.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.pages
      .createQueryBuilder('page')
      .where('page.slug = :slug', { slug })
      .andWhere('page.deletedAt IS NULL');
    if (excludeRefId) {
      qb.andWhere('page.refId != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async findByRefId(refId: string): Promise<PromotionalPageEntity | null> {
    return this.pages.findOne({ where: { refId }, relations: PAGE_RELATIONS });
  }

  async findBySlug(slug: string): Promise<PromotionalPageEntity | null> {
    return this.pages.findOne({ where: { slug }, relations: PAGE_RELATIONS });
  }

  async findArchivedBySlug(slug: string): Promise<PromotionalPageEntity | null> {
    return this.pages.findOne({
      where: { slug, status: PromotionalPageStatus.ARCHIVED },
      withDeleted: true,
    });
  }

  async updateByRefId(
    refId: string,
    data: Partial<PromotionalPageEntity>,
  ): Promise<PromotionalPageEntity | null> {
    await this.pages.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.pages.softDelete({ refId });
  }

  async findAllPaginated(
    options: PromotionalPageFindOptions,
  ): Promise<{ data: PromotionalPageEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortable: Record<string, string> = {
      createdAt: 'page.createdAt',
      updatedAt: 'page.updatedAt',
      name: 'page.name',
      slug: 'page.slug',
      title: 'page.title',
      status: 'page.status',
      startAt: 'page.startAt',
      endAt: 'page.endAt',
    };
    const sortColumn = (options.sortBy && sortable[options.sortBy]) || 'page.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.pages
      .createQueryBuilder('page')
      .loadRelationCountAndMap('page.sectionCount', 'page.sections')
      .leftJoinAndSelect('page.coupon', 'coupon')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere(`${EFFECTIVE_STATUS_SQL} = :effectiveStatus`, {
        effectiveStatus: options.status,
        statusNow: options.now,
      });
    }

    if (options.search) {
      qb.andWhere('(page.name ILIKE :search OR page.slug ILIKE :search OR page.title ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    if (options.startDate) {
      qb.andWhere('(page.endAt IS NULL OR page.endAt >= :rangeStart)', {
        rangeStart: options.startDate,
      });
    }
    if (options.endDate) {
      qb.andWhere('(page.startAt IS NULL OR page.startAt <= :rangeEnd)', {
        rangeEnd: options.endDate,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async replaceChildren(
    pageId: string,
    sections: NormalizedSection[],
    targets: NormalizedTarget[],
  ): Promise<void> {
    await this.pages.manager.transaction(async (manager) => {
      await manager
        .createQueryBuilder()
        .delete()
        .from(PromotionalPageSectionItemEntity)
        .where(
          `section_id IN (SELECT id FROM promotional_page_sections WHERE promotional_page_id = :pageId)`,
          { pageId },
        )
        .execute();
      await manager.delete(PromotionalPageSectionEntity, { promotionalPageId: pageId });
      await manager.delete(PromotionalPageTargetEntity, { promotionalPageId: pageId });

      for (const section of sections) {
        const saved = await manager.save(
          PromotionalPageSectionEntity,
          manager.create(PromotionalPageSectionEntity, {
            promotionalPageId: pageId,
            type: section.type,
            title: section.title,
            subtitle: section.subtitle,
            config: section.config,
            sortOrder: section.sortOrder,
            isActive: section.isActive,
            startAt: section.startAt,
            endAt: section.endAt,
          }),
        );
        if (section.items.length) {
          await manager.save(
            PromotionalPageSectionItemEntity,
            section.items.map((item) =>
              manager.create(PromotionalPageSectionItemEntity, {
                sectionId: saved.id,
                targetType: item.targetType,
                targetRefId: item.targetRefId,
                sortOrder: item.sortOrder,
              }),
            ),
          );
        }
      }

      if (targets.length) {
        await manager.save(
          PromotionalPageTargetEntity,
          targets.map((target) =>
            manager.create(PromotionalPageTargetEntity, {
              promotionalPageId: pageId,
              targetType: target.targetType,
              targetRefId: target.targetRefId,
              sortOrder: target.sortOrder,
            }),
          ),
        );
      }
    });
  }
}
