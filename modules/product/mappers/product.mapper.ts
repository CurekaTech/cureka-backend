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
  IProductCategoryHierarchy,
} from '../interfaces/product.interface';
import { IProductDetail } from '../interfaces/product-detail.interface';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { ProductType } from '../enums/product-type.enum';
import { mapCategoryEntityToDetailResponse } from '@modules/master/mappers/category.mapper';
import { mapBrandEntityToResponse } from '@modules/master/mappers/brand.mapper';
import { mapProductNatureEntityToResponse } from '@modules/master/mappers/product-nature.mapper';
import { mapManufacturerEntityToResponse } from '@modules/master/mappers/manufacturer.mapper';
import { formatExpiryDateOutput } from '../utils/expiry-date.util';
import { mapPackerEntityToResponse } from '@modules/master/mappers/packer.mapper';
import { mapImporterEntityToResponse } from '@modules/master/mappers/importer.mapper';
import { mapCountryEntityToResponse } from '@modules/master/mappers/country.mapper';
import { mapHealthConcernEntityToResponse } from '@modules/master/mappers/health-concern.mapper';
import { mapVariantEntityToDetailFields } from './variant-details.mapper';
import { ProductCategoryHierarchyEntity } from '../entities/product-category-hierarchy.entity';

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : parseFloat(value);
};

/** Product is out of stock when it has no variants with stock &gt; 0. */
export const isProductOutOfStock = (entity: ProductEntity): boolean => {
  const variants = entity.variants ?? [];
  if (!variants.length) return true;
  return variants.every((variant) => variant.outOfStock === true);
};

const mapCategoryHierarchy = (
  mapping: ProductCategoryHierarchyEntity,
): IProductCategoryHierarchy => ({
  categoryRefId: mapping.category?.refId ?? '',
  categoryName: mapping.category?.name ?? '',
  subCategoryRefId: mapping.subCategory?.refId ?? null,
  subCategoryName: mapping.subCategory?.name ?? null,
  subSubCategoryRefId: mapping.subSubCategory?.refId ?? null,
  subSubCategoryName: mapping.subSubCategory?.name ?? null,
  subSubSubCategoryRefId: mapping.subSubSubCategory?.refId ?? null,
  subSubSubCategoryName: mapping.subSubSubCategory?.name ?? null,
  sortOrder: mapping.sortOrder,
});

const mapCategoryHierarchies = (entity: ProductEntity): IProductCategoryHierarchy[] => {
  const mappings = (entity.categoryHierarchies ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (mappings.length) {
    return mappings.map(mapCategoryHierarchy);
  }

  // Fallback for rows not yet backfilled / lightweight loads without join rows.
  if (!entity.category && !entity.categoryId) return [];
  return [
    {
      categoryRefId: entity.category?.refId ?? '',
      categoryName: entity.category?.name ?? '',
      subCategoryRefId: entity.subCategory?.refId ?? null,
      subCategoryName: entity.subCategory?.name ?? null,
      subSubCategoryRefId: entity.subSubCategory?.refId ?? null,
      subSubCategoryName: entity.subSubCategory?.name ?? null,
      subSubSubCategoryRefId: entity.subSubSubCategory?.refId ?? null,
      subSubSubCategoryName: entity.subSubSubCategory?.name ?? null,
      sortOrder: 0,
    },
  ];
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
  categories: mapCategoryHierarchies(entity),
  brandRefId: entity.brand?.refId ?? '',
  brandName: entity.brand?.name ?? '',
  manufacturerRefId: entity.manufacturer?.refId ?? null,
  manufacturerName: entity.manufacturer?.name ?? null,
  packerRefId: entity.packer?.refId ?? null,
  packerName: entity.packer?.name ?? null,
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
  bundleIcon: entity.bundleIcon ?? null,
  publishedAt: entity.publishedAt,
  curatedBy: entity.curatedBy ?? null,
  curatedFor: entity.curatedFor ?? null,
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
  outOfStock: isProductOutOfStock(entity),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  }) as IProduct;

export const mapProductEntitiesToResponse = (entities: ProductEntity[]): IProduct[] =>
  entities.map(mapProductEntityToResponse);

const buildVariantListName = (entity: ProductEntity, variant: IProductVariant): string => {
  const displayName = variant.displayName?.trim();
  if (displayName && displayName.toLowerCase() !== entity.name.trim().toLowerCase()) {
    return displayName;
  }

  const attributeLabel = variant.attributes
    .map((item) => item.value?.trim())
    .filter(Boolean)
    .join(' / ');

  if (attributeLabel) {
    return `${entity.name} - ${attributeLabel}`;
  }

  return entity.name;
};

/** One admin list row per variant (variable products expand to multiple rows). */
export const mapProductEntityToVariantListItem = (
  entity: ProductEntity,
  variantId: string,
): IProduct => {
  const mapped = mapProductEntityToResponse(entity);
  const variant = mapped.variants.find((item) => item.id === variantId);
  if (!variant) {
    return mapped;
  }

  return {
    ...mapped,
    name: buildVariantListName(entity, variant),
    slug: variant.slug,
    variants: [variant],
    // Keep product-level outOfStock (all variants), not just this list-row variant.
    outOfStock: mapped.outOfStock,
  };
};

export const mapVariantRowsToAdminListResponse = (
  variants: Array<{ product: ProductEntity; id: string }>,
): IProduct[] =>
  variants.map((row) => mapProductEntityToVariantListItem(row.product, row.id));

export const mapProductEntityToDetailResponse = (entity: ProductEntity): IProductDetail => ({
  ...mapProductEntityToResponse(entity),
  category: entity.category ? mapCategoryEntityToDetailResponse(entity.category) : null,
  subCategory: entity.subCategory ? mapCategoryEntityToDetailResponse(entity.subCategory) : null,
  subSubCategory: entity.subSubCategory ? mapCategoryEntityToDetailResponse(entity.subSubCategory) : null,
  subSubSubCategory: entity.subSubSubCategory
    ? mapCategoryEntityToDetailResponse(entity.subSubSubCategory)
    : null,
  categoryHierarchies: (() => {
    const mapped = (entity.categoryHierarchies ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => ({
        category: item.category ? mapCategoryEntityToDetailResponse(item.category) : null,
        subCategory: item.subCategory ? mapCategoryEntityToDetailResponse(item.subCategory) : null,
        subSubCategory: item.subSubCategory
          ? mapCategoryEntityToDetailResponse(item.subSubCategory)
          : null,
        subSubSubCategory: item.subSubSubCategory
          ? mapCategoryEntityToDetailResponse(item.subSubSubCategory)
          : null,
        sortOrder: item.sortOrder,
      }));
    if (mapped.length) return mapped;
    return [
      {
        category: entity.category ? mapCategoryEntityToDetailResponse(entity.category) : null,
        subCategory: entity.subCategory
          ? mapCategoryEntityToDetailResponse(entity.subCategory)
          : null,
        subSubCategory: entity.subSubCategory
          ? mapCategoryEntityToDetailResponse(entity.subSubCategory)
          : null,
        subSubSubCategory: entity.subSubSubCategory
          ? mapCategoryEntityToDetailResponse(entity.subSubSubCategory)
          : null,
        sortOrder: 0,
      },
    ];
  })(),
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

const mapVariantImage = (media: ProductEntity['media'][number]): IProductVariantImage =>
  ({
    id: media.id,
    type: media.type,
    url: media.url,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
  }) as IProductVariantImage;

const groupVariantImages = (media: ProductEntity['media']) => {
  const grouped = new Map<string, IProductVariantImage[]>();

  for (const item of media ?? []) {
    if (!item.variantId || item.type === ProductMediaType.COMMON) continue;
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

const getCommonMedia = (media: ProductEntity['media']): IProductVariantImage[] =>
  (media ?? [])
    .filter((item) => item.type === ProductMediaType.COMMON && !item.variantId)
    .map(mapVariantImage)
    .sort((a, b) => a.sortOrder - b.sortOrder);

/** For variable products, prepend shared common media onto every variant's images. */
const mergeCommonIntoVariantImages = (
  variantImages: IProductVariantImage[],
  commonMedia: IProductVariantImage[],
): IProductVariantImage[] => {
  if (!commonMedia.length) return variantImages;

  if (!variantImages.length) {
    return commonMedia.map((item, index) => ({
      ...item,
      isPrimary: item.isPrimary || index === 0,
    }));
  }

  return [
    ...commonMedia.map((item) => ({ ...item, isPrimary: false })),
    ...variantImages,
  ];
};

const mapVariants = (entity: ProductEntity): IProductVariant[] => {
  const imagesByVariantId = groupVariantImages(entity.media ?? []);
  const commonMedia =
    entity.productType === ProductType.VARIABLE ? getCommonMedia(entity.media ?? []) : [];

  return (entity.variants ?? []).map((variant) =>
    mapVariant(
      variant,
      mergeCommonIntoVariantImages(imagesByVariantId.get(variant.id) ?? [], commonMedia),
    ),
  );
};

const mapVariant = (
  variant: ProductEntity['variants'][number],
  images: IProductVariantImage[],
): IProductVariant => ({
  id: variant.id,
  sku: variant.sku,
  slug: variant.slug,
  externalProductId: variant.externalProductId ?? null,
  vendorSku: variant.vendorSku,
  barcode: variant.barcode,
  gtinNumber: variant.gtinNumber,
  hsnCode: variant.hsnCode,
  batchNumber: variant.batchNumber,
  expiryDate: formatExpiryDateOutput(variant.expiryDate),
  mrp: toNumber(variant.mrp) ?? 0,
  sellingPrice: toNumber(variant.sellingPrice) ?? 0,
  discountPercentage: toNumber(variant.discountPercentage),
  stock: variant.stock,
  outOfStock: variant.outOfStock ?? false,
  estimatedDeliveryTime: variant.estimatedDeliveryTime ?? null,
  isTop: variant.isTop ?? false,
  topSortOrder: variant.topSortOrder ?? null,
  weight: toNumber(variant.weight),
  weightUnit: variant.weightUnit,
  length: toNumber(variant.length),
  lengthUnit: variant.lengthUnit,
  width: toNumber(variant.width),
  widthUnit: variant.widthUnit,
  height: toNumber(variant.height),
  heightUnit: variant.heightUnit,
  expiresIn: variant.expiresIn,
  searchTags: variant.searchTags ?? [],
  status: variant.status,
  combinationKey: variant.combinationKey,
  attributes: (variant.attributeValues ?? []).map((item) => ({
    attributeRefId: item.attribute?.refId ?? '',
    attributeName: item.attribute?.name ?? '',
    value: item.value,
  })),
  images,
  ...mapVariantEntityToDetailFields(variant),
  createdAt: variant.createdAt,
  updatedAt: variant.updatedAt,
});

const mapMedia = (media: ProductEntity['media'][number]): IProductMedia =>
  ({
    id: media.id,
    type: media.type,
    url: media.url,
    sortOrder: media.sortOrder,
    isPrimary: media.isPrimary,
    variantId: media.variantId,
  }) as IProductMedia;

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
