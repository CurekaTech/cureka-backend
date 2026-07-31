import { ProductEntity } from '@modules/product/entities/product.entity';
import { mapCategoryFilters } from '@modules/product/mappers/product.mapper';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { formatExpiryDateOutput } from '@modules/product/utils/expiry-date.util';
import { mapVariantEntityToDetailFields } from '@modules/product/mappers/variant-details.mapper';
import {
  IPublicCategorySummary,
  IPublicImporterSummary,
  IPublicManufacturerSummary,
  IPublicPackerSummary,
  IPublicProductCard,
  IPublicProductDetail,
  IPublicProductMedia,
  IPublicProductPriceSummary,
  IPublicProductVariantSearchItem,
} from '../interfaces/public-product.interface';
import { getSalableStockQuantity, isVariantInStock } from '@packages/common';
import { IStorageFileReference } from '@packages/storage';
import {
  buildProductCategorySlugPathFromRelations,
  buildProductPermalink,
} from '../utils/category-permalink.util';

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : parseFloat(value);
};

const getActiveVariants = (entity: ProductEntity) =>
  (entity.variants ?? []).filter((variant) => variant.status === VariantStatus.ACTIVE);

const sortVariantsBySellingPrice = (
  variants: ProductVariantEntity[],
): ProductVariantEntity[] =>
  [...variants].sort(
    (left, right) =>
      (toNumber(left.sellingPrice) ?? 0) - (toNumber(right.sellingPrice) ?? 0),
  );

/** Prefer the lowest-price in-stock variant for listing cards and add-to-cart defaults. */
const pickPreferredListVariant = (entity: ProductEntity): ProductVariantEntity | null => {
  const activeVariants = getActiveVariants(entity);
  if (!activeVariants.length) {
    return null;
  }

  if (activeVariants.length === 1) {
    return activeVariants[0]!;
  }

  const sorted = sortVariantsBySellingPrice(activeVariants);
  const inStockVariants = sorted.filter((variant) => !variant.outOfStock);
  return (inStockVariants.length ? inStockVariants : sorted)[0] ?? null;
};

export const pickPreferredPublicVariant = <
  T extends { sellingPrice: number; stock: number; outOfStock: boolean },
>(
  variants: T[],
): T | null => {
  if (!variants.length) {
    return null;
  }

  const sorted = [...variants].sort((left, right) => left.sellingPrice - right.sellingPrice);
  const inStockVariants = sorted.filter((variant) => !variant.outOfStock);
  return (inStockVariants.length ? inStockVariants : sorted)[0] ?? null;
};

const resolveListVariant = (entity: ProductEntity): ProductVariantEntity | null =>
  pickPreferredListVariant(entity);

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
    inStock: activeVariants.some((variant) => !variant.outOfStock),
  };
};

/** Available to buy: not admin-marked OOS, and passes stock rules when enabled. */
const isVariantAvailable = (
  variant: Pick<ProductVariantEntity, 'stock' | 'outOfStock'>,
): boolean => !(variant.outOfStock ?? false) && isVariantInStock(variant.stock);

const storageMediaKey = (ref: IStorageFileReference | string | null | undefined): string | null => {
  if (!ref) return null;
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    return trimmed || null;
  }
  return ref.key?.trim() || null;
};

/**
 * Import/sync sometimes stores the same file twice (product-level + variant-level).
 * Public gallery must show each file once.
 */
const dedupeMediaByStorageKey = <T extends { url?: IStorageFileReference | string | null; variantId?: string | null; sortOrder?: number }>(
  items: T[],
): T[] => {
  const byKey = new Map<string, T>();

  for (const item of items) {
    const key = storageMediaKey(item.url ?? null);
    if (!key) {
      continue;
    }

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    // Prefer variant-scoped row over a product-level duplicate of the same file.
    if (!existing.variantId && item.variantId) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()].sort(
    (left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
  );
};

const getPrimaryImageUrl = (entity: ProductEntity): IStorageFileReference | null => {
  const media = dedupeMediaByStorageKey(
    (entity.media ?? []).filter(
      (item) =>
        item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
    ),
  );
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

const mapManufacturerToPublic = (
  entity: ManufacturerEntity | null | undefined,
): IPublicManufacturerSummary | null => {
  if (!entity) return null;
  return {
    refId: entity.refId,
    name: entity.name,
    code: entity.code,
    logo: entity.logo ?? null,
    description: entity.description,
    contactPerson: entity.contactPerson,
    email: entity.email,
    mobileNumber: entity.mobileNumber,
    address: entity.address,
    gstNumber: entity.gstNumber,
    drugLicenseNumber: entity.drugLicenseNumber,
  };
};

const mapPackerToPublic = (entity: PackerEntity | null | undefined): IPublicPackerSummary | null => {
  if (!entity) return null;
  return {
    refId: entity.refId,
    name: entity.name,
    code: entity.code,
    logo: entity.logo ?? null,
    description: entity.description,
    contactPerson: entity.contactPerson,
    email: entity.email,
    mobileNumber: entity.mobileNumber,
    address: entity.address,
    gstNumber: entity.gstNumber,
    drugLicenseNumber: entity.drugLicenseNumber,
    remarks: entity.remarks,
  };
};

const mapImporterToPublic = (
  entity: ImporterEntity | null | undefined,
): IPublicImporterSummary | null => {
  if (!entity) return null;
  return {
    refId: entity.refId,
    name: entity.name,
    code: entity.code,
    iec: entity.iec,
    logo: entity.logo ?? null,
    contactPerson: entity.contactPerson,
    email: entity.email,
    mobileNumber: entity.mobileNumber,
    address: entity.address,
    gstNumber: entity.gstNumber,
    drugLicenseNumber: entity.drugLicenseNumber,
  };
};

const getVariantPrimaryImageUrl = (
  product: ProductEntity,
  variantId: string,
): IStorageFileReference | null => {
  const media = product.media ?? [];
  const variantMedia = media.filter(
    (item) => item.variantId === variantId && item.type !== ProductMediaType.COMMON,
  );
  const variantPrimary =
    variantMedia.find((item) => item.isPrimary) ?? variantMedia[0];
  if (variantPrimary?.url) {
    return variantPrimary.url;
  }

  const productMedia = media.filter(
    (item) =>
      !item.variantId &&
      (item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON),
  );
  const productPrimary =
    productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? media[0];
  return productPrimary?.url ?? null;
};

const mapPublicMediaItem = (
  item: NonNullable<ProductEntity['media']>[number],
): IPublicProductMedia =>
  ({
    id: item.id,
    type: item.type,
    url: item.url,
    sortOrder: item.sortOrder,
    isPrimary: item.isPrimary,
    variantId: item.variantId,
  }) as IPublicProductMedia;

const getCommonPublicMedia = (entity: ProductEntity): IPublicProductMedia[] =>
  dedupeMediaByStorageKey(
    (entity.media ?? [])
      .filter((item) => item.type === ProductMediaType.COMMON && !item.variantId)
      .map(mapPublicMediaItem),
  );

const getVariantPublicImages = (
  entity: ProductEntity,
  variantId: string,
  commonMedia: IPublicProductMedia[],
): IPublicProductMedia[] => {
  const variantImages = dedupeMediaByStorageKey(
    (entity.media ?? [])
      .filter((item) => item.variantId === variantId && item.type !== ProductMediaType.COMMON)
      .map(mapPublicMediaItem),
  );

  if (!commonMedia.length) return variantImages;
  if (!variantImages.length) {
    return commonMedia.map((item, index) => ({
      ...item,
      isPrimary: item.isPrimary || index === 0,
    }));
  }

  return dedupeMediaByStorageKey([
    ...commonMedia.map((item) => ({ ...item, isPrimary: false })),
    ...variantImages,
  ]);
};

const getPublicProductMedia = (entity: ProductEntity): IPublicProductMedia[] =>
  dedupeMediaByStorageKey((entity.media ?? []).map(mapPublicMediaItem));

export const mapVariantEntityToPublicSearchItem = (
  variant: ProductVariantEntity,
): IPublicProductVariantSearchItem => {
  const product = variant.product;

  return {
    refId: product.refId,
    name: variant.displayName?.trim() || product.name,
    productSlug: product.slug,
    variantSlug: variant.slug,
    productPageUrl: variant.productPageUrl ?? null,
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
    stock: getSalableStockQuantity(variant.stock),
    inStock: isVariantAvailable(variant),
    outOfStock: variant.outOfStock ?? false,
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

export const mapProductEntityToPublicCard = (entity: ProductEntity): IPublicProductCard => {
  const categorySlugPath = buildProductCategorySlugPathFromRelations(entity);
  const listVariant = resolveListVariant(entity);
  const productPageUrl = listVariant?.productPageUrl ?? null;
  const pricing = buildPriceSummary(entity);
  const outOfStock = listVariant?.outOfStock ?? false;
  return {
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  productType: entity.productType,
  defaultVariantId: listVariant?.id ?? null,
  categoryRefId: entity.category?.refId ?? '',
  categoryName: entity.category?.name ?? '',
  subCategoryRefId: entity.subCategory?.refId ?? null,
  subCategoryName: entity.subCategory?.name ?? null,
  categorySlugPath,
  permalink: productPageUrl || buildProductPermalink(categorySlugPath, entity.slug),
  productPageUrl,
  brandRefId: entity.brand?.refId ?? null,
  brandName: entity.brand?.name ?? null,
  brandSlug: entity.brand?.slug ?? null,
  productNatureRefId: entity.productNature?.refId ?? null,
  productNatureName: entity.productNature?.name ?? null,
  primaryImageUrl: getPrimaryImageUrl(entity),
  pricing: {
    ...pricing,
    // List UI shows one variant per card — availability matches that variant.
    inStock: !outOfStock,
  },
  outOfStock,
  isBestSeller: (entity.tagMappings ?? []).some(
    (mapping) => mapping.tag?.slug === 'bestsellers',
  ),
  variantId: listVariant?.id ?? null,
  subscriptionEnabled: entity.subscriptionEnabled,
  codAvailable: entity.codAvailable,
  publishedAt: entity.publishedAt,
  tags: (entity.tagMappings ?? []).map((mapping) => ({
    refId: mapping.tag?.refId ?? '',
    name: mapping.tag?.name ?? '',
    slug: mapping.tag?.slug ?? '',
  })),
  } as IPublicProductCard;
};

export const mapProductEntitiesToPublicCards = (entities: ProductEntity[]): IPublicProductCard[] =>
  entities.map(mapProductEntityToPublicCard);

export const mapProductEntityToPublicDetail = (entity: ProductEntity): IPublicProductDetail => {
  const categorySlugPath = buildProductCategorySlugPathFromRelations(entity);
  return {
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
  categories: (entity.categoryHierarchies ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => ({
      categoryRefId: item.category?.refId ?? '',
      categoryName: item.category?.name ?? '',
      subCategoryRefId: item.subCategory?.refId ?? null,
      subCategoryName: item.subCategory?.name ?? null,
      subSubCategoryRefId: item.subSubCategory?.refId ?? null,
      subSubCategoryName: item.subSubCategory?.name ?? null,
      subSubSubCategoryRefId: item.subSubSubCategory?.refId ?? null,
      subSubSubCategoryName: item.subSubSubCategory?.name ?? null,
      sortOrder: item.sortOrder,
    })),
  categorySlugPath,
  permalink: buildProductPermalink(categorySlugPath, entity.slug),
  brandRefId: entity.brand?.refId ?? null,
  brandName: entity.brand?.name ?? null,
  brandSlug: entity.brand?.slug ?? null,
  manufacturerRefId: entity.manufacturer?.refId ?? null,
  manufacturerName: entity.manufacturer?.name ?? null,
  manufacturerAddress: entity.manufacturer?.address ?? null,
  packerRefId: entity.packer?.refId ?? null,
  packerName: entity.packer?.name ?? null,
  packerAddress: entity.packer?.address ?? null,
  importerRefId: entity.importer?.refId ?? null,
  importerName: entity.importer?.name ?? null,
  importerAddress: entity.importer?.address ?? null,
  manufacturer: mapManufacturerToPublic(entity.manufacturer),
  packer: mapPackerToPublic(entity.packer),
  importer: mapImporterToPublic(entity.importer),
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
  // Computed live in PublicProductsService.enrichDetail from admin settings.
  isFreeDelivery: false,
  attributes: (entity.attributeMappings ?? []).map((mapping) => ({
    refId: mapping.attribute?.refId ?? '',
    name: mapping.attribute?.name ?? '',
  })),
  variants: (() => {
    const commonMedia =
      entity.productType === ProductType.VARIABLE ? getCommonPublicMedia(entity) : [];
    return getActiveVariants(entity).map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      slug: variant.slug,
      ...mapVariantEntityToDetailFields(variant),
      mrp: toNumber(variant.mrp) ?? 0,
      sellingPrice: toNumber(variant.sellingPrice) ?? 0,
      discountPercentage: toNumber(variant.discountPercentage),
      stock: getSalableStockQuantity(variant.stock),
      inStock: isVariantAvailable(variant),
      outOfStock: variant.outOfStock ?? false,
      weight: toNumber(variant.weight),
      weightUnit: variant.weightUnit,
      length: toNumber(variant.length),
      lengthUnit: variant.lengthUnit,
      width: toNumber(variant.width),
      widthUnit: variant.widthUnit,
      height: toNumber(variant.height),
      heightUnit: variant.heightUnit,
      expiryDate: formatExpiryDateOutput(variant.expiryDate),
      status: variant.status,
      attributes: (variant.attributeValues ?? []).map((item) => ({
        attributeRefId: item.attribute?.refId ?? '',
        attributeName: item.attribute?.name ?? '',
        value: item.value,
      })),
      images: getVariantPublicImages(entity, variant.id, commonMedia),
    }));
  })(),
  media: getPublicProductMedia(entity),
  healthConcerns: (entity.healthConcernMappings ?? []).map((mapping) => ({
    refId: mapping.healthConcern?.refId ?? '',
    name: mapping.healthConcern?.name ?? '',
    slug: mapping.healthConcern?.slug ?? '',
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
  } as unknown as IPublicProductDetail;
};

export const applySelectedVariantDetailToPublicProduct = (
  detail: IPublicProductDetail,
): IPublicProductDetail => {
  if (detail.productType !== ProductType.VARIABLE) {
    return detail;
  }

  const selectedVariantId = detail.selectedVariantId;
  if (!selectedVariantId) return detail;

  const selectedVariant = detail.variants.find((variant) => variant.id === selectedVariantId);
  if (!selectedVariant) return detail;

  const hasVariantDetail =
    Boolean(selectedVariant.displayName) ||
    Boolean(selectedVariant.description) ||
    (selectedVariant.productInformation?.length ?? 0) > 0 ||
    (selectedVariant.faqs?.length ?? 0) > 0;

  if (!hasVariantDetail) return detail;

  return {
    ...detail,
    name: selectedVariant.displayName?.trim() || detail.name,
    description: selectedVariant.description ?? detail.description,
    components: selectedVariant.components ?? detail.components,
    productInformation: selectedVariant.productInformation?.length
      ? selectedVariant.productInformation
      : detail.productInformation,
    expiresInMonths: selectedVariant.expiresInMonths ?? detail.expiresInMonths,
    subscriptionEnabled: selectedVariant.subscriptionEnabled ?? detail.subscriptionEnabled,
    codAvailable: selectedVariant.codAvailable ?? detail.codAvailable,
    emiAvailable: selectedVariant.emiAvailable ?? detail.emiAvailable,
    replaceAllowed: selectedVariant.replaceAllowed ?? detail.replaceAllowed,
    replaceWindowDays: selectedVariant.replaceWindowDays ?? detail.replaceWindowDays,
    returnAllowed: selectedVariant.returnAllowed ?? detail.returnAllowed,
    returnPolicy: selectedVariant.returnPolicy ?? detail.returnPolicy,
    returnWindowDays: selectedVariant.returnWindowDays ?? detail.returnWindowDays,
    metaTitle: selectedVariant.metaTitle ?? detail.metaTitle,
    metaDescription: selectedVariant.metaDescription ?? detail.metaDescription,
    metaKeywords: selectedVariant.metaKeywords ?? detail.metaKeywords,
    sizeChart: selectedVariant.sizeChart ?? detail.sizeChart,
    manufacturerRefId: selectedVariant.manufacturerRefId ?? detail.manufacturerRefId,
    manufacturerName: selectedVariant.manufacturerName ?? detail.manufacturerName,
    manufacturerAddress: selectedVariant.manufacturerAddress ?? detail.manufacturerAddress,
    packerRefId: selectedVariant.packerRefId ?? detail.packerRefId,
    packerName: selectedVariant.packerName ?? detail.packerName,
    packerAddress: selectedVariant.packerAddress ?? detail.packerAddress,
    importerRefId: selectedVariant.importerRefId ?? detail.importerRefId,
    importerName: selectedVariant.importerName ?? detail.importerName,
    importerAddress: selectedVariant.importerAddress ?? detail.importerAddress,
    countryOfOriginRefId: selectedVariant.countryOfOriginRefId ?? detail.countryOfOriginRefId,
    countryOfOriginName: selectedVariant.countryOfOriginName ?? detail.countryOfOriginName,
    faqs:
      selectedVariant.faqs?.length
        ? selectedVariant.faqs.map((faq, index) => ({
            refId: `variant-${selectedVariant.id}-faq-${index + 1}`,
            question: faq.question,
            answer: faq.answer,
          }))
        : detail.faqs,
    categoryFilters: selectedVariant.categoryFilters?.length
      ? selectedVariant.categoryFilters
      : detail.categoryFilters,
    tags:
      selectedVariant.tagNames?.length
        ? selectedVariant.tagNames.map((name, index) => ({
            refId: `variant-${selectedVariant.id}-tag-${index + 1}`,
            name,
            slug: name.toLowerCase().replace(/\s+/g, '-'),
          }))
        : detail.tags,
  };
};
