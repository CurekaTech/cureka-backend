import { CreateVariantDto } from '../dto/variant.dto';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { IVariantInlineFaq } from '../interfaces/variant-details.interface';
import {
  normalizeProductInformation,
  ProductInformationLabelSortOrders,
} from './product-information.util';

export type VariantDetailMasterIds = {
  manufacturerId?: string | null;
  packerId?: string | null;
  importerId?: string | null;
  countryOfOriginId?: string | null;
};

export const extractDescriptionFromProductInformation = (
  productInformation?: Array<{ label: string; description: string }>,
): string | null => {
  const match = productInformation?.find(
    (item) => item.label.toLowerCase().trim() === 'description',
  );
  return match?.description?.trim() || null;
};

export const mapVariantDetailDtoToEntityColumns = (
  dto: CreateVariantDto,
  masterIds: VariantDetailMasterIds = {},
  options?: { labelSortOrders?: ProductInformationLabelSortOrders },
): Partial<ProductVariantEntity> => {
  const normalizedProductInformation =
    dto.productInformation !== undefined
      ? normalizeProductInformation(dto.productInformation, options?.labelSortOrders)
      : undefined;

  const description =
    dto.description !== undefined
      ? dto.description
      : normalizedProductInformation
        ? extractDescriptionFromProductInformation(normalizedProductInformation)
        : undefined;

  return {
    ...(dto.displayName !== undefined && { displayName: dto.displayName?.trim() || null }),
    ...(description !== undefined && { description }),
    ...(normalizedProductInformation !== undefined && {
      productInformation: normalizedProductInformation,
    }),
    ...(dto.customFaqs !== undefined && {
      faqs: (dto.customFaqs ?? []) as IVariantInlineFaq[],
    }),
    ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle ?? null }),
    ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription ?? null }),
    ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords ?? null }),
    ...(dto.components !== undefined && { components: dto.components ?? null }),
    ...(dto.subscriptionEnabled !== undefined && { subscriptionEnabled: dto.subscriptionEnabled }),
    ...(dto.codAvailable !== undefined && { codAvailable: dto.codAvailable }),
    ...(dto.emiAvailable !== undefined && { emiAvailable: dto.emiAvailable }),
    ...(dto.returnAllowed !== undefined && { returnAllowed: dto.returnAllowed }),
    ...(dto.returnPolicy !== undefined && { returnPolicy: dto.returnPolicy ?? null }),
    ...(dto.returnWindowDays !== undefined && { returnWindowDays: dto.returnWindowDays ?? null }),
    ...(dto.replaceAllowed !== undefined && { replaceAllowed: dto.replaceAllowed }),
    ...(dto.replaceWindowDays !== undefined && {
      replaceWindowDays: dto.replaceWindowDays ?? null,
    }),
    ...(dto.manufacturerAddress !== undefined && {
      manufacturerAddress: dto.manufacturerAddress ?? null,
    }),
    ...(dto.packerAddress !== undefined && { packerAddress: dto.packerAddress ?? null }),
    ...(dto.importerAddress !== undefined && { importerAddress: dto.importerAddress ?? null }),
    ...(dto.expiresInMonths !== undefined && { expiresInMonths: dto.expiresInMonths ?? null }),
    ...(dto.sizeChart !== undefined && { sizeChart: dto.sizeChart ?? null }),
    ...(dto.singleProductUrl !== undefined && { singleProductUrl: dto.singleProductUrl ?? null }),
    ...(dto.productPageUrl !== undefined && { productPageUrl: dto.productPageUrl ?? null }),
    ...(dto.healthConcernRefIds !== undefined && {
      healthConcernRefIds: dto.healthConcernRefIds ?? [],
    }),
    ...(dto.wellnessGoalRefIds !== undefined && {
      wellnessGoalRefIds: dto.wellnessGoalRefIds ?? [],
    }),
    ...(dto.tagNames !== undefined && { tagNames: dto.tagNames ?? [] }),
    ...(dto.categoryFilters !== undefined && { categoryFilters: dto.categoryFilters ?? [] }),
    ...(dto.packMetadata !== undefined && { packMetadata: dto.packMetadata ?? [] }),
    ...(masterIds.manufacturerId !== undefined && {
      manufacturerId: masterIds.manufacturerId ?? null,
    }),
    ...(masterIds.packerId !== undefined && { packerId: masterIds.packerId ?? null }),
    ...(masterIds.importerId !== undefined && { importerId: masterIds.importerId ?? null }),
    ...(masterIds.countryOfOriginId !== undefined && {
      countryOfOriginId: masterIds.countryOfOriginId ?? null,
    }),
  };
};

export const hasVariantDetailPayload = (dto: CreateVariantDto): boolean =>
  dto.displayName !== undefined ||
  dto.description !== undefined ||
  dto.productInformation !== undefined ||
  dto.customFaqs !== undefined ||
  dto.metaTitle !== undefined ||
  dto.metaDescription !== undefined ||
  dto.metaKeywords !== undefined ||
  dto.components !== undefined ||
  dto.subscriptionEnabled !== undefined ||
  dto.codAvailable !== undefined ||
  dto.emiAvailable !== undefined ||
  dto.returnAllowed !== undefined ||
  dto.returnPolicy !== undefined ||
  dto.returnWindowDays !== undefined ||
  dto.replaceAllowed !== undefined ||
  dto.replaceWindowDays !== undefined ||
  dto.manufacturerRefId !== undefined ||
  dto.packerRefId !== undefined ||
  dto.importerRefId !== undefined ||
  dto.manufacturerAddress !== undefined ||
  dto.packerAddress !== undefined ||
  dto.importerAddress !== undefined ||
  dto.countryOfOriginRefId !== undefined ||
  dto.expiresInMonths !== undefined ||
  dto.sizeChart !== undefined ||
  dto.singleProductUrl !== undefined ||
  dto.productPageUrl !== undefined ||
  dto.healthConcernRefIds !== undefined ||
  dto.wellnessGoalRefIds !== undefined ||
  dto.tagNames !== undefined ||
  dto.categoryFilters !== undefined ||
  dto.packMetadata !== undefined;
