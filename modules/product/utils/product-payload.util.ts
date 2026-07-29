import { CreateProductDto } from '../dto/product.dto';
import { ProductEntity } from '../entities/product.entity';
import { normalizeProductInformation, ProductInformationLabelSortOrders } from './product-information.util';

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
  | 'externalProductId'
  | 'singleProductUrl'
  | 'packMetadata'
  | 'manufacturerAddress'
  | 'packerAddress'
  | 'importerAddress'
  | 'curatedBy'
  | 'curatedFor'
>;

export const mapSpecificationFields = (
  dto: Partial<SpecificationFields>,
  options?: { labelSortOrders?: ProductInformationLabelSortOrders },
): Partial<ProductEntity> => ({
  ...(dto.description !== undefined && { description: dto.description ?? null }),
  ...(dto.components !== undefined && { components: dto.components ?? null }),
  ...(dto.productInformation !== undefined && {
    productInformation: normalizeProductInformation(dto.productInformation, options?.labelSortOrders),
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
});
