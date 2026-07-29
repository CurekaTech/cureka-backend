import { BadRequestException } from '@nestjs/common';
import { CreateProductDto } from '../dto/product.dto';
import { CreateVariantDto } from '../dto/variant.dto';
import { ProductType } from '../enums/product-type.enum';

/**
 * Bundle products use a single internal pricing variant for MRP / selling price / stock
 * (same model as simple products). Frontend may send either `variants[0]` or top-level
 * `mrp` / `sellingPrice` / `stock` / `sku` / `discountPercentage` / `expiryDate` / `expiresIn`.
 */
export const normalizeBundleCreateDto = (dto: CreateProductDto): CreateProductDto => {
  if (dto.productType !== ProductType.BUNDLE) {
    return dto;
  }

  const variants = ensureBundlePricingVariants(dto);
  return {
    ...dto,
    productType: ProductType.BUNDLE,
    attributeRefIds: undefined,
    variants,
  };
};

export const ensureBundlePricingVariants = (
  dto: Pick<
    CreateProductDto,
    | 'name'
    | 'variants'
    | 'mrp'
    | 'sellingPrice'
    | 'stock'
    | 'sku'
    | 'discountPercentage'
    | 'expiryDate'
    | 'expiresIn'
    | 'description'
  >,
): CreateVariantDto[] => {
  if (dto.variants?.length) {
    if (dto.variants.length !== 1) {
      throw new BadRequestException('Bundle products support exactly one pricing variant');
    }
    const variant = dto.variants[0]!;
    if (variant.attributes?.length) {
      throw new BadRequestException('Bundle pricing variants cannot have attributes');
    }
    return [
      {
        ...variant,
        expiryDate: variant.expiryDate ?? dto.expiryDate,
        expiresIn: variant.expiresIn ?? dto.expiresIn,
        description: variant.description ?? dto.description,
      },
    ];
  }

  if (dto.mrp === undefined || dto.sellingPrice === undefined || dto.stock === undefined) {
    throw new BadRequestException(
      'Bundle products require pricing: provide mrp, sellingPrice, and stock (or a single variants[] entry)',
    );
  }

  const sku =
    dto.sku?.trim() ||
    `BND-${(dto.name ?? 'bundle')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}-${Date.now().toString(36).toUpperCase()}`;

  return [
    {
      sku,
      mrp: dto.mrp,
      sellingPrice: dto.sellingPrice,
      stock: dto.stock,
      discountPercentage: dto.discountPercentage,
      expiryDate: dto.expiryDate,
      expiresIn: dto.expiresIn,
      description: dto.description,
    },
  ];
};

export const resolveBundleChildItems = async (
  bundleItems: Array<{ childProductRefId: string; quantity: number }>,
  parentProductId: string,
  findIdsByRefIds: (refIds: string[]) => Promise<Map<string, string>>,
): Promise<Array<{ childProductId: string; quantity: number }>> => {
  if (!bundleItems.length) {
    throw new BadRequestException('Bundle must contain at least one product');
  }

  const childIdsByRefId = await findIdsByRefIds(bundleItems.map((item) => item.childProductRefId));
  const resolved: Array<{ childProductId: string; quantity: number }> = [];

  for (const item of bundleItems) {
    const childProductId = childIdsByRefId.get(item.childProductRefId);
    if (!childProductId) {
      throw new BadRequestException(
        `Child product with refId "${item.childProductRefId}" not found`,
      );
    }
    if (childProductId === parentProductId) {
      throw new BadRequestException('Bundle cannot include itself as a child product');
    }
    resolved.push({ childProductId, quantity: item.quantity });
  }

  return resolved;
};
