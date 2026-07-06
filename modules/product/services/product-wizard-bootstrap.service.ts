import { Injectable, NotFoundException } from '@nestjs/common';
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
import { IProductWizardBootstrap } from '../interfaces/product-wizard-bootstrap.interface';
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

  async getBootstrap(query: ProductWizardBootstrapQueryDto): Promise<IProductWizardBootstrap> {
    const status = resolveMasterListStatus(
      query.status ?? MasterListStatusFilter.ACTIVE,
    );
    const parentCategoryId = await this.resolveParentCategoryId(query.parentCategoryRefId);

    const [
      brands,
      categories,
      healthConcerns,
      wellnessGoals,
      productTags,
      units,
      attributes,
      productInformationLabels,
      manufacturers,
      packers,
      importers,
      countries,
    ] = await Promise.all([
      this.brandsRepository.findAllByStatus(status),
      this.categoriesRepository.findForWizardBootstrap({
        status,
        hierarchyLevel: query.categoryHierarchyLevel,
        parentCategoryId,
      }),
      this.healthConcernsRepository.findAllByStatus(status),
      this.wellnessGoalsRepository.findAllByStatus(status),
      this.productTagsRepository.findAllByStatus(status),
      this.unitsRepository.findAllByStatus(status),
      this.attributesRepository.findAllByStatus(status),
      this.productInformationLabelsRepository.findAllByStatus(status),
      this.manufacturersRepository.findAllByStatus(status),
      this.packersRepository.findAllByStatus(status),
      this.importersRepository.findAllByStatus(status),
      this.countriesRepository.findAllByStatus(status),
    ]);

    const mappedCategories = this.mapCategoriesForWizard(categories, status);

    const [
      enrichedBrands,
      enrichedCategories,
      enrichedHealthConcerns,
      enrichedWellnessGoals,
      enrichedManufacturers,
      enrichedPackers,
      enrichedImporters,
    ] = await Promise.all([
      this.storageUrlEnricher.enrichManyFields(
        mapBrandEntitiesToResponse(brands),
        [...BRAND_MEDIA_FIELDS],
      ),
      this.storageUrlEnricher.enrichManyFields(mappedCategories, [...CATEGORY_MEDIA_FIELDS]),
      this.storageUrlEnricher.enrichManyFields(
        mapHealthConcernEntitiesToResponse(healthConcerns),
        [...HEALTH_CONCERN_MEDIA_FIELDS],
      ),
      this.storageUrlEnricher.enrichManyFields(
        mapWellnessGoalEntitiesToResponse(wellnessGoals),
        [...WELLNESS_GOAL_MEDIA_FIELDS],
      ),
      this.storageUrlEnricher.enrichManyFields(
        mapManufacturerEntitiesToResponse(manufacturers),
        [...MANUFACTURER_MEDIA_FIELDS],
      ),
      this.storageUrlEnricher.enrichManyFields(
        mapPackerEntitiesToResponse(packers),
        [...PACKER_MEDIA_FIELDS],
      ),
      this.storageUrlEnricher.enrichManyFields(
        mapImporterEntitiesToResponse(importers),
        [...IMPORTER_MEDIA_FIELDS],
      ),
    ]);

    return {
      brands: enrichedBrands,
      categories: enrichedCategories,
      healthConcerns: enrichedHealthConcerns,
      wellnessGoals: enrichedWellnessGoals,
      productTags: mapProductTagEntitiesToResponse(productTags),
      units: mapUnitEntitiesToResponse(units),
      attributes: mapAttributeEntitiesToResponse(attributes),
      productInformationLabels: mapProductInformationLabelEntitiesToResponse(
        productInformationLabels,
      ),
      manufacturers: enrichedManufacturers,
      packers: enrichedPackers,
      importers: enrichedImporters,
      countries: mapCountryEntitiesToResponse(countries),
    };
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
    categories: Awaited<ReturnType<CategoriesRepository['findForWizardBootstrap']>>,
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
