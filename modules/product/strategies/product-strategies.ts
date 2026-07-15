import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductType } from '../enums/product-type.enum';
import { CreateProductDto } from '../dto/product.dto';
import { IResolvedProductMasters } from '../interfaces/product-creation-context.interface';
import { IProductCreationStrategy } from '../strategies/interfaces/product-creation.strategy';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { validateUniqueVariantCombinations } from '../validators/variant.validator';

@Injectable()
export class SimpleProductStrategy implements IProductCreationStrategy {
  constructor(private readonly variantsRepository: ProductVariantsRepository) {}

  supports(productType: ProductType): boolean {
    return productType === ProductType.SIMPLE;
  }

  async createVariants(
    manager: EntityManager,
    product: ProductEntity,
    dto: CreateProductDto,
    _masters: IResolvedProductMasters,
    attributeIdByRefId: Map<string, string>,
  ): Promise<void> {
    const variants = dto.variants?.length
      ? dto.variants
      : [
          {
            sku: `${product.refId}-DEFAULT`,
            mrp: 0,
            sellingPrice: 0,
            stock: 0,
          },
        ];

    if (variants.length !== 1) {
      throw new BadRequestException('Simple products must have exactly one variant');
    }

    if (variants[0]?.attributes?.length) {
      throw new BadRequestException('Simple products cannot have variant attributes');
    }

    const [variant] = variants;
    const variantsWithExpiry = [
      {
        ...variant!,
        expiryDate: variant!.expiryDate ?? dto.expiryDate,
      },
    ];

    await this.variantsRepository.createVariants(
      manager,
      product.id,
      product.slug,
      variantsWithExpiry,
      attributeIdByRefId,
    );
  }
}

@Injectable()
export class VariableProductStrategy implements IProductCreationStrategy {
  constructor(private readonly variantsRepository: ProductVariantsRepository) {}

  supports(productType: ProductType): boolean {
    return productType === ProductType.VARIABLE;
  }

  async createVariants(
    manager: EntityManager,
    product: ProductEntity,
    dto: CreateProductDto,
    _masters: IResolvedProductMasters,
    attributeIdByRefId: Map<string, string>,
  ): Promise<void> {
    const variants = dto.variants ?? [];
    if (!variants.length) {
      throw new BadRequestException('Variable products require at least one variant');
    }

    validateUniqueVariantCombinations(
      variants.map((variant) =>
        (variant.attributes ?? []).map((item) => {
          const attributeId = attributeIdByRefId.get(item.attributeRefId);
          if (!attributeId) {
            throw new BadRequestException(`Attribute refId "${item.attributeRefId}" not found`);
          }
          return { attributeId, value: item.value };
        }),
      ),
    );

    await this.variantsRepository.createVariants(manager, product.id, product.slug, variants, attributeIdByRefId);
  }
}

@Injectable()
export class BundleProductStrategy implements IProductCreationStrategy {
  constructor(
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly productsRepository: ProductsRepository,
  ) {}

  supports(productType: ProductType): boolean {
    return productType === ProductType.BUNDLE;
  }

  async createVariants(
    manager: EntityManager,
    product: ProductEntity,
    dto: CreateProductDto,
    _masters: IResolvedProductMasters,
    attributeIdByRefId: Map<string, string>,
  ): Promise<void> {
    const bundleItems = dto.bundleItems ?? [];
    if (!bundleItems.length) {
      throw new BadRequestException('Bundle products require at least one bundle item');
    }

    const childRefIds = bundleItems.map((item) => item.childProductRefId);
    const childIdsByRefId = await this.productsRepository.findIdsByRefIds(childRefIds, manager);

    const resolvedItems: Array<{ childProductId: string; quantity: number }> = [];
    for (const item of bundleItems) {
      const childProductId = childIdsByRefId.get(item.childProductRefId);
      if (!childProductId) {
        throw new BadRequestException(
          `Child product with refId "${item.childProductRefId}" not found`,
        );
      }
      if (childProductId === product.id) {
        throw new BadRequestException('Bundle cannot include itself as a child product');
      }
      resolvedItems.push({ childProductId, quantity: item.quantity });
    }

    await this.relationsRepository.syncBundles(manager, product.id, resolvedItems);

    if (dto.variants?.length) {
      if (dto.variants.length !== 1) {
        throw new BadRequestException('Bundle products support exactly one pricing variant');
      }
      await this.variantsRepository.createVariants(
        manager,
        product.id,
        product.slug,
        dto.variants,
        attributeIdByRefId,
      );
    }
  }
}

@Injectable()
export class ProductStrategyFactory {
  constructor(
    private readonly simpleStrategy: SimpleProductStrategy,
    private readonly variableStrategy: VariableProductStrategy,
    private readonly bundleStrategy: BundleProductStrategy,
  ) {}

  resolve(productType: ProductType): IProductCreationStrategy {
    const strategy = [this.simpleStrategy, this.variableStrategy, this.bundleStrategy].find((item) =>
      item.supports(productType),
    );
    if (!strategy) {
      throw new BadRequestException(`Unsupported product type: ${productType}`);
    }
    return strategy;
  }
}
