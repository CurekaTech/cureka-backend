import { Injectable, NotFoundException } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions } from '@packages/common';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PublicMasterQueryDto } from '../dto/public-master-query.dto';
import { PublicMasterType } from '../enums/public-master-type.enum';
import { IPublicMasterListResponse } from '../interfaces/public-master.interface';
import { mapBrandEntitiesToPublicListItems } from '../mappers/public-brand.mapper';
import { mapCategoryEntitiesToPublicListItems } from '../mappers/public-category.mapper';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { IPublicCoupon } from '../interfaces/public-coupon.interface';
import { mapCouponEntitiesToPublic } from '../mappers/public-coupon.mapper';

const BRAND_MEDIA_FIELDS = ['logo'] as const;
const CATEGORY_MEDIA_FIELDS = ['image', 'banner'] as const;

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

  private async resolveParentCategoryId(
    parentCategoryRefId?: string,
  ): Promise<string | undefined> {
    if (!parentCategoryRefId) {
      return undefined;
    }

    const parent = await this.categoriesRepository.findByRefId(parentCategoryRefId);
    if (!parent) {
      throw new NotFoundException(
        `Parent category with refId "${parentCategoryRefId}" not found`,
      );
    }

    return parent.id;
  }
}
