import { ProductEntity } from '@modules/product/entities/product.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  IPublicProductCard,
  IPublicProductDetail,
  IPublicProductPriceSummary,
} from '../interfaces/public-product.interface';
import { IStorageFileReference } from '@packages/storage';

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : parseFloat(value);
};

const getActiveVariants = (entity: ProductEntity) =>
  (entity.variants ?? []).filter((variant) => variant.status === VariantStatus.ACTIVE);

const buildPriceSummary = (entity: ProductEntity): IPublicProductPriceSummary => {
  const activeVariants = getActiveVariants(entity);
  const sellingPrices = activeVariants.map((variant) => toNumber(variant.sellingPrice) ?? 0);
  const mrps = activeVariants.map((variant) => toNumber(variant.mrp) ?? 0);
  const discounts = activeVariants
    .map((variant) => toNumber(variant.discountPercentage))
    .filter((value): value is number => value !== null);

  return {
    minSellingPrice: sellingPrices.length ? Math.min(...sellingPrices) : 0,
    maxSellingPrice: sellingPrices.length ? Math.max(...sellingPrices) : 0,
    minMrp: mrps.length ? Math.min(...mrps) : 0,
    maxDiscountPercentage: discounts.length ? Math.max(...discounts) : null,
    inStock: activeVariants.some((variant) => variant.stock > 0),
  };
};

const getPrimaryImageUrl = (entity: ProductEntity): IStorageFileReference | null => {
  const media = entity.media ?? [];
  const primary = media.find((item) => item.isPrimary) ?? media[0];
  return primary?.url ?? null;
};

export const mapProductEntityToPublicCard = (entity: ProductEntity): IPublicProductCard =>
  ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  productType: entity.productType,
  categoryRefId: entity.category?.refId ?? '',
  categoryName: entity.category?.name ?? '',
  subCategoryRefId: entity.subCategory?.refId ?? null,
  subCategoryName: entity.subCategory?.name ?? null,
  brandRefId: entity.brand?.refId ?? null,
  brandName: entity.brand?.name ?? null,
  productNatureRefId: entity.productNature?.refId ?? null,
  productNatureName: entity.productNature?.name ?? null,
  primaryImageUrl: getPrimaryImageUrl(entity),
  pricing: buildPriceSummary(entity),
  subscriptionEnabled: entity.subscriptionEnabled,
  codAvailable: entity.codAvailable,
  publishedAt: entity.publishedAt,
  }) as IPublicProductCard;

export const mapProductEntitiesToPublicCards = (entities: ProductEntity[]): IPublicProductCard[] =>
  entities.map(mapProductEntityToPublicCard);

export const mapProductEntityToPublicDetail = (entity: ProductEntity): IPublicProductDetail =>
  ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  description: entity.description,
  components: entity.components,
  productType: entity.productType,
  productNatureRefId: entity.productNature?.refId ?? null,
  productNatureName: entity.productNature?.name ?? null,
  categoryRefId: entity.category?.refId ?? '',
  categoryName: entity.category?.name ?? '',
  subCategoryRefId: entity.subCategory?.refId ?? null,
  subCategoryName: entity.subCategory?.name ?? null,
  subSubCategoryRefId: entity.subSubCategory?.refId ?? null,
  subSubCategoryName: entity.subSubCategory?.name ?? null,
  subSubSubCategoryRefId: entity.subSubSubCategory?.refId ?? null,
  subSubSubCategoryName: entity.subSubSubCategory?.name ?? null,
  brandRefId: entity.brand?.refId ?? null,
  brandName: entity.brand?.name ?? null,
  manufacturerRefId: entity.manufacturer?.refId ?? null,
  manufacturerName: entity.manufacturer?.name ?? null,
  countryOfOriginRefId: entity.countryOfOrigin?.refId ?? null,
  countryOfOriginName: entity.countryOfOrigin?.name ?? null,
  highlights: entity.highlights,
  expertAdvice: entity.expertAdvice,
  keyIngredients: entity.keyIngredients,
  otherIngredients: entity.otherIngredients,
  preventiveNotes: entity.preventiveNotes,
  accessoriesSpecifications: entity.accessoriesSpecifications,
  directionsOfUse: entity.directionsOfUse,
  feedingTable: entity.feedingTable,
  safetyInformation: entity.safetyInformation,
  productWeight: entity.productWeight,
  productDimensions: entity.productDimensions,
  expiresInMonths: entity.expiresInMonths,
  subscriptionEnabled: entity.subscriptionEnabled,
  codAvailable: entity.codAvailable,
  emiAvailable: entity.emiAvailable,
  replaceAllowed: entity.replaceAllowed,
  replaceWindowDays: entity.replaceWindowDays,
  returnAllowed: entity.returnAllowed,
  returnPolicy: entity.returnPolicy,
  returnWindowDays: entity.returnWindowDays,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
  publishedAt: entity.publishedAt,
  pricing: buildPriceSummary(entity),
  attributes: (entity.attributeMappings ?? []).map((mapping) => ({
    refId: mapping.attribute?.refId ?? '',
    name: mapping.attribute?.name ?? '',
  })),
  variants: getActiveVariants(entity).map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    mrp: toNumber(variant.mrp) ?? 0,
    sellingPrice: toNumber(variant.sellingPrice) ?? 0,
    discountPercentage: toNumber(variant.discountPercentage),
    stock: variant.stock,
    status: variant.status,
    attributes: (variant.attributeValues ?? []).map((item) => ({
      attributeRefId: item.attribute?.refId ?? '',
      attributeName: item.attribute?.name ?? '',
      value: item.value,
    })),
  })),
  media: (entity.media ?? []).map((item) => ({
    id: item.id,
    type: item.type,
    url: item.url,
    sortOrder: item.sortOrder,
    isPrimary: item.isPrimary,
    variantId: item.variantId,
  })),
  healthConcerns: (entity.healthConcernMappings ?? []).map((mapping) => ({
    refId: mapping.healthConcern?.refId ?? '',
    name: mapping.healthConcern?.name ?? '',
  })),
  wellnessGoals: (entity.wellnessGoalMappings ?? []).map((mapping) => ({
    refId: mapping.wellnessGoal?.refId ?? '',
    name: mapping.wellnessGoal?.name ?? '',
    image: mapping.wellnessGoal?.image ?? null,
  })),
  tags: (entity.tagMappings ?? []).map((mapping) => ({
    refId: mapping.tag?.refId ?? '',
    name: mapping.tag?.name ?? '',
    slug: mapping.tag?.slug ?? '',
  })),
  faqs: (entity.faqMappings ?? []).map((mapping) => ({
    refId: mapping.productFaq?.refId ?? '',
    question: mapping.productFaq?.question ?? '',
    answer: mapping.productFaq?.answer ?? '',
  })),
  bundleItems: (entity.bundleItems ?? []).map((item) => ({
    childProductRefId: item.childProduct?.refId ?? '',
    childProductName: item.childProduct?.name ?? '',
    childProductSlug: item.childProduct?.slug ?? '',
    quantity: item.quantity,
  })),
  }) as unknown as IPublicProductDetail;
