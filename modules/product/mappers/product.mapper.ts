import { ProductEntity } from '../entities/product.entity';
import {
  IProduct,
  IProductVariant,
  IProductVariantImage,
  IProductMedia,
  IProductTag,
  IProductFaq,
  IProductBundleItem,
  IProductAttribute,
  IProductWellnessGoal,
  IProductCategoryFilterBinding,
} from '../interfaces/product.interface';
import { IProductDetail } from '../interfaces/product-detail.interface';
import { mapCategoryEntityToDetailResponse } from '@modules/master/mappers/category.mapper';
import { mapBrandEntityToResponse } from '@modules/master/mappers/brand.mapper';
import { mapProductNatureEntityToResponse } from '@modules/master/mappers/product-nature.mapper';
import { mapManufacturerEntityToResponse } from '@modules/master/mappers/manufacturer.mapper';
import { mapPackerEntityToResponse } from '@modules/master/mappers/packer.mapper';
import { mapImporterEntityToResponse } from '@modules/master/mappers/importer.mapper';
import { mapCountryEntityToResponse } from '@modules/master/mappers/country.mapper';
import { mapHealthConcernEntityToResponse } from '@modules/master/mappers/health-concern.mapper';

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : parseFloat(value);
};

export const mapProductEntityToResponse = (entity: ProductEntity): IProduct =>
  ({
  id: entity.id,
  refId: entity.refId,
  vendorId: entity.vendorId,
  name: entity.name,
  slug: entity.slug,
  externalProductId: entity.externalProductId,
  singleProductUrl: entity.singleProductUrl,
  packMetadata: entity.packMetadata ?? [],
  manufacturerAddress: entity.manufacturerAddress,
  packerAddress: entity.packerAddress,
  importerAddress: entity.importerAddress,
  description: entity.description,
  components: entity.components,
  productType: entity.productType,
  productNatureRefId: entity.productNature?.refId ?? null,
  productNatureName: entity.productNature?.name ?? null,
  categoryRefId: entity.category?.refId ?? '',
  categoryName: entity.category?.name ?? '',
  subCategoryRefId: entity.subCategory?.refId ?? null,
  subSubCategoryRefId: entity.subSubCategory?.refId ?? null,
  subSubSubCategoryRefId: entity.subSubSubCategory?.refId ?? null,
  brandRefId: entity.brand?.refId ?? '',
  brandName: entity.brand?.name ?? '',
  manufacturerRefId: entity.manufacturer?.refId ?? null,
  packerRefId: entity.packer?.refId ?? null,
  importerRefId: entity.importer?.refId ?? null,
  countryOfOriginRefId: entity.countryOfOrigin?.refId ?? null,
  countryOfOriginName: entity.countryOfOrigin?.name ?? null,
  status: entity.status,
  rejectionReason: entity.rejectionReason,
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
  sizeChart: entity.sizeChart,
  publishedAt: entity.publishedAt,
  attributes: (entity.attributeMappings ?? []).map(mapAttribute),
  variants: mapVariants(entity),
  media: (entity.media ?? []).map(mapMedia),
  healthConcernRefIds: (entity.healthConcernMappings ?? []).map(
    (item) => item.healthConcern?.refId ?? '',
  ),
  wellnessGoalRefIds: (entity.wellnessGoalMappings ?? []).map(
    (item) => item.wellnessGoal?.refId ?? '',
  ),
  wellnessGoals: (entity.wellnessGoalMappings ?? []).map(mapWellnessGoal),
  categoryFilters: mapCategoryFilters(entity),
  tags: (entity.tagMappings ?? []).map(mapTag),
  faqs: (entity.faqMappings ?? []).map(mapFaq),
  bundleItems: (entity.bundleItems ?? []).map(mapBundleItem),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  }) as IProduct;

export const mapProductEntitiesToResponse = (entities: ProductEntity[]): IProduct[] =>
  entities.map(mapProductEntityToResponse);

export const mapProductEntityToDetailResponse = (entity: ProductEntity): IProductDetail => ({
  ...mapProductEntityToResponse(entity),
  category: entity.category ? mapCategoryEntityToDetailResponse(entity.category) : null,
  subCategory: entity.subCategory ? mapCategoryEntityToDetailResponse(entity.subCategory) : null,
  subSubCategory: entity.subSubCategory ? mapCategoryEntityToDetailResponse(entity.subSubCategory) : null,
  subSubSubCategory: entity.subSubSubCategory
    ? mapCategoryEntityToDetailResponse(entity.subSubSubCategory)
    : null,
  brand: entity.brand ? mapBrandEntityToResponse(entity.brand) : null,
  productNature: entity.productNature ? mapProductNatureEntityToResponse(entity.productNature) : null,
  manufacturer: entity.manufacturer ? mapManufacturerEntityToResponse(entity.manufacturer) : null,
  packer: entity.packer ? mapPackerEntityToResponse(entity.packer) : null,
  importer: entity.importer ? mapImporterEntityToResponse(entity.importer) : null,
  countryOfOrigin: entity.countryOfOrigin
    ? mapCountryEntityToResponse(entity.countryOfOrigin)
    : null,
  healthConcerns: (entity.healthConcernMappings ?? [])
    .map((mapping) => mapping.healthConcern)
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map(mapHealthConcernEntityToResponse),
});

const mapAttribute = (
  mapping: ProductEntity['attributeMappings'][number],
): IProductAttribute => ({
  refId: mapping.attribute?.refId ?? '',
  name: mapping.attribute?.name ?? '',
});

const mapVariantImage = (media: ProductEntity['media'][number]) => ({
  id: media.id,
  type: media.type,
  url: media.url,
  sortOrder: media.sortOrder,
  isPrimary: media.isPrimary,
});

const groupVariantImages = (media: ProductEntity['media']) => {
  const grouped = new Map<string, ReturnType<typeof mapVariantImage>[]>();

  for (const item of media ?? []) {
    if (!item.variantId) continue;
    const list = grouped.get(item.variantId) ?? [];
    list.push(mapVariantImage(item));
    grouped.set(item.variantId, list);
  }

  for (const [variantId, images] of grouped) {
    grouped.set(
      variantId,
      images.sort((a, b) => a.sortOrder - b.sortOrder),
    );
  }

  return grouped;
};

const mapVariants = (entity: ProductEntity): IProductVariant[] => {
  const imagesByVariantId = groupVariantImages(entity.media ?? []);
  return (entity.variants ?? []).map((variant) =>
    mapVariant(variant, imagesByVariantId.get(variant.id) ?? []),
  );
};

const mapVariant = (
  variant: ProductEntity['variants'][number],
  images: ReturnType<typeof mapVariantImage>[],
): IProductVariant => ({
  id: variant.id,
  sku: variant.sku,
  slug: variant.slug,
  vendorSku: variant.vendorSku,
  barcode: variant.barcode,
  gtinNumber: variant.gtinNumber,
  hsnCode: variant.hsnCode,
  batchNumber: variant.batchNumber,
  expiryDate: variant.expiryDate,
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
  expiresIn: variant.expiresIn,
  status: variant.status,
  combinationKey: variant.combinationKey,
  attributes: (variant.attributeValues ?? []).map((item) => ({
    attributeRefId: item.attribute?.refId ?? '',
    attributeName: item.attribute?.name ?? '',
    value: item.value,
  })),
  images: images as IProductVariantImage[],
  createdAt: variant.createdAt,
  updatedAt: variant.updatedAt,
});

const mapMedia = (media: ProductEntity['media'][number]) => ({
  id: media.id,
  type: media.type,
  url: media.url,
  sortOrder: media.sortOrder,
  isPrimary: media.isPrimary,
  variantId: media.variantId,
});

const mapWellnessGoal = (
  mapping: ProductEntity['wellnessGoalMappings'][number],
) => ({
  refId: mapping.wellnessGoal?.refId ?? '',
  name: mapping.wellnessGoal?.name ?? '',
  image: mapping.wellnessGoal?.image ?? null,
});

const mapTag = (mapping: ProductEntity['tagMappings'][number]): IProductTag => ({
  refId: mapping.tag?.refId ?? '',
  name: mapping.tag?.name ?? '',
  slug: mapping.tag?.slug ?? '',
});

const mapFaq = (mapping: ProductEntity['faqMappings'][number]): IProductFaq => ({
  refId: mapping.productFaq?.refId ?? '',
  question: mapping.productFaq?.question ?? '',
  answer: mapping.productFaq?.answer ?? '',
});

const mapBundleItem = (item: ProductEntity['bundleItems'][number]): IProductBundleItem => ({
  id: item.id,
  childProductRefId: item.childProduct?.refId ?? '',
  childProductName: item.childProduct?.name ?? '',
  quantity: item.quantity,
});

export const mapCategoryFilters = (entity: ProductEntity): IProductCategoryFilterBinding[] => {
  const grouped = new Map<string, IProductCategoryFilterBinding>();

  for (const mapping of entity.categoryFilterMappings ?? []) {
    const categoryFilterRefId = mapping.categoryFilter?.refId ?? '';
    const categoryFilterName = mapping.categoryFilter?.name ?? '';
    const existing = grouped.get(mapping.categoryFilterId) ?? {
      categoryFilterRefId,
      categoryFilterName,
      values: [],
    };

    if (!existing.values.includes(mapping.value)) {
      existing.values.push(mapping.value);
    }

    grouped.set(mapping.categoryFilterId, existing);
  }

  return [...grouped.values()];
};
