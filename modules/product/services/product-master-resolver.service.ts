import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityTarget, In, ObjectLiteral } from 'typeorm';
import { AttributesRepository } from '@modules/master/repositories/attributes.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { WellnessGoalsRepository } from '@modules/master/repositories/wellness-goals.repository';
import { ManufacturersRepository } from '@modules/master/repositories/manufacturers.repository';
import { PackersRepository } from '@modules/master/repositories/packers.repository';
import { ImportersRepository } from '@modules/master/repositories/importers.repository';
import { ProductNaturesRepository } from '@modules/master/repositories/product-natures.repository';
import { CountriesRepository } from '@modules/master/repositories/countries.repository';
import { CategoryFiltersRepository } from '@modules/master/repositories/category-filters.repository';
import { CreateProductDto } from '../dto/product.dto';
import { ProductCategoryFilterBindingDto } from '../dto/product-category-filter.dto';
import { IResolvedProductMasters } from '../interfaces/product-creation-context.interface';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductType } from '../enums/product-type.enum';
import { ProductFaqEntity } from '../entities/product-faq.entity';
import { AttributeEntity } from '@modules/master/entities/attribute.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Injectable()
export class ProductMasterResolverService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly packersRepository: PackersRepository,
    private readonly importersRepository: ImportersRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly productRelationsRepository: ProductRelationsRepository,
  ) {}

  async resolve(dto: CreateProductDto): Promise<IResolvedProductMasters> {
    const [
      productNature,
      category,
      brand,
      subCategory,
      subSubCategory,
      subSubSubCategory,
      manufacturer,
      packer,
      importer,
      countryOfOrigin,
      healthConcernIds,
      wellnessGoalIds,
      faqIds,
      attributeResolution,
    ] = await Promise.all([
      dto.productNatureRefId
        ? this.requireByRefId(
            this.productNaturesRepository.findByRefId.bind(this.productNaturesRepository),
            dto.productNatureRefId,
            'Product nature',
          )
        : Promise.resolve(null),
      this.requireByRefId(
        this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
        dto.categoryRefId,
        'Category',
      ),
      this.requireByRefId(
        this.brandsRepository.findByRefId.bind(this.brandsRepository),
        dto.brandRefId,
        'Brand',
      ),
      dto.subCategoryRefId
        ? this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subCategoryRefId,
            'Sub category',
          )
        : Promise.resolve(null),
      dto.subSubCategoryRefId
        ? this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subSubCategoryRefId,
            'Sub sub category',
          )
        : Promise.resolve(null),
      dto.subSubSubCategoryRefId
        ? this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subSubSubCategoryRefId,
            'Sub sub sub category',
          )
        : Promise.resolve(null),
      dto.manufacturerRefId
        ? this.requireByRefId(
            this.manufacturersRepository.findByRefId.bind(this.manufacturersRepository),
            dto.manufacturerRefId,
            'Manufacturer',
          )
        : Promise.resolve(null),
      dto.packerRefId
        ? this.requireByRefId(
            this.packersRepository.findByRefId.bind(this.packersRepository),
            dto.packerRefId,
            'Packer',
          )
        : Promise.resolve(null),
      dto.importerRefId
        ? this.requireByRefId(
            this.importersRepository.findByRefId.bind(this.importersRepository),
            dto.importerRefId,
            'Importer',
          )
        : Promise.resolve(null),
      dto.countryOfOriginRefId
        ? this.requireByRefId(
            this.countriesRepository.findByRefId.bind(this.countriesRepository),
            dto.countryOfOriginRefId,
            'Country of origin',
          )
        : Promise.resolve(null),
      this.resolveIdsByRefIds(
        HealthConcernEntity,
        dto.healthConcernRefIds ?? [],
        'Health concern',
      ),
      this.resolveIdsByRefIds(
        WellnessGoalEntity,
        dto.wellnessGoalRefIds ?? [],
        'Wellness goal',
      ),
      this.resolveFaqIds(dto.faqRefIds ?? []),
      this.resolveAttributes(dto),
    ]);
    const categoryFilterBindings = await this.resolveCategoryFilterBindings(
      dto.categoryFilters,
      category.id,
    );

    if (dto.productType === ProductType.VARIABLE && !attributeResolution.attributeIds.length) {
      throw new BadRequestException('attributeRefIds are required for variable products');
    }

    return {
      productNatureId: productNature?.id ?? null,
      categoryId: category.id,
      subCategoryId: subCategory?.id ?? null,
      subSubCategoryId: subSubCategory?.id ?? null,
      subSubSubCategoryId: subSubSubCategory?.id ?? null,
      brandId: brand.id,
      manufacturerId: manufacturer?.id ?? null,
      packerId: packer?.id ?? null,
      importerId: importer?.id ?? null,
      countryOfOriginId: countryOfOrigin?.id ?? null,
      healthConcernIds,
      wellnessGoalIds,
      faqIds,
      attributeIds: attributeResolution.attributeIds,
      attributeIdByRefId: attributeResolution.attributeIdByRefId,
      categoryFilterBindings,
    };
  }

  async resolveCategoryFilterBindings(
    bindings: ProductCategoryFilterBindingDto[] | undefined,
    categoryId?: string,
  ): Promise<Array<{ categoryFilterId: string; values: string[] }>> {
    const activeBindings = (bindings ?? []).filter(
      (binding) =>
        binding.categoryFilterRefId &&
        (binding.values ?? []).some((value) => String(value).trim()),
    );
    if (!activeBindings.length) return [];

    const uniqueKeys = [...new Set(activeBindings.map((binding) => binding.categoryFilterRefId))];
    const filters = await this.categoryFiltersRepository.findByRefIdsOrNames(uniqueKeys);
    const byRefId = new Map(filters.map((filter) => [filter.refId.toLowerCase(), filter]));
    const byName = new Map(filters.map((filter) => [filter.name.toLowerCase().trim(), filter]));
    const mergedValuesByFilterId = new Map<string, Set<string>>();

    for (const binding of activeBindings) {
      const lookupKey = binding.categoryFilterRefId.toLowerCase().trim();
      const filter = byRefId.get(lookupKey) ?? byName.get(lookupKey);
      if (!filter) {
        throw new NotFoundException(
          `Category filter "${binding.categoryFilterRefId}" not found`,
        );
      }
      if (filter.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(
          `Category filter "${filter.name}" is not active`,
        );
      }

      if (
        categoryId &&
        !filter.categories?.some((assignedCategory) => assignedCategory.id === categoryId)
      ) {
        throw new BadRequestException(
          `Category filter "${filter.name}" is not assigned to the selected category.`,
        );
      }

      const allowedValues = new Set((filter.values ?? []).map((value) => value.trim()));
      const uniqueValues = [
        ...new Set((binding.values ?? []).map((value) => value.trim()).filter(Boolean)),
      ];

      if (!uniqueValues.length) {
        continue;
      }

      for (const value of uniqueValues) {
        if (!allowedValues.has(value)) {
          throw new BadRequestException(
            `Value "${value}" is not allowed for category filter "${filter.name}"`,
          );
        }
      }

      const existing = mergedValuesByFilterId.get(filter.id) ?? new Set<string>();
      for (const value of uniqueValues) {
        existing.add(value);
      }
      mergedValuesByFilterId.set(filter.id, existing);
    }

    return [...mergedValuesByFilterId.entries()].map(([categoryFilterId, values]) => ({
      categoryFilterId,
      values: [...values],
    }));
  }

  async resolveAttributeIds(attributeRefIds: string[]): Promise<Map<string, string>> {
    const resolution = await this.buildAttributeResolution(attributeRefIds, attributeRefIds);
    return resolution.attributeIdByRefId;
  }

  private async resolveAttributes(dto: CreateProductDto): Promise<{
    attributeIds: string[];
    attributeIdByRefId: Map<string, string>;
  }> {
    const attributeRefIds = [
      ...new Set([
        ...(dto.attributeRefIds ?? []),
        ...(dto.variants ?? []).flatMap((variant) =>
          (variant.attributes ?? []).map((item) => item.attributeRefId),
        ),
      ]),
    ];

    return this.buildAttributeResolution(dto.attributeRefIds ?? [], attributeRefIds);
  }

  private async buildAttributeResolution(
    productAttributeRefIds: string[],
    allAttributeRefIds: string[],
  ): Promise<{
    attributeIds: string[];
    attributeIdByRefId: Map<string, string>;
  }> {
    if (!allAttributeRefIds.length) {
      return { attributeIds: [], attributeIdByRefId: new Map() };
    }

    const attributes = await this.attributesRepository.findByRefIds(allAttributeRefIds);
    const byRefId = new Map(attributes.map((attribute) => [attribute.refId, attribute]));
    const attributeIdByRefId = new Map<string, string>();
    const attributeIds: string[] = [];

    for (const refId of productAttributeRefIds) {
      const attribute = byRefId.get(refId);
      if (!attribute) {
        throw new NotFoundException(`Attribute with refId "${refId}" not found`);
      }
      attributeIds.push(attribute.id);
      attributeIdByRefId.set(refId, attribute.id);
    }

    for (const refId of allAttributeRefIds) {
      const attribute = byRefId.get(refId);
      if (!attribute) {
        throw new NotFoundException(`Attribute with refId "${refId}" not found`);
      }
      attributeIdByRefId.set(refId, attribute.id);
    }

    return { attributeIds, attributeIdByRefId };
  }

  private async resolveFaqIds(faqRefIds: string[]): Promise<string[]> {
    if (!faqRefIds.length) return [];

    const uniqueRefIds = [...new Set(faqRefIds)];
    const faqs = await this.dataSource.getRepository(ProductFaqEntity).find({
      where: { refId: In(uniqueRefIds) },
      select: ['id', 'refId'],
    });
    const byRefId = new Map(faqs.map((faq) => [faq.refId, faq.id]));

    return uniqueRefIds.map((refId) => {
      const id = byRefId.get(refId);
      if (!id) {
        throw new NotFoundException(`Product FAQ with refId "${refId}" not found`);
      }
      return id;
    });
  }

  private async resolveIdsByRefIds<T extends ObjectLiteral & { id: string; refId: string }>(
    entity: EntityTarget<T>,
    refIds: string[],
    label: string,
  ): Promise<string[]> {
    if (!refIds.length) return [];

    const uniqueRefIds = [...new Set(refIds)];
    const rows = await this.dataSource.getRepository(entity).find({
      where: { refId: In(uniqueRefIds) } as object,
      select: ['id', 'refId'] as (keyof T)[],
    });
    const byRefId = new Map(rows.map((row) => [row.refId, row.id]));

    return uniqueRefIds.map((refId) => {
      const id = byRefId.get(refId);
      if (!id) {
        throw new NotFoundException(`${label} with refId "${refId}" not found`);
      }
      return id;
    });
  }

  private async requireByRefId<T extends { id: string }>(
    finder: (refId: string) => Promise<T | null>,
    refId: string,
    label: string,
  ): Promise<T> {
    const entity = await finder(refId);
    if (!entity) throw new NotFoundException(`${label} with refId "${refId}" not found`);
    return entity;
  }
}
