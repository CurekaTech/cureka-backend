import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributesRepository } from '@modules/master/repositories/attributes.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { ManufacturersRepository } from '@modules/master/repositories/manufacturers.repository';
import { PackersRepository } from '@modules/master/repositories/packers.repository';
import { ImportersRepository } from '@modules/master/repositories/importers.repository';
import { ProductNaturesRepository } from '@modules/master/repositories/product-natures.repository';
import { CreateProductDto } from '../dto/product.dto';
import { IResolvedProductMasters } from '../interfaces/product-creation-context.interface';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';

@Injectable()
export class ProductMasterResolverService {
  constructor(
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly manufacturersRepository: ManufacturersRepository,
    private readonly packersRepository: PackersRepository,
    private readonly importersRepository: ImportersRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly productRelationsRepository: ProductRelationsRepository,
  ) {}

  async resolve(dto: CreateProductDto): Promise<IResolvedProductMasters> {
    const productNature = await this.requireByRefId(
      this.productNaturesRepository.findByRefId.bind(this.productNaturesRepository),
      dto.productNatureRefId,
      'Product nature',
    );
    const category = await this.requireByRefId(
      this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
      dto.categoryRefId,
      'Category',
    );

    const healthConcernIds: string[] = [];
    for (const refId of dto.healthConcernRefIds ?? []) {
      const entity = await this.requireByRefId(
        this.healthConcernsRepository.findByRefId.bind(this.healthConcernsRepository),
        refId,
        'Health concern',
      );
      healthConcernIds.push(entity.id);
    }

    const faqIds: string[] = [];
    for (const refId of dto.faqRefIds ?? []) {
      const productFaq = await this.productRelationsRepository.requireProductFaqByRefId(refId);
      faqIds.push(productFaq.id);
    }

    return {
      productNatureId: productNature.id,
      categoryId: category.id,
      subCategoryId: dto.subCategoryRefId
        ? (await this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subCategoryRefId,
            'Sub category',
          )).id
        : null,
      subSubCategoryId: dto.subSubCategoryRefId
        ? (await this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subSubCategoryRefId,
            'Sub sub category',
          )).id
        : null,
      subSubSubCategoryId: dto.subSubSubCategoryRefId
        ? (await this.requireByRefId(
            this.categoriesRepository.findByRefId.bind(this.categoriesRepository),
            dto.subSubSubCategoryRefId,
            'Sub sub sub category',
          )).id
        : null,
      brandId: dto.brandRefId
        ? (await this.requireByRefId(
            this.brandsRepository.findByRefId.bind(this.brandsRepository),
            dto.brandRefId,
            'Brand',
          )).id
        : null,
      manufacturerId: dto.manufacturerRefId
        ? (await this.requireByRefId(
            this.manufacturersRepository.findByRefId.bind(this.manufacturersRepository),
            dto.manufacturerRefId,
            'Manufacturer',
          )).id
        : null,
      packerId: dto.packerRefId
        ? (await this.requireByRefId(
            this.packersRepository.findByRefId.bind(this.packersRepository),
            dto.packerRefId,
            'Packer',
          )).id
        : null,
      importerId: dto.importerRefId
        ? (await this.requireByRefId(
            this.importersRepository.findByRefId.bind(this.importersRepository),
            dto.importerRefId,
            'Importer',
          )).id
        : null,
      healthConcernIds,
      faqIds,
    };
  }

  async resolveAttributeIds(attributeRefIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const refId of attributeRefIds) {
      const attribute = await this.attributesRepository.findByRefId(refId);
      if (!attribute) {
        throw new NotFoundException(`Attribute with refId "${refId}" not found`);
      }
      map.set(refId, attribute.id);
    }
    return map;
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
