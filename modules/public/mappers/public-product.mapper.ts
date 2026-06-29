import { ProductEntity } from '@modules/product/entities/product.entity';
import { mapCategoryFilters } from '@modules/product/mappers/product.mapper';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import {
  IPublicCategorySummary,
  IPublicProductCard,
  IPublicProductDetail,
  IPublicProductPriceSummary,
  IPublicProductVariantSearchItem,
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

const mapCategorySummary = (category: CategoryEntity | null | undefined): IPublicCategorySummary | null => {
  if (!category) return null;
  return {
    refId: category.refId,
    name: category.name,
    slug: category.slug,
  };
};

const getVariantPrimaryImageUrl = (
  product: ProductEntity,
  variantId: string,
): IStorageFileReference | null => {
  const media = product.media ?? [];
  const variantMedia = media.filter((item) => item.variantId === variantId);
  const variantPrimary =
    variantMedia.find((item) => item.isPrimary) ?? variantMedia[0];
  if (variantPrimary?.url) {
    return variantPrimary.url;
  }

  const productMedia = media.filter((item) => !item.variantId);
  const productPrimary =
    productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? media[0];
  return productPrimary?.url ?? null;
};

export const mapVariantEntityToPublicSearchItem = (
  variant: ProductVariantEntity,
): IPublicProductVariantSearchItem => {
  const product = variant.product;

  return {
    refId: product.refId,
    name: product.name,
    productSlug: product.slug,
    variantSlug: variant.slug,
    primaryImageUrl: getVariantPrimaryImageUrl(product, variant.id),
    category: mapCategorySummary(product.category),
    subCategory: mapCategorySummary(product.subCategory),
    subSubCategory: mapCategorySummary(product.subSubCategory),
    subSubSubCategory: mapCategorySummary(product.subSubSubCategory),
    variantId: variant.id,
    sku: variant.sku,
    mrp: toNumber(variant.mrp) ?? 0,
    sellingPrice: toNumber(variant.sellingPrice) ?? 0,
    discountPercentage: toNumber(variant.discountPercentage),
    stock: variant.stock,
    weight: toNumber(variant.weight),
    weightUnit: variant.weightUnit,
    length: toNumber(variant.length),
    lengthUnit: variant.lengthUnit,
    width: toNumber(variant.width),
    widthUnit: variant.widthUnit,
    height: toNumber(variant.height),
    heightUnit: variant.heightUnit,
    status: variant.status,
    attributes: (variant.attributeValues ?? []).map((item) => ({
      attributeRefId: item.attribute?.refId ?? '',
      attributeName: item.attribute?.name ?? '',
      value: item.value,
    })),
  } as IPublicProductVariantSearchItem;
};

export const mapVariantEntitiesToPublicSearchItems = (
  variants: ProductVariantEntity[],
): IPublicProductVariantSearchItem[] => variants.map(mapVariantEntityToPublicSearchItem);

const getDefaultVariantId = (entity: ProductEntity): string | null => {
  const activeVariants = getActiveVariants(entity);
  if (!activeVariants.length) return null;

  const sorted = [...activeVariants].sort(
    (left, right) =>
      (toNumber(left.sellingPrice) ?? 0) - (toNumber(right.sellingPrice) ?? 0),
  );
  return sorted[0]?.id ?? null;
};

export const mapProductEntityToPublicCard = (entity: ProductEntity): IPublicProductCard =>
  ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  productType: entity.productType,
  defaultVariantId: getDefaultVariantId(entity),
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
  tags: (entity.tagMappings ?? []).map((mapping) => ({
    refId: mapping.tag?.refId ?? '',
    name: mapping.tag?.name ?? '',
    slug: mapping.tag?.slug ?? '',
  })),
  }) as IPublicProductCard;

export const mapProductEntitiesToPublicCards = (entities: ProductEntity[]): IPublicProductCard[] =>
  entities.map(mapProductEntityToPublicCard);

export const mapProductEntityToPublicDetail = (entity: ProductEntity): IPublicProductDetail =>
  ({
  id: entity.id,
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
  productInformation: entity.productInformation ?? [],
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
  sizeChart: entity.sizeChart,
  pricing: buildPriceSummary(entity),
  attributes: (entity.attributeMappings ?? []).map((mapping) => ({
    refId: mapping.attribute?.refId ?? '',
    name: mapping.attribute?.name ?? '',
  })),
  variants: getActiveVariants(entity).map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    slug: variant.slug,
    mrp: toNumber(variant.mrp) ?? 0,
    sellingPrice: toNumber(variant.sellingPrice) ?? 0,
    discountPercentage: toNumber(variant.discountPercentage),
    stock: variant.stock,
    weight: toNumber(variant.weight),
    weightUnit: variant.weightUnit,
    length: toNumber(variant.length),
    lengthUnit: variant.lengthUnit,
    width: toNumber(variant.width),
    widthUnit: variant.widthUnit,
    height: toNumber(variant.height),
    heightUnit: variant.heightUnit,
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
  categoryFilters: mapCategoryFilters(entity),
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
