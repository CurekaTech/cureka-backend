import { CreateProductDto } from '../dto/product.dto';
import { ProductEntity } from '../entities/product.entity';

type SpecificationFields = Pick<
  CreateProductDto,
  | 'description'
  | 'highlights'
  | 'expertAdvice'
  | 'keyIngredients'
  | 'otherIngredients'
  | 'preventiveNotes'
  | 'accessoriesSpecifications'
  | 'directionsOfUse'
  | 'feedingTable'
  | 'safetyInformation'
  | 'productWeight'
  | 'productDimensions'
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
>;

export const mapSpecificationFields = (
  dto: Partial<SpecificationFields>,
): Partial<ProductEntity> => ({
  ...(dto.description !== undefined && { description: dto.description ?? null }),
  ...(dto.highlights !== undefined && { highlights: dto.highlights ?? null }),
  ...(dto.expertAdvice !== undefined && { expertAdvice: dto.expertAdvice ?? null }),
  ...(dto.keyIngredients !== undefined && { keyIngredients: dto.keyIngredients ?? null }),
  ...(dto.otherIngredients !== undefined && { otherIngredients: dto.otherIngredients ?? null }),
  ...(dto.preventiveNotes !== undefined && { preventiveNotes: dto.preventiveNotes ?? null }),
  ...(dto.accessoriesSpecifications !== undefined && {
    accessoriesSpecifications: dto.accessoriesSpecifications ?? null,
  }),
  ...(dto.directionsOfUse !== undefined && { directionsOfUse: dto.directionsOfUse ?? null }),
  ...(dto.feedingTable !== undefined && { feedingTable: dto.feedingTable ?? null }),
  ...(dto.safetyInformation !== undefined && { safetyInformation: dto.safetyInformation ?? null }),
  ...(dto.productWeight !== undefined && { productWeight: dto.productWeight ?? null }),
  ...(dto.productDimensions !== undefined && { productDimensions: dto.productDimensions ?? null }),
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
});
