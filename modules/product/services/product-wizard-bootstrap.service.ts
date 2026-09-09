import { Injectable, NotFoundException } from '@nestjs/common';
import { buildCursorPaginationOptions } from '@packages/common';
import { mapAttributeEntitiesToResponse } from '@modules/master/mappers/attribute.mapper';
import { mapBrandEntitiesToResponse } from '@modules/master/mappers/brand.mapper';
import { mapCategoryEntitiesToResponse } from '@modules/master/mappers/category.mapper';
import { mapCountryEntitiesToResponse } from '@modules/master/mappers/country.mapper';
import { mapHealthConcernEntitiesToResponse } from '@modules/master/mappers/health-concern.mapper';
import { mapImporterEntitiesToResponse } from '@modules/master/mappers/importer.mapper';
import { mapManufacturerEntitiesToResponse } from '@modules/master/mappers/manufacturer.mapper';
import { mapPackerEntitiesToResponse } from '@modules/master/mappers/packer.mapper';
import { mapUnitEntitiesToResponse } from '@modules/master/mappers/unit.mapper';
import { mapWellnessGoalEntitiesToResponse } from '@modules/master/mappers/wellness-goal.mapper';
import { AttributesRepository } from '@modules/master/repositories/attributes.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CountriesRepository } from '@modules/master/repositories/countries.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { ImportersRepository } from '@modules/master/repositories/importers.repository';
import { ManufacturersRepository } from '@modules/master/repositories/manufacturers.repository';
import { PackersRepository } from '@modules/master/repositories/packers.repository';
import { UnitsRepository } from '@modules/master/repositories/units.repository';
import { WellnessGoalsRepository } from '@modules/master/repositories/wellness-goals.repository';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { MasterListStatusFilter } from '@modules/master/enums/master-list-status-filter.enum';
import { resolveMasterListStatus } from '@modules/master/utils/master-list-query.util';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductWizardBootstrapQueryDto } from '../dto/product-wizard-bootstrap-query.dto';
import { ProductWizardMasterType } from '../enums/product-wizard-master-type.enum';
import { IProductWizardBootstrapResponse } from '../interfaces/product-wizard-bootstrap.interface';
import { mapProductInformationLabelEntitiesToResponse } from '../mappers/product-information-label.mapper';
import { mapProductTagEntitiesToResponse } from '../mappers/product-tag.mapper';
import { ProductInformationLabelsRepository } from '../repositories/product-information-labels.repository';
import { ProductTagsRepository } from '../repositories/product-tags.repository';
import { ICategory } from '@modules/master/interfaces/category.interface';

const BRAND_MEDIA_FIELDS = ['logo', 'banner'] as const;
const CATEGORY_MEDIA_FIELDS = ['image', 'banner'] as const;
const MANUFACTURER_MEDIA_FIELDS = ['logo'] as const;
const PACKER_MEDIA_FIELDS = ['logo'] as const;
const IMPORTER_MEDIA_FIELDS = ['logo'] as const;
const HEALTH_CONCERN_MEDIA_FIELDS = ['icon', 'banner'] as const;
const WELLNESS_GOAL_MEDIA_FIELDS = ['image'] as const;

@Injectable()
export class ProductWizardBootstrapService {
  constructor(
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly productTagsRepository: ProductTagsRepository,
    private readonly unitsRepository: UnitsRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly productInformationLabelsRepository: ProductInformationLabelsRepository,
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly packersRepository: PackersRepository,
    private readonly importersRepository: ImportersRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async getBootstrap(
    query: ProductWizardBootstrapQueryDto,
  ): Promise<IProductWizardBootstrapResponse> {
    const status = resolveMasterListStatus(
      query.status ?? MasterListStatusFilter.ACTIVE,
    );
    const pagination = buildCursorPaginationOptions(query);

    switch (query.type) {
      case ProductWizardMasterType.BRAND: {
        const page = await this.brandsRepository.findCursorPaginated({
          ...pagination,
          status,
          excludeComboBrand: query.excludeComboBrand,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapBrandEntitiesToResponse(page.data),
          [...BRAND_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.CATEGORY: {
        const parentCategoryId = await this.resolveParentCategoryId(query.parentCategoryRefId);
        const page = await this.categoriesRepository.findWizardCursorPaginated({
          ...pagination,
          status,
          hierarchyLevel: query.categoryHierarchyLevel,
          parentCategoryId,
        });
        const mappedCategories = this.mapCategoriesForWizard(page.data, status);
        const data = await this.storageUrlEnricher.enrichManyFields(
          mappedCategories,
          [...CATEGORY_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.HEALTH_CONCERN: {
        const page = await this.healthConcernsRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapHealthConcernEntitiesToResponse(page.data),
          [...HEALTH_CONCERN_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.WELLNESS_GOAL: {
        const page = await this.wellnessGoalsRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapWellnessGoalEntitiesToResponse(page.data),
          [...WELLNESS_GOAL_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.PRODUCT_TAG: {
        const page = await this.productTagsRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        return {
          type: query.type,
          data: mapProductTagEntitiesToResponse(page.data),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        };
      }

      case ProductWizardMasterType.UNIT: {
        const page = await this.unitsRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        return {
          type: query.type,
          data: mapUnitEntitiesToResponse(page.data),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        };
      }

      case ProductWizardMasterType.ATTRIBUTE: {
        const page = await this.attributesRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        return {
          type: query.type,
          data: mapAttributeEntitiesToResponse(page.data),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        };
      }

      case ProductWizardMasterType.PRODUCT_INFORMATION_LABEL: {
        const page = await this.productInformationLabelsRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        return {
          type: query.type,
          data: mapProductInformationLabelEntitiesToResponse(page.data),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        };
      }

      case ProductWizardMasterType.MANUFACTURER: {
        const page = await this.manufacturersRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapManufacturerEntitiesToResponse(page.data),
          [...MANUFACTURER_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.PACKER: {
        const page = await this.packersRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapPackerEntitiesToResponse(page.data),
          [...PACKER_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.IMPORTER: {
        const page = await this.importersRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        const data = await this.storageUrlEnricher.enrichManyFields(
          mapImporterEntitiesToResponse(page.data),
          [...IMPORTER_MEDIA_FIELDS],
        );
        return { type: query.type, data, nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit };
      }

      case ProductWizardMasterType.COUNTRY: {
        const page = await this.countriesRepository.findCursorPaginated({
          ...pagination,
          status,
        });
        return {
          type: query.type,
          data: mapCountryEntitiesToResponse(page.data),
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
        };
      }
    }
  }

  private async resolveParentCategoryId(
    parentCategoryRefId?: string,
  ): Promise<string | undefined> {
    if (parentCategoryRefId === undefined) {
      return undefined;
    }

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

  private mapCategoriesForWizard(
    categories: Awaited<ReturnType<CategoriesRepository['findWizardCursorPaginated']>>['data'],
    status?: MasterStatus,
  ): ICategory[] {
    return mapCategoryEntitiesToResponse(categories).map((category) => ({
      ...category,
      categoryFilters:
        status === MasterStatus.ACTIVE
          ? category.categoryFilters.filter((filter) => filter.status === MasterStatus.ACTIVE)
          : category.categoryFilters,
    }));
  }
}
