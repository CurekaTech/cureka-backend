import { mapMasterFaqs } from '@modules/master/utils/master-faq.util';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { IVariantDetailFields, IVariantInlineFaq } from '../interfaces/variant-details.interface';
import { IProductInformationItem } from '../interfaces/product-information.interface';

export const mapVariantEntityToDetailFields = (
  variant: ProductVariantEntity,
): IVariantDetailFields => ({
  displayName: variant.displayName,
  description: variant.description,
  productInformation: (variant.productInformation ?? []) as IProductInformationItem[],
  faqs: mapMasterFaqs(variant.faqs ?? []) as IVariantInlineFaq[],
  metaTitle: variant.metaTitle,
  metaDescription: variant.metaDescription,
  metaKeywords: variant.metaKeywords,
  components: variant.components,
  subscriptionEnabled: variant.subscriptionEnabled,
  codAvailable: variant.codAvailable,
  emiAvailable: variant.emiAvailable,
  returnAllowed: variant.returnAllowed,
  returnPolicy: variant.returnPolicy,
  returnWindowDays: variant.returnWindowDays,
  replaceAllowed: variant.replaceAllowed,
  replaceWindowDays: variant.replaceWindowDays,
  manufacturerRefId: variant.manufacturer?.refId ?? null,
  manufacturerName: variant.manufacturer?.name ?? null,
  manufacturerAddress: variant.manufacturerAddress ?? variant.manufacturer?.address ?? null,
  packerRefId: variant.packer?.refId ?? null,
  packerName: variant.packer?.name ?? null,
  packerAddress: variant.packerAddress ?? variant.packer?.address ?? null,
  importerRefId: variant.importer?.refId ?? null,
  importerName: variant.importer?.name ?? null,
  importerAddress: variant.importerAddress ?? variant.importer?.address ?? null,
  countryOfOriginRefId: variant.countryOfOrigin?.refId ?? null,
  countryOfOriginName: variant.countryOfOrigin?.name ?? null,
  expiresInMonths: variant.expiresInMonths,
  sizeChart: variant.sizeChart,
  singleProductUrl: variant.singleProductUrl,
  productPageUrl: variant.productPageUrl,
  healthConcernRefIds: variant.healthConcernRefIds ?? [],
  wellnessGoalRefIds: variant.wellnessGoalRefIds ?? [],
  tagNames: variant.tagNames ?? [],
  categoryFilters: variant.categoryFilters ?? [],
  packMetadata: variant.packMetadata ?? [],
});

export const variantHasStoredDetail = (variant: ProductVariantEntity): boolean =>
  Boolean(
    variant.displayName ||
      variant.description ||
      (variant.productInformation?.length ?? 0) > 0 ||
      (variant.faqs?.length ?? 0) > 0 ||
      variant.metaTitle ||
      variant.metaDescription ||
      (variant.metaKeywords?.length ?? 0) > 0 ||
      variant.components ||
      variant.manufacturerId ||
      variant.packerId ||
      variant.importerId ||
      variant.manufacturerAddress ||
      variant.packerAddress ||
      variant.importerAddress ||
      variant.countryOfOriginId ||
      variant.expiresInMonths ||
      variant.sizeChart ||
      variant.singleProductUrl ||
      variant.productPageUrl ||
      (variant.healthConcernRefIds?.length ?? 0) > 0 ||
      (variant.wellnessGoalRefIds?.length ?? 0) > 0 ||
      (variant.tagNames?.length ?? 0) > 0 ||
      (variant.categoryFilters?.length ?? 0) > 0 ||
      (variant.packMetadata?.length ?? 0) > 0 ||
      variant.subscriptionEnabled ||
      variant.codAvailable ||
      variant.emiAvailable ||
      variant.returnAllowed ||
      variant.replaceAllowed,
  );
