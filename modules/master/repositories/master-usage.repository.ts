import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductHealthConcernEntity } from '@modules/product/entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '@modules/product/entities/product-wellness-goal.entity';
import { ProductAttributeMappingEntity } from '@modules/product/entities/product-attribute-mapping.entity';
import { VariantAttributeValueEntity } from '@modules/product/entities/variant-attribute-value.entity';
import { CategoriesRepository } from './categories.repository';
import { CountriesRepository } from './countries.repository';
import { StatesRepository } from './states.repository';

@Injectable()
export class MasterUsageRepository {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ProductHealthConcernEntity)
    private readonly productHealthConcernRepo: Repository<ProductHealthConcernEntity>,
    @InjectRepository(ProductWellnessGoalEntity)
    private readonly productWellnessGoalRepo: Repository<ProductWellnessGoalEntity>,
    @InjectRepository(ProductAttributeMappingEntity)
    private readonly productAttributeMappingRepo: Repository<ProductAttributeMappingEntity>,
    @InjectRepository(VariantAttributeValueEntity)
    private readonly variantAttributeValueRepo: Repository<VariantAttributeValueEntity>,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly countriesRepository: CountriesRepository,
    private readonly statesRepository: StatesRepository,
    private readonly dataSource: DataSource,
  ) {}

  countChildCategories(categoryId: string): Promise<number> {
    return this.categoriesRepository.countChildren(categoryId);
  }

  countProductsReferencingCategory(categoryId: string): Promise<number> {
    return this.productRepo
      .createQueryBuilder('product')
      .where(
        '(product.categoryId = :categoryId OR product.subCategoryId = :categoryId OR product.subSubCategoryId = :categoryId OR product.subSubSubCategoryId = :categoryId)',
        { categoryId },
      )
      .getCount();
  }

  countManufacturersByCategoryId(categoryId: string): Promise<number> {
    return this.countJunctionRows('manufacturer_categories', 'category_id', categoryId);
  }

  countProductsByBrandId(brandId: string): Promise<number> {
    return this.productRepo.count({ where: { brandId } });
  }

  countProductsByManufacturerId(manufacturerId: string): Promise<number> {
    return this.productRepo.count({ where: { manufacturerId } });
  }

  countProductsByPackerId(packerId: string): Promise<number> {
    return this.productRepo.count({ where: { packerId } });
  }

  countProductsByImporterId(importerId: string): Promise<number> {
    return this.productRepo.count({ where: { importerId } });
  }

  countProductsByProductNatureId(productNatureId: string): Promise<number> {
    return this.productRepo.count({ where: { productNatureId } });
  }

  countProductsByCountryOfOriginId(countryId: string): Promise<number> {
    return this.productRepo.count({ where: { countryOfOriginId: countryId } });
  }

  countProductsByHealthConcernId(healthConcernId: string): Promise<number> {
    return this.productHealthConcernRepo.count({ where: { healthConcernId } });
  }

  countProductsByWellnessGoalId(wellnessGoalId: string): Promise<number> {
    return this.productWellnessGoalRepo.count({ where: { wellnessGoalId } });
  }

  async countAttributeUsages(attributeId: string): Promise<number> {
    const [productMappings, variantValues, categoryLinks] = await Promise.all([
      this.productAttributeMappingRepo.count({ where: { attributeId } }),
      this.variantAttributeValueRepo.count({ where: { attributeId } }),
      this.countJunctionRows('category_attributes', 'attribute_id', attributeId),
    ]);

    return productMappings + variantValues + categoryLinks;
  }

  countStatesByCountryId(countryId: string): Promise<number> {
    return this.countriesRepository.countStates(countryId);
  }

  countCitiesByStateId(stateId: string): Promise<number> {
    return this.statesRepository.countCities(stateId);
  }

  private async countJunctionRows(
    tableName: string,
    columnName: string,
    value: string,
  ): Promise<number> {
    const result = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::int AS count FROM ${tableName} WHERE ${columnName} = $1`,
      [value],
    );
    return Number(result[0]?.count ?? 0);
  }
}
