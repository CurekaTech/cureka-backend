import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions } from '@packages/common';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PublicMasterQueryDto } from '../dto/public-master-query.dto';
import { PublicMasterType } from '../enums/public-master-type.enum';
import { IPublicMasterListResponse, IPublicCategoryListItem } from '../interfaces/public-master.interface';
import { mapBrandEntitiesToPublicListItems } from '../mappers/public-brand.mapper';
import {
  buildPublicCategoryListTree,
  mapCategoryEntitiesToPublicListItems,
} from '../mappers/public-category.mapper';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { IPublicCoupon } from '../interfaces/public-coupon.interface';
import { mapCouponEntitiesToPublic } from '../mappers/public-coupon.mapper';

const BRAND_MEDIA_FIELDS = ['logo'] as const;
const CATEGORY_MEDIA_FIELDS = ['image', 'banner', 'faqBanner'] as const;

@Injectable()
export class PublicCommonService {
  constructor(
    private readonly couponsRepository: CouponsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async findActiveCoupons(): Promise<IPublicCoupon[]> {
    const coupons = await this.couponsRepository.findAllActiveValid();
    return mapCouponEntitiesToPublic(coupons);
  }

  async findMasters(query: PublicMasterQueryDto): Promise<IPublicMasterListResponse> {
    const paginationOptions = buildPaginationOptions(query);

    switch (query.type) {
      case PublicMasterType.BRAND: {
        const { data, total } = await this.brandsRepository.findPublicPaginated(paginationOptions);
        const mapped = mapBrandEntitiesToPublicListItems(data);
        const enriched = await this.storageUrlEnricher.enrichManyFields(mapped, [...BRAND_MEDIA_FIELDS]);
        return {
          type: query.type,
          ...buildPaginatedResult(enriched, total, paginationOptions),
        };
      }

      case PublicMasterType.CATEGORY: {
        if (query.slug) {
          return this.findCategoryBySlug(query);
        }

        const parentCategoryId = await this.resolveParentCategoryId(query.parentCategoryRefId);
        const { data, total } = await this.categoriesRepository.findPublicPaginated({
          ...paginationOptions,
          hierarchyLevel: query.categoryHierarchyLevel,
          parentCategoryId,
        });
        const mapped = mapCategoryEntitiesToPublicListItems(data);
        const enriched = await this.storageUrlEnricher.enrichManyFields(mapped, [...CATEGORY_MEDIA_FIELDS]);
        return {
          type: query.type,
          ...buildPaginatedResult(enriched, total, paginationOptions),
        };
      }
    }
  }

  private async findCategoryBySlug(
    query: PublicMasterQueryDto,
  ): Promise<IPublicMasterListResponse<IPublicCategoryListItem>> {
    const category = await this.categoriesRepository.findActiveBySlug(query.slug!);
    if (!category) {
      throw new NotFoundException(`Category with slug "${query.slug}" not found`);
    }

    const descendants = await this.categoriesRepository.findActiveDescendantsOf(category.id);
    const mapped = buildPublicCategoryListTree(category, descendants);
    const enriched = await this.enrichCategoryListItemTree(mapped);

    const paginationOptions = buildPaginationOptions(query);

    return {
      type: query.type,
      data: [enriched],
      total: 1,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    };
  }

  private async enrichCategoryListItemTree(
    item: IPublicCategoryListItem,
  ): Promise<IPublicCategoryListItem> {
    const enriched = await this.storageUrlEnricher.enrichFields(item, [...CATEGORY_MEDIA_FIELDS]);
    if (!item.children?.length) {
      return enriched;
    }

    const enrichedChildren = await Promise.all(
      item.children.map((child) => this.enrichCategoryListItemTree(child)),
    );

    return { ...enriched, children: enrichedChildren };
  }

  private async resolveParentCategoryId(
    parentCategoryRefId?: string,
  ): Promise<string | undefined> {
    if (!parentCategoryRefId) {
      return undefined;
    }

    const parent = await this.categoriesRepository.findActiveByRefId(parentCategoryRefId);
    if (!parent) {
      throw new NotFoundException(
        `Parent category with refId "${parentCategoryRefId}" not found`,
      );
    }

    return parent.id;
  }
}
