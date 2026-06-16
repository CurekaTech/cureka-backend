import { BadRequestException } from '@nestjs/common';
import {
  buildVariantCombinationKey,
  findDuplicateCombinationKeys,
  IVariantAttributeInput,
} from '../utils/variant-combination-key.util';

export interface IVariantPricingInput {
  mrp: number;
  sellingPrice: number;
  discountPercentage?: number;
}

export const validateVariantPricing = (input: IVariantPricingInput): void => {
  if (input.sellingPrice > input.mrp) {
    throw new BadRequestException('sellingPrice must be less than or equal to mrp');
  }

  if (input.discountPercentage !== undefined) {
    if (input.discountPercentage < 0 || input.discountPercentage > 100) {
      throw new BadRequestException('discountPercentage must be between 0 and 100');
    }
  }
};

export const validateVariantAttributes = (
  attributes: IVariantAttributeInput[],
): void => {
  const attributeIds = attributes.map((item) => item.attributeId);
  const uniqueAttributeIds = new Set(attributeIds);

  if (uniqueAttributeIds.size !== attributeIds.length) {
    throw new BadRequestException('Duplicate attributeId found within the same variant');
  }

  for (const attribute of attributes) {
    if (!attribute.value?.trim()) {
      throw new BadRequestException('Variant attribute value cannot be empty');
    }
  }
};

export const validateUniqueVariantCombinations = (
  variantAttributes: IVariantAttributeInput[][],
): void => {
  const keys = variantAttributes.map((attributes) => buildVariantCombinationKey(attributes));
  const duplicates = findDuplicateCombinationKeys(keys);

  if (duplicates.length) {
    throw new BadRequestException(
      `Duplicate variant attribute combinations detected for this product`,
    );
  }
};

export const validateVariantAttributeScope = (
  variantAttributes: Array<{ attributeRefId: string }>,
  allowedAttributeRefIds: Set<string>,
): void => {
  for (const item of variantAttributes) {
    if (!allowedAttributeRefIds.has(item.attributeRefId)) {
      throw new BadRequestException(
        `Attribute refId "${item.attributeRefId}" is not configured for this product`,
      );
    }
  }
};

export const computeDiscountPercentage = (mrp: number, sellingPrice: number): number => {
  if (mrp <= 0) return 0;
  return Math.round(((mrp - sellingPrice) / mrp) * 10000) / 100;
};
