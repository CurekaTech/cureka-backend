import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager, In } from 'typeorm';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { AttributesRepository } from '@modules/master/repositories/attributes.repository';
import { AttributeEntity } from '@modules/master/entities/attribute.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { CartItemEntity } from '@modules/orders/entities/cart-item.entity';
import { SavedForLaterItemEntity } from '@modules/orders/entities/saved-for-later-item.entity';
import { ProductEntity } from '../entities/product.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import {
  CombineSimpleProductsDto,
  CombineSimpleProductsPreviewDto,
} from '../dto/combine-simple-products.dto';
import {
  ICombinePreviewAttribute,
  ICombinePreviewCurrentAttribute,
  ICombinePreviewProduct,
  ICombineSimpleProductsPreview,
  ICombineSimpleProductsResult,
} from '../interfaces/combine-simple-products.interface';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import {
  buildVariantCombinationKey,
  normalizeAttributeValue,
} from '../utils/variant-combination-key.util';
import {
  validateUniqueVariantCombinations,
  validateVariantAttributeScope,
  validateVariantAttributes,
} from '../validators/variant.validator';

type LoadedProduct = {
  product: ProductEntity;
  variants: ProductVariantEntity[];
};

type LoadedVariant = {
  product: ProductEntity;
  variant: ProductVariantEntity;
};

@Injectable()
export class CombineSimpleProductsService {
  private readonly logger = new Logger(CombineSimpleProductsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly attributesRepository: AttributesRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async preview(dto: CombineSimpleProductsPreviewDto): Promise<ICombineSimpleProductsPreview> {
    const productRefIds = assertUniqueRefIds(dto.productRefIds, 'productRefIds');
    const loaded = await this.loadCombinableProducts(productRefIds);
    this.assertCombineEligibility(loaded);

    const products: ICombinePreviewProduct[] = loaded.flatMap(({ product, variants }) =>
      variants.map((variant) => ({
        productRefId: product.refId,
        name: product.name,
        status: product.status,
        productType: product.productType,
        variantId: variant.id,
        sku: variant.sku,
        externalProductId: variant.externalProductId,
        sellingPrice: variant.sellingPrice,
        stock: variant.stock,
        outOfStock: variant.outOfStock,
        inCurekaInventory: variant.inCurekaInventory ?? false,
        variantTitle: (variant.displayName?.trim() || product.name).trim(),
        currentAttributes: mapCurrentAttributes(variant),
        brandId: product.brandId,
        categoryId: product.categoryId,
        subCategoryId: product.subCategoryId,
        subSubCategoryId: product.subSubCategoryId,
        subSubSubCategoryId: product.subSubSubCategoryId,
      })),
    );

    const attributes = dto.attributeRefIds?.length
      ? await this.loadPreviewAttributes(assertUniqueRefIds(dto.attributeRefIds, 'attributeRefIds'))
      : [];

    return { products, attributes };
  }

  async combine(dto: CombineSimpleProductsDto): Promise<ICombineSimpleProductsResult> {
    const productRefIds = uniqueRefIds(dto.assignments.map((row) => row.productRefId));
    if (productRefIds.length < 2) {
      throw new BadRequestException('assignments must include at least two products');
    }
    if (!productRefIds.includes(dto.targetProductRefId)) {
      throw new BadRequestException('targetProductRefId must be one of the assignment products');
    }

    const assignedVariantIds = assertUniqueRefIds(
      dto.assignments.map((row) => row.variantId),
      'assignments[].variantId',
    );

    const attributeRefIds = assertUniqueRefIds(dto.attributeRefIds, 'attributeRefIds');

    const loaded = await this.loadCombinableProducts(productRefIds);
    this.assertCombineEligibility(loaded);

    const byVariantId = new Map<string, LoadedVariant>();
    for (const row of loaded) {
      for (const variant of row.variants) {
        byVariantId.set(variant.id, { product: row.product, variant });
      }
    }

    this.assertAllActiveVariantsAssigned(byVariantId, dto.assignments);

    for (const assignment of dto.assignments) {
      const row = byVariantId.get(assignment.variantId);
      if (!row) {
        throw new BadRequestException(
          `variantId "${assignment.variantId}" is not an active variant of the selected products`,
        );
      }
      if (row.product.refId !== assignment.productRefId) {
        throw new BadRequestException(
          `variantId "${assignment.variantId}" does not belong to product "${assignment.productRefId}"`,
        );
      }
      this.assertAssignmentAttributes(assignment.attributes, attributeRefIds);
    }

    const attributes = await this.loadPreviewAttributes(attributeRefIds);
    const attributeByRefId = new Map(attributes.map((item) => [item.refId, item]));
    for (const assignment of dto.assignments) {
      this.assertAttributeValuesAllowed(assignment.attributes, attributeByRefId);
    }

    const attributeIdByRefId = await this.masterResolver.resolveAttributeIds(attributeRefIds);
    const attributeIds = attributeRefIds.map((refId) => {
      const attributeId = attributeIdByRefId.get(refId);
      if (!attributeId) {
        throw new NotFoundException(`Attribute with refId "${refId}" not found`);
      }
      return attributeId;
    });

    const combinationInputs = dto.assignments.map((assignment) =>
      assignment.attributes.map((item) => {
        const attributeId = attributeIdByRefId.get(item.attributeRefId);
        if (!attributeId) {
          throw new NotFoundException(`Attribute with refId "${item.attributeRefId}" not found`);
        }
        return { attributeId, value: item.value };
      }),
    );
    for (const inputs of combinationInputs) {
      validateVariantAttributes(inputs);
    }
    validateUniqueVariantCombinations(combinationInputs);

    const target = loaded.find((row) => row.product.refId === dto.targetProductRefId)!;
    const movedRefIds = productRefIds.filter((refId) => refId !== dto.targetProductRefId);
    const allVariantIds = assignedVariantIds;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ProductEntity).update(
        { id: target.product.id },
        { productType: ProductType.VARIABLE },
      );
      await this.relationsRepository.syncProductAttributes(
        manager,
        target.product.id,
        attributeIds,
      );

      const variantRepo = manager.getRepository(ProductVariantEntity);
      const attributeValueRepo = manager.getRepository(VariantAttributeValueEntity);

      for (let index = 0; index < dto.assignments.length; index++) {
        const assignment = dto.assignments[index]!;
        const row = byVariantId.get(assignment.variantId)!;
        const attributeInputs = combinationInputs[index]!;
        const combinationKey = buildVariantCombinationKey(attributeInputs);
        const canonicalValues = this.canonicalAttributeValues(
          assignment.attributes,
          attributeByRefId,
        );

        const variantUpdate: Partial<ProductVariantEntity> = {
          productId: target.product.id,
          combinationKey,
        };
        const variantTitle = assignment.variantTitle?.trim();
        const attributeLabel = canonicalValues
          .map((item) => item.value?.trim())
          .filter(Boolean)
          .join(' / ');
        variantUpdate.displayName =
          variantTitle || attributeLabel || row.variant.displayName?.trim() || null;

        await variantRepo.update({ id: row.variant.id }, variantUpdate);

        await attributeValueRepo.delete({ variantId: row.variant.id });
        await attributeValueRepo.save(
          canonicalValues.map((item) =>
            attributeValueRepo.create({
              variantId: row.variant.id,
              attributeId: attributeIdByRefId.get(item.attributeRefId)!,
              value: item.value,
            }),
          ),
        );
      }

      await this.reparentMedia(
        manager,
        target.product.id,
        movedRefIds.map((refId) => loaded.find((row) => row.product.refId === refId)!.product.id),
        allVariantIds,
      );
      await this.rewriteOpenCartProductIds(manager, target.product.id, allVariantIds);

      const sourceIds = movedRefIds.map(
        (refId) => loaded.find((row) => row.product.refId === refId)!.product.id,
      );
      if (sourceIds.length) {
        await manager.getRepository(ProductEntity).softDelete({ id: In(sourceIds) });
      }
    });

    this.logger.log(
      `Combined ${allVariantIds.length} variants from ${productRefIds.length} products onto ${dto.targetProductRefId}; moved=${movedRefIds.join(',')}`,
    );

    for (const refId of movedRefIds) {
      await this.eventEmitter.emitAsync(
        EVENTS.PRODUCT_UPDATED,
        new ProductUpdatedEvent(refId, 'deleted'),
      );
    }
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(dto.targetProductRefId, 'updated'),
    );

    return {
      targetProductRefId: dto.targetProductRefId,
      productType: 'variable',
      variantIds: allVariantIds,
      movedProductRefIds: movedRefIds,
    };
  }

  private async loadCombinableProducts(productRefIds: string[]): Promise<LoadedProduct[]> {
    const products = await this.dataSource.getRepository(ProductEntity).find({
      where: { refId: In(productRefIds) },
    });
    const byRefId = new Map(products.map((product) => [product.refId, product]));
    const missing = productRefIds.filter((refId) => !byRefId.has(refId));
    if (missing.length) {
      throw new NotFoundException(`Product with refId "${missing[0]}" not found`);
    }

    const productIds = products.map((product) => product.id);
    const variants = await this.dataSource.getRepository(ProductVariantEntity).find({
      where: { productId: In(productIds), status: VariantStatus.ACTIVE },
      relations: ['attributeValues', 'attributeValues.attribute'],
      order: { sku: 'ASC' },
    });
    const variantsByProductId = new Map<string, ProductVariantEntity[]>();
    for (const variant of variants) {
      const list = variantsByProductId.get(variant.productId) ?? [];
      list.push(variant);
      variantsByProductId.set(variant.productId, list);
    }

    return productRefIds.map((refId) => {
      const product = byRefId.get(refId)!;
      if (product.productType === ProductType.BUNDLE) {
        throw new BadRequestException(`Product "${refId}" is a bundle and cannot be combined`);
      }
      if (product.productType !== ProductType.SIMPLE && product.productType !== ProductType.VARIABLE) {
        throw new BadRequestException(
          `Product "${refId}" is "${product.productType}" — only simple and variable products can be combined`,
        );
      }
      const productVariants = variantsByProductId.get(product.id) ?? [];
      if (!productVariants.length) {
        throw new BadRequestException(
          `Product "${refId}" must have at least one active variant to combine`,
        );
      }
      return { product, variants: productVariants };
    });
  }

  /**
   * All selected products must share brand + full category hierarchy
   * and be published (active).
   */
  private assertCombineEligibility(loaded: LoadedProduct[]): void {
    for (const { product } of loaded) {
      if (product.status !== ProductStatus.PUBLISHED) {
        throw new BadRequestException(
          `Product "${product.refId}" must be published (active) to combine. Current status: "${product.status}"`,
        );
      }
    }

    const first = loaded[0]!;
    for (let i = 1; i < loaded.length; i++) {
      const row = loaded[i]!;
      if (row.product.brandId !== first.product.brandId) {
        throw new BadRequestException(
          `All selected products must have the same brand. "${first.product.refId}" and "${row.product.refId}" differ`,
        );
      }
      if (row.product.categoryId !== first.product.categoryId) {
        throw new BadRequestException(
          `All selected products must belong to the same category. "${first.product.refId}" and "${row.product.refId}" differ`,
        );
      }
      if (row.product.subCategoryId !== first.product.subCategoryId) {
        throw new BadRequestException(
          `All selected products must belong to the same sub-category. "${first.product.refId}" and "${row.product.refId}" differ`,
        );
      }
      if (row.product.subSubCategoryId !== first.product.subSubCategoryId) {
        throw new BadRequestException(
          `All selected products must belong to the same sub-sub-category. "${first.product.refId}" and "${row.product.refId}" differ`,
        );
      }
      if (row.product.subSubSubCategoryId !== first.product.subSubSubCategoryId) {
        throw new BadRequestException(
          `All selected products must belong to the same sub-sub-sub-category. "${first.product.refId}" and "${row.product.refId}" differ`,
        );
      }
    }
  }

  private assertAllActiveVariantsAssigned(
    byVariantId: Map<string, LoadedVariant>,
    assignments: Array<{ variantId: string }>,
  ): void {
    const assigned = new Set(assignments.map((row) => row.variantId));
    const missing = [...byVariantId.keys()].filter((id) => !assigned.has(id));
    if (missing.length || assigned.size !== byVariantId.size) {
      throw new BadRequestException(
        'Every active variant of the selected products must be assigned exactly once',
      );
    }
  }

  private async loadPreviewAttributes(attributeRefIds: string[]): Promise<ICombinePreviewAttribute[]> {
    const entities = await this.attributesRepository.findByRefIds(attributeRefIds);
    const byRefId = new Map(entities.map((entity) => [entity.refId, entity]));
    return attributeRefIds.map((refId) => {
      const entity = byRefId.get(refId);
      if (!entity) {
        throw new NotFoundException(`Attribute with refId "${refId}" not found`);
      }
      if (entity.status !== MasterStatus.ACTIVE) {
        throw new BadRequestException(`Attribute "${refId}" is not active`);
      }
      return mapAttributePreview(entity);
    });
  }

  private assertAssignmentAttributes(
    attributes: Array<{ attributeRefId: string; value: string }>,
    attributeRefIds: string[],
  ): void {
    validateVariantAttributeScope(attributes, new Set(attributeRefIds));
    const assigned = new Set(attributes.map((item) => item.attributeRefId));
    if (assigned.size !== attributes.length) {
      throw new BadRequestException('Duplicate attributeRefId found within the same assignment');
    }
    for (const refId of attributeRefIds) {
      if (!assigned.has(refId)) {
        throw new BadRequestException(
          `Each assignment must include all selected attributes (missing "${refId}")`,
        );
      }
    }
    if (assigned.size !== attributeRefIds.length) {
      throw new BadRequestException('Assignment attributes must match attributeRefIds exactly');
    }
  }

  private assertAttributeValuesAllowed(
    attributes: Array<{ attributeRefId: string; value: string }>,
    attributeByRefId: Map<string, ICombinePreviewAttribute>,
  ): void {
    for (const item of attributes) {
      const attribute = attributeByRefId.get(item.attributeRefId);
      const allowed = attribute?.values?.filter((value) => value.trim()) ?? [];
      if (!allowed.length) continue;
      const match = allowed.find(
        (value) => normalizeAttributeValue(value) === normalizeAttributeValue(item.value),
      );
      if (!match) {
        throw new BadRequestException(
          `Value "${item.value}" is not allowed for attribute "${item.attributeRefId}"`,
        );
      }
    }
  }

  private canonicalAttributeValues(
    attributes: Array<{ attributeRefId: string; value: string }>,
    attributeByRefId: Map<string, ICombinePreviewAttribute>,
  ): Array<{ attributeRefId: string; value: string }> {
    return attributes.map((item) => {
      const allowed = attributeByRefId.get(item.attributeRefId)?.values ?? [];
      const match = allowed.find(
        (value) => normalizeAttributeValue(value) === normalizeAttributeValue(item.value),
      );
      return {
        attributeRefId: item.attributeRefId,
        value: (match ?? item.value).trim(),
      };
    });
  }

  private async reparentMedia(
    manager: EntityManager,
    targetProductId: string,
    sourceProductIds: string[],
    variantIds: string[],
  ): Promise<void> {
    const mediaRepo = manager.getRepository(ProductMediaEntity);
    if (variantIds.length) {
      await mediaRepo.update({ variantId: In(variantIds) }, { productId: targetProductId });
    }
    if (sourceProductIds.length) {
      await mediaRepo
        .createQueryBuilder()
        .update(ProductMediaEntity)
        .set({ productId: targetProductId })
        .where('product_id IN (:...sourceProductIds)', { sourceProductIds })
        .andWhere('variant_id IS NULL')
        .execute();
    }
  }

  private async rewriteOpenCartProductIds(
    manager: EntityManager,
    targetProductId: string,
    variantIds: string[],
  ): Promise<void> {
    if (!variantIds.length) return;
    await manager
      .getRepository(CartItemEntity)
      .update({ variantId: In(variantIds) }, { productId: targetProductId });
    await manager
      .getRepository(SavedForLaterItemEntity)
      .update({ variantId: In(variantIds) }, { productId: targetProductId });
  }
}

const uniqueRefIds = (values: string[]): string[] => [...new Set(values.map((value) => value.trim()))];

const assertUniqueRefIds = (values: string[], fieldName: string): string[] => {
  const unique = uniqueRefIds(values);
  if (unique.length !== values.length) {
    throw new BadRequestException(`${fieldName} must be unique`);
  }
  return unique;
};

const mapAttributePreview = (entity: AttributeEntity): ICombinePreviewAttribute => ({
  refId: entity.refId,
  name: entity.name,
  dataType: entity.dataType ?? null,
  values: entity.values ?? null,
  status: entity.status,
});

const mapCurrentAttributes = (variant: ProductVariantEntity): ICombinePreviewCurrentAttribute[] =>
  (variant.attributeValues ?? [])
    .filter((item) => item.attribute?.refId)
    .map((item) => ({
      attributeRefId: item.attribute.refId,
      attributeName: item.attribute.name,
      value: item.value,
    }));
