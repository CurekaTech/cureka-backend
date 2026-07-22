import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { buildCategoryFilterColumnHeader } from './bulk-upload-columns.util';
import { IProductInformationItem } from '../interfaces/product-information.interface';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import { IStorageFileReference } from '@packages/storage';

type ExportCellValue = string | number | null;
type ExportRowValues = Map<string, ExportCellValue>;

const PACK_COLUMN_PREFIXES: Record<
  number,
  {
    name?: string;
    sku: string;
    barcode: string;
    productId: string;
    url: string;
    unit: string;
    mrp: string;
    sellingPrice: string;
  }
> = {
  1: {
    sku: 'Pack SKU Code 1',
    barcode: 'Barcode 1 (EAN/UPC)',
    productId: 'Pack Product ID 1',
    url: 'URL Pack 1',
    unit: 'Pack Unit 1',
    mrp: 'Pack MRP 1',
    sellingPrice: 'Pack Selling Price 1',
  },
  2: {
    name: 'Pack Name 2',
    sku: 'Pack SKU Code 2',
    barcode: 'Barcode 2 (EAN/UPC)',
    productId: 'Pack Product ID 2',
    url: 'URL Pack 2',
    unit: 'Pack Unit 2',
    mrp: 'Pack MRP 2',
    sellingPrice: 'Pack Selling Price 2',
  },
  3: {
    name: 'Pack Name 3',
    sku: 'Pack SKU Code 3',
    barcode: 'Barcode 3 (EAN/UPC)',
    productId: 'Pack Product ID 3',
    url: 'URL Pack 3',
    unit: 'Pack Unit 3',
    mrp: 'Pack MRP 3',
    sellingPrice: 'Pack Selling Price 3',
  },
  4: {
    name: 'Pack Name 4',
    sku: 'Pack SKU Code 4',
    barcode: 'Barcode 4 (EAN/UPC)',
    productId: 'Pack Product ID 4',
    url: 'URL Pack 4',
    unit: 'Pack Unit 4',
    mrp: 'Pack MRP 4',
    sellingPrice: 'Pack Selling Price 4',
  },
};

const GALLERY_IMAGE_COLUMNS: Array<{ name: string; url: string; isVideo?: boolean }> = [
  { name: 'Gallery Image 2', url: 'Gallery Image 2 URL' },
  { name: 'Gallery Image 2 (Video)', url: 'Gallery Image 2 (Video) URL', isVideo: true },
  { name: 'Gallery Image 3', url: 'Gallery Image 3 URL' },
  { name: 'Gallery Image 4', url: 'Gallery Image 4 URL' },
  { name: 'Gallery Image 5', url: 'Gallery Image 5 URL' },
  { name: 'Gallery Image 6', url: 'Gallery Image 6 URL' },
];

const yesNo = (value: boolean | undefined | null): string => (value ? 'Yes' : 'No');

const joinPipe = (items: Array<string | undefined | null>): string =>
  items.map((item) => item?.trim()).filter(Boolean).join(' | ');

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const storageKey = (ref: IStorageFileReference | string | null | undefined): string | null => {
  if (!ref) return null;
  if (typeof ref === 'string') return ref.trim() || null;
  return ref.key?.trim() || null;
};

const buildRowFromValues = (headers: string[], values: ExportRowValues): ExportCellValue[] =>
  headers.map((header) => (values.has(header) ? values.get(header)! : null));

const applyProductInformation = (
  values: ExportRowValues,
  items: IProductInformationItem[] | undefined,
  headers: Set<string>,
): void => {
  for (const item of items ?? []) {
    const label = item.label?.trim();
    if (!label || !headers.has(label)) continue;
    values.set(label, item.description ?? null);
  }
};

const applyPackMetadata = (values: ExportRowValues, packs: IProductPackMetadataItem[]): void => {
  for (const pack of packs) {
    const columns = PACK_COLUMN_PREFIXES[pack.packNumber];
    if (!columns) continue;

    if (columns.name && pack.name) values.set(columns.name, pack.name);
    if (pack.skuCode) values.set(columns.sku, pack.skuCode);
    if (pack.barcode) values.set(columns.barcode, pack.barcode);
    if (pack.productId) values.set(columns.productId, pack.productId);
    if (pack.url) values.set(columns.url, pack.url);
    if (pack.unit) values.set(columns.unit, pack.unit);
    if (pack.mrp !== undefined) values.set(columns.mrp, pack.mrp);
    if (pack.sellingPrice !== undefined) values.set(columns.sellingPrice, pack.sellingPrice);
  }
};

const applyFaqs = (
  values: ExportRowValues,
  faqs: Array<{ question: string; answer: string }>,
): void => {
  faqs.slice(0, 10).forEach((faq, index) => {
    const n = index + 1;
    values.set(`FAQ ${n} Question`, faq.question);
    values.set(`FAQ ${n} Answer`, faq.answer);
  });
};

const applyCategoryFilters = (
  values: ExportRowValues,
  mappings: ProductEntity['categoryFilterMappings'],
): void => {
  const grouped = new Map<string, string[]>();
  for (const mapping of mappings ?? []) {
    const filterName = mapping.categoryFilter?.name?.trim();
    if (!filterName) continue;
    const header = buildCategoryFilterColumnHeader(filterName);
    const existing = grouped.get(header) ?? [];
    if (mapping.value?.trim()) {
      existing.push(mapping.value.trim());
    }
    grouped.set(header, existing);
  }

  for (const [header, filterValues] of grouped.entries()) {
    values.set(header, joinPipe(filterValues));
  }
};

const applySimpleGalleryImages = (
  values: ExportRowValues,
  media: ProductMediaEntity[],
): void => {
  const images = media
    .filter((item) => item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.VIDEO)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime());

  if (!images.length) return;

  const primary = images.find((item) => item.isPrimary) ?? images[0];
  const primaryKey = storageKey(primary.url);
  if (primaryKey) {
    values.set('Primary Image URL', primaryKey);
  }

  const gallery = images.filter((item) => item.id !== primary.id);
  let galleryColumnIndex = 0;

  for (const item of gallery) {
    const key = storageKey(item.url);
    if (!key) continue;

    while (galleryColumnIndex < GALLERY_IMAGE_COLUMNS.length) {
      const column = GALLERY_IMAGE_COLUMNS[galleryColumnIndex];
      galleryColumnIndex += 1;

      const isVideo = item.type === ProductMediaType.VIDEO;
      if (isVideo && !column.isVideo) continue;
      if (!isVideo && column.isVideo) continue;

      values.set(column.url, key);
      break;
    }
  }
};

const applyCommonMedia = (values: ExportRowValues, media: ProductMediaEntity[]): void => {
  const commonMedia = media
    .filter((item) => !item.variantId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime());

  commonMedia.slice(0, 6).forEach((item, index) => {
    const key = storageKey(item.url);
    if (!key) return;
    const slot = index + 1;
    values.set(`common_media_${slot}_url`, key);
  });
};

const applyVariantFields = (
  values: ExportRowValues,
  variant: ProductVariantEntity,
  options: {
    includeVariantImages: boolean;
    attributeNames: string[];
    variantMedia?: ProductMediaEntity[];
  },
): void => {
  values.set('Product SKU Code*', variant.sku);
  if (variant.externalProductId) {
    values.set('Product ID (String)', variant.externalProductId);
  }
  if (variant.barcode) values.set('Barcode (EAN/UPC)', variant.barcode);
  if (variant.gtinNumber) values.set('GTIN Number', variant.gtinNumber);
  if (variant.hsnCode) values.set('HSN Code', variant.hsnCode);
  if (variant.batchNumber) values.set('Batch Number', variant.batchNumber);
  if (variant.expiryDate) values.set('Expiry Date', variant.expiryDate);
  if (variant.taxClass) values.set('Tax Class', variant.taxClass);

  const mrp = toNumber(variant.mrp);
  const sellingPrice = toNumber(variant.sellingPrice);
  const discount = toNumber(variant.discountPercentage);

  if (mrp !== null) values.set('MRP (Rs)*', mrp);
  if (sellingPrice !== null) values.set('Selling Price (Rs)*', sellingPrice);
  if (discount !== null) values.set('Discount Percentage', discount);
  values.set('Quantity / Stock', variant.stock ?? 0);

  if (variant.weight) values.set('Weight (kg)', toNumber(variant.weight));
  if (variant.weightUnit) values.set('Weight Unit', variant.weightUnit);
  if (variant.length) values.set('Length (cm)', toNumber(variant.length));
  if (variant.width) values.set('Width (cm)', toNumber(variant.width));
  if (variant.height) values.set('Height (cm)', toNumber(variant.height));
  if (variant.lengthUnit) values.set('Dimension Unit', variant.lengthUnit);
  values.set('Variant Status', variant.status);

  if (variant.slug) values.set('Product URL Slug', variant.slug);
  if (variant.searchTags?.length) values.set('Search Tags', joinPipe(variant.searchTags));

  options.attributeNames.forEach((attributeName, index) => {
    const attributeValue = variant.attributeValues?.find(
      (entry) => entry.attribute?.name?.toLowerCase() === attributeName.toLowerCase(),
    );
    if (!attributeValue?.value) return;
    values.set(`Attribute Details ${index + 1}`, attributeName);
    values.set(`att_attribute_${index + 1}_value_1`, attributeValue.value);
  });

  if (options.includeVariantImages && options.variantMedia?.length) {
    applySimpleGalleryImages(values, options.variantMedia);
  }
};

const buildSharedProductValues = (
  product: ProductEntity,
  headers: Set<string>,
): ExportRowValues => {
  const values: ExportRowValues = new Map();

  values.set('Product Name*', product.name);
  values.set('Product Type *', product.productType);
  values.set('Category *', product.category?.name ?? null);
  if (product.subCategory?.name) values.set('Sub Category', product.subCategory.name);
  if (product.subSubCategory?.name) values.set('Sub Sub Category', product.subSubCategory.name);
  if (product.subSubSubCategory?.name) {
    values.set('Sub Sub Sub Category', product.subSubSubCategory.name);
  }
  if (product.brand?.name) values.set('Brand*', product.brand.name);

  const healthConcerns = joinPipe(
    product.healthConcernMappings?.map((item) => item.healthConcern?.name) ?? [],
  );
  if (healthConcerns) values.set('Health Concerns', healthConcerns);

  const wellnessGoals = joinPipe(
    product.wellnessGoalMappings?.map((item) => item.wellnessGoal?.name) ?? [],
  );
  if (wellnessGoals) values.set('Wellness Goals', wellnessGoals);

  const productTags = joinPipe(product.tagMappings?.map((item) => item.tag?.name) ?? []);
  if (productTags) values.set('Product Tags', productTags);

  if (product.externalProductId) {
    values.set('Product ID (String)', product.externalProductId);
  }
  if (product.singleProductUrl) values.set('Single Product URL', product.singleProductUrl);

  applyPackMetadata(values, product.packMetadata ?? []);
  if (product.manufacturerAddress) values.set('Manufacturer Address', product.manufacturerAddress);
  if (product.packerAddress) values.set('Packer Address', product.packerAddress);
  if (product.importerAddress) values.set('Importer Address', product.importerAddress);

  if (product.metaTitle) values.set('Meta Title', product.metaTitle);
  if (product.metaDescription) values.set('Meta Description', product.metaDescription);
  if (product.slug) {
    values.set('Slug URL', product.slug);
    values.set('Product URL Slug', product.slug);
  }
  if (product.metaKeywords?.length) {
    values.set('Meta Keywords', product.metaKeywords.join(', '));
  }

  const sizeChartKey = storageKey(product.sizeChart);
  if (sizeChartKey) {
    values.set('Size Chart URL', sizeChartKey);
    values.set('Size Chart', sizeChartKey);
  }

  values.set('Subscription Available', yesNo(product.subscriptionEnabled));
  if (product.returnPolicy) values.set('Return Policy', product.returnPolicy);
  if (product.returnWindowDays != null) {
    values.set('Return Window Days', product.returnWindowDays);
  }
  values.set('COD Available', yesNo(product.codAvailable));
  values.set('EMI Available', yesNo(product.emiAvailable));
  values.set('Replacement Allowed', yesNo(product.replaceAllowed));
  if (product.replaceWindowDays != null) {
    values.set('Replacement Window Days', product.replaceWindowDays);
  }

  if (product.manufacturer?.name) values.set('Manufacturer Name', product.manufacturer.name);
  if (product.packer?.name) values.set('Packer Name', product.packer.name);
  if (product.importer?.name) values.set('Importer Name', product.importer.name);
  if (product.countryOfOrigin?.name) values.set('Country of Origin', product.countryOfOrigin.name);
  if (product.components) values.set('Components', product.components);
  if (product.expiresInMonths != null) {
    values.set('Shelf Life in Months', product.expiresInMonths);
  }

  values.set('Product Status', product.status);

  const faqs =
    product.faqMappings?.map((mapping) => ({
      question: mapping.productFaq?.question ?? '',
      answer: mapping.productFaq?.answer ?? '',
    })).filter((faq) => faq.question && faq.answer) ?? [];
  applyFaqs(values, faqs);

  applyProductInformation(values, product.productInformation, headers);
  applyCategoryFilters(values, product.categoryFilterMappings);

  return values;
};

const getAttributeNames = (product: ProductEntity): string[] => {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const mapping of product.attributeMappings ?? []) {
    const name = mapping.attribute?.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  if (names.length) return names;

  for (const variant of product.variants ?? []) {
    for (const attributeValue of variant.attributeValues ?? []) {
      const name = attributeValue.attribute?.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }

  return names;
};

const mapSimpleProductRows = (
  product: ProductEntity,
  headers: string[],
  headerSet: Set<string>,
): ExportCellValue[][] => {
  const variant = product.variants?.[0];
  if (!variant) return [];

  const values = buildSharedProductValues(product, headerSet);
  const variantMedia =
    product.media?.filter((item) => item.variantId === variant.id) ?? [];
  applyVariantFields(values, variant, {
    includeVariantImages: true,
    attributeNames: getAttributeNames(product),
    variantMedia,
  });

  const productMedia = product.media?.filter((item) => !item.variantId) ?? [];
  if (productMedia.length) {
    applySimpleGalleryImages(values, productMedia);
  }

  return [buildRowFromValues(headers, values)];
};

const mapVariableProductRows = (
  product: ProductEntity,
  headers: string[],
  headerSet: Set<string>,
): ExportCellValue[][] => {
  const variants = [...(product.variants ?? [])].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  if (!variants.length) return [];

  const attributeNames = getAttributeNames(product);
  const styleGroupId = product.refId;
  const sharedValues = buildSharedProductValues(product, headerSet);
  const commonMedia = product.media?.filter((item) => !item.variantId) ?? [];

  return variants.map((variant, index) => {
    const values = new Map(sharedValues);
    values.set('Product Type *', ProductType.VARIABLE);
    values.set('style_group_id', styleGroupId);

    if (variant.displayName) {
      values.set('Product Name*', variant.displayName);
    }

    applyVariantFields(values, variant, {
      includeVariantImages: false,
      attributeNames,
      variantMedia: product.media?.filter((item) => item.variantId === variant.id) ?? [],
    });

    if (index === 0 && commonMedia.length) {
      applyCommonMedia(values, commonMedia);
    }

    return buildRowFromValues(headers, values);
  });
};

export interface IBulkExportLookupContext {
  skuLookup: Map<string, ProductVariantEntity>;
  productById: Map<string, ProductEntity>;
  variantSkuPriceLookup?: Map<string, { mrp: number | null; sellingPrice: number | null }>;
  firstVariantSkuByProductId?: Map<string, string>;
}

const mapBundleProductRows = (
  product: ProductEntity,
  headers: string[],
  headerSet: Set<string>,
  skuLookup: Map<string, ProductVariantEntity>,
  productById: Map<string, ProductEntity>,
  exportContext?: IBulkExportLookupContext,
): ExportCellValue[][] => {
  const parentVariant = product.variants?.[0];
  if (!parentVariant) return [];

  const bundleSku = parentVariant.sku;
  const parentValues = buildSharedProductValues(product, headerSet);
  parentValues.set('Product Type *', ProductType.BUNDLE);
  parentValues.set('Bundle SKU', bundleSku);

  const parentMrp = toNumber(parentVariant.mrp);
  const parentSellingPrice = toNumber(parentVariant.sellingPrice);
  if (parentMrp !== null) parentValues.set('Bundle MRP (Rs)', parentMrp);
  if (parentSellingPrice !== null) {
    parentValues.set('Bundle Selling Price (Rs)', parentSellingPrice);
  }

  applyVariantFields(parentValues, parentVariant, {
    includeVariantImages: true,
    attributeNames: [],
    variantMedia: product.media?.filter((item) => item.variantId === parentVariant.id) ?? [],
  });

  const rows: ExportCellValue[][] = [buildRowFromValues(headers, parentValues)];

  for (const bundleItem of product.bundleItems ?? []) {
    const childProduct =
      productById.get(bundleItem.childProductId) ?? bundleItem.childProduct ?? null;
    const childSku =
      childProduct?.variants?.[0]?.sku ??
      exportContext?.firstVariantSkuByProductId?.get(bundleItem.childProductId);
    if (!childSku) continue;

    const childValues: ExportRowValues = new Map();
    childValues.set('Product Type *', ProductType.BUNDLE);
    childValues.set('Bundle SKU', bundleSku);
    childValues.set('Product Name*', product.name);
    childValues.set('Child SKU', childSku);
    childValues.set('Child Quantity', bundleItem.quantity);

    if (childProduct?.name) {
      childValues.set('Child Product Name', childProduct.name);
    }

    const childVariant = skuLookup.get(childSku.toLowerCase());
    const childPrice =
      childVariant ??
      exportContext?.variantSkuPriceLookup?.get(childSku.toLowerCase());
    if (childVariant || childPrice) {
      const childMrp = toNumber(
        childVariant?.mrp ?? (childPrice && 'mrp' in childPrice ? childPrice.mrp : null),
      );
      const childSellingPrice = toNumber(
        childVariant?.sellingPrice ??
          (childPrice && 'sellingPrice' in childPrice ? childPrice.sellingPrice : null),
      );
      if (childMrp !== null) childValues.set('Child MRP (Rs)', childMrp);
      if (childSellingPrice !== null) {
        childValues.set('Child Selling Price (Rs)', childSellingPrice);
      }
    }

    rows.push(buildRowFromValues(headers, childValues));
  }

  return rows;
};

const buildSkuLookup = (products: ProductEntity[]): Map<string, ProductVariantEntity> => {
  const lookup = new Map<string, ProductVariantEntity>();
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      lookup.set(variant.sku.toLowerCase(), variant);
    }
  }
  return lookup;
};

export const createBulkExportLookupContext = (
  products: ProductEntity[],
  options?: {
    variantSkuPriceLookup?: Map<string, { mrp: number | null; sellingPrice: number | null }>;
    firstVariantSkuByProductId?: Map<string, string>;
  },
): IBulkExportLookupContext => ({
  skuLookup: buildSkuLookup(products),
  productById: new Map(products.map((product) => [product.id, product])),
  variantSkuPriceLookup: options?.variantSkuPriceLookup,
  firstVariantSkuByProductId: options?.firstVariantSkuByProductId,
});

export const mapProductsToBulkExportRows = (
  products: ProductEntity[],
  headers: string[],
  lookupContext?: IBulkExportLookupContext,
): ExportCellValue[][] => {
  const context =
    lookupContext ??
    createBulkExportLookupContext(products);
  const headerSet = new Set(headers);
  const rows: ExportCellValue[][] = [];

  const sortedProducts = [...products].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );

  for (const product of sortedProducts) {
    if (product.status === ProductStatus.ARCHIVED || product.status === ProductStatus.INACTIVE) {
      continue;
    }

    switch (product.productType) {
      case ProductType.VARIABLE:
        rows.push(...mapVariableProductRows(product, headers, headerSet));
        break;
      case ProductType.BUNDLE:
        rows.push(
          ...mapBundleProductRows(
            product,
            headers,
            headerSet,
            context.skuLookup,
            context.productById,
            context,
          ),
        );
        break;
      default:
        rows.push(...mapSimpleProductRows(product, headers, headerSet));
        break;
    }
  }

  return rows;
};
