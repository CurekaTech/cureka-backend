import { CreateProductDto } from '../dto/product.dto';
import { assignStoredAltText } from '@modules/master/utils/image-alt-text.util';
import { ProductEntity } from '../entities/product.entity';
import { normalizeProductInformation, ProductInformationLabelSortOrders, ProductInformationLabelRefIdsByName } from './product-information.util';

type SpecificationFields = Pick<
  CreateProductDto,
  | 'description'
  | 'components'
  | 'productInformation'
  | 'expiresInMonths'
  | 'returnAllowed'
  | 'returnPolicy'
  | 'returnWindowDays'
  | 'subscriptionEnabled'
  | 'codAvailable'
  | 'emiAvailable'
  | 'replaceAllowed'
  | 'replaceWindowDays'
  | 'metaTitle'
  | 'metaDescription'
  | 'metaKeywords'
  | 'sizeChart'
  | 'sizeChartAltText'
  | 'faqBanner'
  | 'faqBannerAltText'
  | 'externalProductId'
  | 'singleProductUrl'
  | 'packMetadata'
  | 'manufacturerAddress'
  | 'packerAddress'
  | 'importerAddress'
  | 'curatedBy'
  | 'curatedFor'
  | 'bundleIcon'
  | 'bundleIconAltText'
>;

export const mapSpecificationFields = (
  dto: Partial<SpecificationFields>,
  options?: {
    labelSortOrders?: ProductInformationLabelSortOrders;
    labelRefIdsByName?: ProductInformationLabelRefIdsByName;
  },
): Partial<ProductEntity> => ({
  ...(dto.description !== undefined && { description: dto.description ?? null }),
  ...(dto.components !== undefined && { components: dto.components ?? null }),
  ...(dto.productInformation !== undefined && {
    productInformation: normalizeProductInformation(dto.productInformation, options),
  }),
  ...(dto.expiresInMonths !== undefined && { expiresInMonths: Number.isFinite(dto.expiresInMonths) ? dto.expiresInMonths : null }),
  ...(dto.returnAllowed !== undefined && { returnAllowed: dto.returnAllowed }),
  ...(dto.returnPolicy !== undefined && { returnPolicy: dto.returnPolicy ?? null }),
  ...(dto.returnWindowDays !== undefined && { returnWindowDays: Number.isFinite(dto.returnWindowDays) ? dto.returnWindowDays : null }),
  ...(dto.subscriptionEnabled !== undefined && { subscriptionEnabled: dto.subscriptionEnabled }),
  ...(dto.codAvailable !== undefined && { codAvailable: dto.codAvailable }),
  ...(dto.emiAvailable !== undefined && { emiAvailable: dto.emiAvailable }),
  ...(dto.replaceAllowed !== undefined && { replaceAllowed: dto.replaceAllowed }),
  ...(dto.replaceWindowDays !== undefined && { replaceWindowDays: Number.isFinite(dto.replaceWindowDays) ? dto.replaceWindowDays : null }),
  ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle ?? null }),
  ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription ?? null }),
  ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords ?? null }),
  ...(dto.sizeChart !== undefined && { sizeChart: dto.sizeChart ?? null }),
  ...(dto.faqBanner !== undefined && { faqBanner: dto.faqBanner ?? null }),
  ...(dto.externalProductId !== undefined && { externalProductId: dto.externalProductId ?? null }),
  ...(dto.singleProductUrl !== undefined && { singleProductUrl: dto.singleProductUrl ?? null }),
  ...(dto.packMetadata !== undefined && { packMetadata: dto.packMetadata ?? [] }),
  ...(dto.manufacturerAddress !== undefined && {
    manufacturerAddress: dto.manufacturerAddress ?? null,
  }),
  ...(dto.packerAddress !== undefined && {
    packerAddress: dto.packerAddress ?? null,
  }),
  ...(dto.importerAddress !== undefined && {
    importerAddress: dto.importerAddress ?? null,
  }),
  ...(dto.curatedBy !== undefined && { curatedBy: dto.curatedBy?.trim() || null }),
  ...(dto.curatedFor !== undefined && { curatedFor: dto.curatedFor?.trim() || null }),
  ...(dto.bundleIcon !== undefined && { bundleIcon: dto.bundleIcon ?? null }),
});

export const applyProductImageAltText = (
  payload: Partial<ProductEntity>,
  dto: Partial<SpecificationFields>,
  existing?: Pick<ProductEntity, 'sizeChart' | 'sizeChartAltText' | 'faqBanner' | 'faqBannerAltText' | 'bundleIcon' | 'bundleIconAltText'>,
): void => {
  const previous = existing ?? {
    sizeChart: null,
    sizeChartAltText: null,
    faqBanner: null,
    faqBannerAltText: null,
    bundleIcon: null,
    bundleIconAltText: null,
  };
  assignStoredAltText(payload, 'sizeChartAltText', {
    incoming: dto.sizeChartAltText,
    previousAlt: previous.sizeChartAltText,
    previousFile: previous.sizeChart,
    nextFile: payload.sizeChart !== undefined ? payload.sizeChart : previous.sizeChart,
  });
  assignStoredAltText(payload, 'faqBannerAltText', {
    incoming: dto.faqBannerAltText,
    previousAlt: previous.faqBannerAltText,
    previousFile: previous.faqBanner,
    nextFile: payload.faqBanner !== undefined ? payload.faqBanner : previous.faqBanner,
  });
  assignStoredAltText(payload, 'bundleIconAltText', {
    incoming: dto.bundleIconAltText,
    previousAlt: previous.bundleIconAltText,
    previousFile: previous.bundleIcon,
    nextFile: payload.bundleIcon !== undefined ? payload.bundleIcon : previous.bundleIcon,
  });
};

/** Commerce flags / policy fields shared across product + all variants. */
export type SharedCommerceFields = Pick<
  ProductEntity,
  | 'subscriptionEnabled'
  | 'codAvailable'
  | 'emiAvailable'
  | 'returnAllowed'
  | 'returnPolicy'
  | 'returnWindowDays'
  | 'replaceAllowed'
  | 'replaceWindowDays'
>;

/**
 * Pick product-level commerce fields from a DTO so they can be cascaded to every variant.
 * Returns null when none of these fields are present in the payload.
 */
export const pickSharedCommerceFields = (
  dto: Partial<SpecificationFields>,
): Partial<SharedCommerceFields> | null => {
  const fields: Partial<SharedCommerceFields> = {
    ...(dto.subscriptionEnabled !== undefined && { subscriptionEnabled: dto.subscriptionEnabled }),
    ...(dto.codAvailable !== undefined && { codAvailable: dto.codAvailable }),
    ...(dto.emiAvailable !== undefined && { emiAvailable: dto.emiAvailable }),
    ...(dto.returnAllowed !== undefined && { returnAllowed: dto.returnAllowed }),
    ...(dto.returnPolicy !== undefined && { returnPolicy: dto.returnPolicy ?? null }),
    ...(dto.returnWindowDays !== undefined && {
      returnWindowDays: Number.isFinite(dto.returnWindowDays) ? dto.returnWindowDays : null,
    }),
    ...(dto.replaceAllowed !== undefined && { replaceAllowed: dto.replaceAllowed }),
    ...(dto.replaceWindowDays !== undefined && {
      replaceWindowDays: Number.isFinite(dto.replaceWindowDays) ? dto.replaceWindowDays : null,
    }),
  };

  return Object.keys(fields).length ? fields : null;
};
