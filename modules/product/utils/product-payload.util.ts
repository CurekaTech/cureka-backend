import { CreateProductDto } from '../dto/product.dto';
import { ProductEntity } from '../entities/product.entity';
import { normalizeProductInformation } from './product-information.util';

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
>;

export const mapSpecificationFields = (
  dto: Partial<SpecificationFields>,
): Partial<ProductEntity> => ({
  ...(dto.description !== undefined && { description: dto.description ?? null }),
  ...(dto.components !== undefined && { components: dto.components ?? null }),
  ...(dto.productInformation !== undefined && {
    productInformation: normalizeProductInformation(dto.productInformation),
  }),
  ...(dto.expiresInMonths !== undefined && { expiresInMonths: dto.expiresInMonths ?? null }),
  ...(dto.returnAllowed !== undefined && { returnAllowed: dto.returnAllowed }),
  ...(dto.returnPolicy !== undefined && { returnPolicy: dto.returnPolicy ?? null }),
  ...(dto.returnWindowDays !== undefined && { returnWindowDays: dto.returnWindowDays ?? null }),
  ...(dto.subscriptionEnabled !== undefined && { subscriptionEnabled: dto.subscriptionEnabled }),
  ...(dto.codAvailable !== undefined && { codAvailable: dto.codAvailable }),
  ...(dto.emiAvailable !== undefined && { emiAvailable: dto.emiAvailable }),
  ...(dto.replaceAllowed !== undefined && { replaceAllowed: dto.replaceAllowed }),
  ...(dto.replaceWindowDays !== undefined && { replaceWindowDays: dto.replaceWindowDays ?? null }),
  ...(dto.metaTitle !== undefined && { metaTitle: dto.metaTitle ?? null }),
  ...(dto.metaDescription !== undefined && { metaDescription: dto.metaDescription ?? null }),
  ...(dto.metaKeywords !== undefined && { metaKeywords: dto.metaKeywords ?? null }),
  ...(dto.sizeChart !== undefined && { sizeChart: dto.sizeChart ?? null }),
});
