import { CreateVariantDto } from '../dto/variant.dto';
import { IParsedVariant } from '../services/bulk-upload-parser.service';
import { extractDescriptionFromProductInformation } from './variant-details-payload.util';

export const mapParsedVariantToDetailDto = (
  variant: IParsedVariant,
  refs: {
    manufacturerRefId?: string;
    packerRefId?: string;
    importerRefId?: string;
    countryOfOriginRefId?: string;
    healthConcernRefIds?: string[];
    wellnessGoalRefIds?: string[];
  },
  options?: {
    sizeChart?: CreateVariantDto['sizeChart'];
    resolvedManufacturerAddress?: string;
  },
): Partial<CreateVariantDto> => ({
  displayName: variant.displayName,
  description: extractDescriptionFromProductInformation(variant.productInformation) ?? undefined,
  productInformation: variant.productInformation,
  customFaqs: variant.faqs.length ? variant.faqs : undefined,
  metaTitle: variant.metaTitle,
  metaDescription: variant.metaDescription,
  metaKeywords: variant.metaKeywords.length ? variant.metaKeywords : undefined,
  components: variant.components,
  subscriptionEnabled: variant.subscriptionEnabled,
  codAvailable: variant.codAvailable,
  emiAvailable: variant.emiAvailable,
  returnAllowed: variant.returnAllowed,
  returnPolicy: variant.returnPolicy,
  returnWindowDays: variant.returnWindowDays,
  replaceAllowed: variant.replaceAllowed,
  replaceWindowDays: variant.replaceWindowDays,
  manufacturerRefId: refs.manufacturerRefId,
  packerRefId: refs.packerRefId,
  importerRefId: refs.importerRefId,
  manufacturerAddress:
    variant.manufacturerAddress?.trim() || options?.resolvedManufacturerAddress || undefined,
  packerAddress: variant.packerAddress,
  importerAddress: variant.importerAddress,
  countryOfOriginRefId: refs.countryOfOriginRefId,
  expiresInMonths: variant.expiresInMonths,
  sizeChart: options?.sizeChart,
  singleProductUrl: variant.singleProductUrl,
  healthConcernRefIds: refs.healthConcernRefIds,
  wellnessGoalRefIds: refs.wellnessGoalRefIds,
  tagNames: variant.productTags.length ? variant.productTags : undefined,
  categoryFilters: variant.categoryFilters.length ? variant.categoryFilters : undefined,
  packMetadata: variant.packMetadata.length ? variant.packMetadata : undefined,
});
