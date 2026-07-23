import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductNatureEntity } from '@modules/master/entities/product-nature.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { WellnessGoalEntity } from '@modules/master/entities/wellness-goal.entity';
import { AttributeEntity } from '@modules/master/entities/attribute.entity';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { CountryEntity } from '@modules/master/entities/country.entity';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductEntity } from '../entities/product.entity';
import { ProductInformationLabelEntity } from '../entities/product-information-label.entity';
import { CategoryFilterEntity } from '@modules/master/entities/category-filter.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import {
  IParsedProductGroup,
  listSheetRowsForProductGroup,
} from './bulk-upload-parser.service';
import {
  BulkUploadProductInformationLabel,
  buildCategoryFilterColumnHeader,
  normalizeBulkUploadLookupKey,
} from '../utils/bulk-upload-columns.util';
import {
  MAX_GENERATED_VARIANTS,
  buildSkuPrefix,
  findDuplicateCombinationLabels,
  findMaxSkuSequenceForPrefix,
  flattenAttributeDetailNames,
  formatGeneratedSku,
} from '../utils/bulk-upload-variable.util';

type CachedCategoryFilter = {
  refId: string;
  name: string;
  allowedValues: Set<string>;
  categoryIds: Set<string>;
};

const ACTIVE_MASTER_WHERE = { status: MasterStatus.ACTIVE };

const masterRecordUnavailableReason = (label: string, value: string): string =>
  `${label} "${value}" does not exist or is inactive in master records.`;

const masterRecordUnavailableFix = (label: string): string =>
  `Use an active ${label} from master data.`;

export interface IValidationError {
  rowNumber: number;
  sku: string;
  column: string;
  invalidValue: string;
  reason: string;
  suggestedFix: string;
}

@Injectable()
export class BulkUploadValidatorService {
  private readonly logger = new Logger(BulkUploadValidatorService.name);

  // Cached Master mappings
  private natureMap = new Map<string, string>(); // name (lowercase) -> refId
  private brandMap = new Map<string, string>(); // name (lowercase) -> refId
  private categoryMap = new Map<string, string>(); // name (lowercase) -> refId
  private subCategoryMap = new Map<string, string>(); // name (lowercase) -> refId
  private subSubCategoryMap = new Map<string, string>(); // name (lowercase) -> refId
  private subSubSubCategoryMap = new Map<string, string>(); // name (lowercase) -> refId
  private wellnessGoalMap = new Map<string, string>(); // name (lowercase) -> refId
  private healthConcernMap = new Map<string, string>(); // name (lowercase) -> refId
  private tagMap = new Map<string, string>(); // name (lowercase) -> refId/slug
  private attributeMap = new Map<string, string>(); // name (lowercase) -> refId
  private manufacturerMap = new Map<string, string>(); // name (lowercase) -> refId
  private manufacturerByCodeMap = new Map<string, string>(); // code (lowercase) -> refId
  private packerMap = new Map<string, string>(); // name (lowercase) -> refId
  private importerMap = new Map<string, string>(); // name (lowercase) -> refId
  private countryMap = new Map<string, string>(); // name (lowercase) -> refId
  private skuToProductRefIdMap = new Map<string, string>(); // SKU (lowercase) -> parent product refId
  private vendorSkuToProductRefIdMap = new Map<string, string>(); // vendor SKU (lowercase) -> parent product refId
  private productRefIdToVariantSkusMap = new Map<string, string[]>(); // product refId -> variant SKUs (stable order)
  private productNameBrandToRefIdMap = new Map<string, string>(); // name|brand -> product refId (unique only)
  private productRefIdToNameMap = new Map<string, string>(); // product refId -> product name
  private productRefIdToExternalIdMap = new Map<string, string>(); // product refId -> externalProductId
  private dbSkus = new Set<string>();
  private dbExternalProductIds = new Set<string>();
  private externalProductIdToProductRefIdMap = new Map<string, string>(); // externalProductId (lowercase) -> product refId
  private categoryIdByName = new Map<string, string>(); // category name (lowercase) -> id
  private categoryFilterByLookupKey = new Map<string, CachedCategoryFilter>(); // name/refId (lowercase) -> filter
  private activeCategoryFilterNames = new Set<string>(); // normalized filter names
  private activeProductInformationLabels = new Map<string, BulkUploadProductInformationLabel>();
  private productInformationLabelSortOrders = new Map<string, number>();

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Pre-loads master data maps from the DB to execute in-memory O(1) validations.
   */
  async primeValidationCache(): Promise<void> {
    this.logger.log('Priming master validation caches...');

    const [
      natures,
      categories,
      brands,
      concerns,
      goals,
      tags,
      attributes,
      manufacturers,
      packers,
      importers,
      countries,
      skusWithProducts,
      externalProductIds,
      productsWithBrand,
      productInformationLabels,
      categoryFilters,
    ] = await Promise.all([
      this.dataSource.getRepository(ProductNatureEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(CategoryEntity).find({
        select: ['id', 'name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(BrandEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(HealthConcernEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(WellnessGoalEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(ProductTagEntity).find({
        select: ['name', 'slug'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(AttributeEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(ManufacturerEntity).find({
        select: ['name', 'refId', 'code'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(PackerEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(ImporterEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(CountryEntity).find({
        select: ['name', 'refId'],
        where: ACTIVE_MASTER_WHERE,
      }),
      this.dataSource.getRepository(ProductVariantEntity).find({
        relations: { product: true },
        select: {
          sku: true,
          vendorSku: true,
          product: {
            refId: true,
          },
        },
        order: { id: 'ASC' },
      }),
      this.dataSource.getRepository(ProductEntity).find({
        select: ['refId', 'externalProductId'],
        where: {},
      }),
      this.dataSource.getRepository(ProductEntity).find({
        select: ['refId', 'name'],
        relations: { brand: true },
        where: {},
      }),
      this.dataSource.getRepository(ProductInformationLabelEntity).find({
        select: ['name', 'sortOrder', 'status'],
        where: { status: MasterStatus.ACTIVE },
        order: { sortOrder: 'ASC', createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(CategoryFilterEntity).find({
        where: { status: MasterStatus.ACTIVE },
        relations: { categories: true },
        select: {
          id: true,
          refId: true,
          name: true,
          values: true,
          status: true,
          categories: {
            id: true,
            status: true,
          },
        },
      }),
    ]);

    this.natureMap = new Map(natures.map((n: any) => [n.name.toLowerCase().trim(), n.refId]));
    this.brandMap = new Map(brands.map((b: any) => [b.name.toLowerCase().trim(), b.refId]));
    this.categoryMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
    this.categoryIdByName = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.id]));
    this.subCategoryMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
    this.subSubCategoryMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
    this.subSubSubCategoryMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
    this.healthConcernMap = new Map(concerns.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
    this.wellnessGoalMap = new Map(goals.map((g: any) => [g.name.toLowerCase().trim(), g.refId]));
    this.tagMap = new Map(tags.map((t: any) => [t.name.toLowerCase().trim(), t.slug]));
    this.attributeMap = new Map();
    for (const attribute of attributes) {
      const refId = attribute.refId;
      const normalizedName = attribute.name.toLowerCase().trim();
      this.attributeMap.set(normalizedName, refId);
      this.attributeMap.set(refId.toLowerCase().trim(), refId);
    }
    this.manufacturerMap = new Map(
      manufacturers.map((m: any) => [
        m.name.toLowerCase().replace(/\s+/g, ' ').trim(),
        m.refId,
      ]),
    );
    this.manufacturerByCodeMap = new Map(
      manufacturers.map((m: any) => [String(m.code).toLowerCase().trim(), m.refId]),
    );
    this.packerMap = new Map(packers.map((p: any) => [p.name.toLowerCase().trim(), p.refId]));
    this.importerMap = new Map(importers.map((i: any) => [i.name.toLowerCase().trim(), i.refId]));
    this.countryMap = new Map(
      countries.map((co: any) => [normalizeBulkUploadLookupKey(co.name), co.refId]),
    );

    this.activeProductInformationLabels = new Map(
      productInformationLabels.map((label) => [
        label.name.toLowerCase().trim(),
        {
          name: label.name,
          sortOrder: label.sortOrder,
          status: label.status,
        },
      ]),
    );
    this.productInformationLabelSortOrders = new Map(
      productInformationLabels.map((label) => [label.name, label.sortOrder]),
    );

    this.categoryFilterByLookupKey = new Map();
    this.activeCategoryFilterNames = new Set();
    for (const filter of categoryFilters) {
      const cached: CachedCategoryFilter = {
        refId: filter.refId,
        name: filter.name,
        allowedValues: new Set((filter.values ?? []).map((value) => value.trim())),
        categoryIds: new Set(
          (filter.categories ?? [])
            .filter((category) => category.status === MasterStatus.ACTIVE)
            .map((category) => category.id),
        ),
      };
      const normalizedName = filter.name.toLowerCase().trim();
      this.categoryFilterByLookupKey.set(normalizedName, cached);
      this.categoryFilterByLookupKey.set(filter.refId.toLowerCase().trim(), cached);
      this.activeCategoryFilterNames.add(normalizedName);
    }

    this.dbSkus = new Set();
    this.skuToProductRefIdMap = new Map();
    this.vendorSkuToProductRefIdMap = new Map();
    this.productRefIdToVariantSkusMap = new Map();
    this.productNameBrandToRefIdMap = new Map();
    this.externalProductIdToProductRefIdMap = new Map();
    this.dbExternalProductIds = new Set(
      externalProductIds
        .map((product) => product.externalProductId?.toLowerCase().trim())
        .filter((value): value is string => Boolean(value)),
    );
    this.productRefIdToNameMap = new Map();
    this.productRefIdToExternalIdMap = new Map();
    for (const product of externalProductIds) {
      const normalizedExternalId = product.externalProductId?.toLowerCase().trim();
      if (!normalizedExternalId) continue;
      this.externalProductIdToProductRefIdMap.set(normalizedExternalId, product.refId);
      this.productRefIdToExternalIdMap.set(product.refId, product.externalProductId!);
    }
    for (const v of skusWithProducts) {
      if (v.sku) {
        const normSku = v.sku.toLowerCase().trim();
        this.dbSkus.add(normSku);
        if (v.product) {
          this.skuToProductRefIdMap.set(normSku, v.product.refId);
          const variantSkus = this.productRefIdToVariantSkusMap.get(v.product.refId) ?? [];
          variantSkus.push(v.sku);
          this.productRefIdToVariantSkusMap.set(v.product.refId, variantSkus);
        }
      }
      const normVendorSku = v.vendorSku?.toLowerCase().trim();
      if (normVendorSku && v.product?.refId) {
        this.vendorSkuToProductRefIdMap.set(normVendorSku, v.product.refId);
      }
    }

    const nameBrandCounts = new Map<string, number>();
    for (const product of productsWithBrand) {
      const brandName = product.brand?.name?.toLowerCase().trim();
      if (!product.name?.trim() || !brandName) continue;
      const key = `${product.name.toLowerCase().trim()}|${brandName}`;
      nameBrandCounts.set(key, (nameBrandCounts.get(key) ?? 0) + 1);
      // build name map while iterating (last writer wins for duplicates — fine for display)
      this.productRefIdToNameMap.set(product.refId, product.name.trim());
    }
    for (const product of productsWithBrand) {
      const brandName = product.brand?.name?.toLowerCase().trim();
      if (!product.name?.trim() || !brandName) continue;
      const key = `${product.name.toLowerCase().trim()}|${brandName}`;
      if (nameBrandCounts.get(key) === 1) {
        this.productNameBrandToRefIdMap.set(key, product.refId);
      }
    }

    this.logger.log(`Caches primed: Natures=${this.natureMap.size}, Brands=${this.brandMap.size}, Categories=${this.categoryMap.size}, CategoryFilters=${this.activeCategoryFilterNames.size}, DB SKUs=${this.dbSkus.size}`);
    console.log('[BULK_UPLOAD_DEBUG][Validator.primeValidationCache] CATEGORY_CACHE_READY', {
      categoryCount: this.categoryMap.size,
      hasDieabities: this.categoryMap.has('dieabities'),
      hasVelitExercitationem: this.categoryMap.has('velit exercitationem'),
      sampleCategories: Array.from(this.categoryMap.keys()).slice(0, 20),
    });
  }

  getActiveProductInformationLabels(): ReadonlyMap<string, BulkUploadProductInformationLabel> {
    return this.activeProductInformationLabels;
  }

  getProductInformationLabelSortOrders(): ReadonlyMap<string, number> {
    return this.productInformationLabelSortOrders;
  }

  getActiveCategoryFilterNames(): ReadonlySet<string> {
    return this.activeCategoryFilterNames;
  }

  /**
   * Resolves attribute refId by normalized name or refId lookup key.
   */
  /**
   * Returns a human-readable label for a product refId: "Product Name (ID: extId)" or just refId.
   */
  private productLabel(refId: string): string {
    const name = this.productRefIdToNameMap.get(refId);
    const extId = this.productRefIdToExternalIdMap.get(refId);
    if (name && extId) return `"${name}" (Product ID: ${extId})`;
    if (name) return `"${name}"`;
    return refId;
  }

  resolveAttributeRefId(nameOrRefId: string): string | undefined {
    return this.attributeMap.get(nameOrRefId.toLowerCase().trim());
  }

  resolveAttributeDisplayName(nameOrRefId: string): string {
    const refId = this.resolveAttributeRefId(nameOrRefId);
    return refId ?? nameOrRefId;
  }

  /**
   * Resolves child product refId by SKU code.
   */
  resolveProductRefIdBySku(sku: string): string | undefined {
    return this.skuToProductRefIdMap.get(sku.toLowerCase().trim());
  }

  resolveExistingProductRefIdForGroup(group: IParsedProductGroup): string | undefined {
    const foundRefIds = new Set<string>();

    if (group.externalProductId?.trim()) {
      const refId = this.externalProductIdToProductRefIdMap.get(
        group.externalProductId.toLowerCase().trim(),
      );
      if (refId) foundRefIds.add(refId);
    }

    if (group.vendorSku?.trim()) {
      const refId = this.vendorSkuToProductRefIdMap.get(group.vendorSku.toLowerCase().trim());
      if (refId) foundRefIds.add(refId);
    }

    for (const variant of group.variants ?? []) {
      if (!variant.sku?.trim()) continue;
      const refId = this.resolveProductRefIdBySku(variant.sku);
      if (refId) foundRefIds.add(refId);
    }

    if (group.name?.trim() && group.brand?.trim()) {
      const key = `${group.name.toLowerCase().trim()}|${group.brand.toLowerCase().trim()}`;
      const refId = this.productNameBrandToRefIdMap.get(key);
      if (refId) foundRefIds.add(refId);
    }

    if (foundRefIds.size === 0) {
      return undefined;
    }

    if (foundRefIds.size === 1) {
      return Array.from(foundRefIds)[0];
    }

    return undefined;
  }

  /**
   * Helper to map parsed strings to the entity refId reference values.
   */
  resolveReferences(group: IParsedProductGroup): {
    productNatureRefId?: string;
    brandRefId?: string;
    categoryRefId?: string;
    subCategoryRefId?: string;
    subSubCategoryRefId?: string;
    subSubSubCategoryRefId?: string;
    healthConcernRefIds?: string[];
    wellnessGoalRefIds?: string[];
    manufacturerRefId?: string;
    packerRefId?: string;
    importerRefId?: string;
    countryOfOriginRefId?: string;
  } {
    return {
      productNatureRefId: group.productNature ? this.natureMap.get(group.productNature.toLowerCase().trim()) : undefined,
      brandRefId: group.brand ? this.brandMap.get(group.brand.toLowerCase().trim()) : undefined,
      categoryRefId: group.category ? this.categoryMap.get(group.category.toLowerCase().trim()) : undefined,
      subCategoryRefId: group.subCategory ? this.subCategoryMap.get(group.subCategory.toLowerCase().trim()) : undefined,
      subSubCategoryRefId: group.subSubCategory ? this.subSubCategoryMap.get(group.subSubCategory.toLowerCase().trim()) : undefined,
      subSubSubCategoryRefId: group.subSubSubCategory ? this.subSubSubCategoryMap.get(group.subSubSubCategory.toLowerCase().trim()) : undefined,
      healthConcernRefIds: group.healthConcerns ? group.healthConcerns.map(hc => this.healthConcernMap.get(hc.toLowerCase().trim())!).filter(Boolean) : [],
      wellnessGoalRefIds: (group as any).wellnessGoals ? (group as any).wellnessGoals.map((wg: string) => this.wellnessGoalMap.get(wg.toLowerCase().trim())!).filter(Boolean) : [],
      manufacturerRefId: group.manufacturer ? this.manufacturerMap.get(group.manufacturer.toLowerCase().replace(/\s+/g, ' ').trim()) : undefined,
      packerRefId: group.packer ? this.packerMap.get(group.packer.toLowerCase().trim()) : undefined,
      importerRefId: group.importer ? this.importerMap.get(group.importer.toLowerCase().trim()) : undefined,
      countryOfOriginRefId: group.countryOfOrigin
        ? this.countryMap.get(normalizeBulkUploadLookupKey(group.countryOfOrigin))
        : undefined,
    };
  }

  /** Resolve manufacturer master by exact/normalized name (addresses are stored as names). */
  resolveManufacturerRefIdByName(name: string): string | undefined {
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return undefined;
    return this.manufacturerMap.get(normalized);
  }

  /** Resolve manufacturer by unique import code (EXT{Product ID}). */
  resolveManufacturerRefIdByCode(code: string): string | undefined {
    const normalized = code.toLowerCase().trim();
    if (!normalized) return undefined;
    return this.manufacturerByCodeMap.get(normalized);
  }

  /** Resolve manufacturer imported for a Product ID (code = EXT{id}). */
  resolveManufacturerRefIdByProductId(productId: string): string | undefined {
    const id = productId.trim();
    if (!id) return undefined;
    return this.resolveManufacturerRefIdByCode(`EXT${id}`);
  }

  /**
   * Validates a batch of grouped products and accumulates validation errors.
   */
  validateBatch(
    batch: IParsedProductGroup[],
    sheetSkus: Set<string>,
    sheetExternalProductIds: Set<string> = new Set(),
  ): { errors: IValidationError[]; validatedProducts: IParsedProductGroup[] } {
    const errors: IValidationError[] = [];
    const validatedProducts: IParsedProductGroup[] = [];

    for (const group of batch) {
      const groupErrors: IValidationError[] = [];
      const productSku = group.variants[0]?.sku ?? 'PARENT';
      let resolvedExistingProductRefId = this.resolveExistingProductRefIdForGroup(group);
      const existingProductRefIds = new Set<string>();
      if (resolvedExistingProductRefId) {
        existingProductRefIds.add(resolvedExistingProductRefId);
      }
      for (const variant of group.variants) {
        const refId = variant.sku?.trim()
          ? this.resolveProductRefIdBySku(variant.sku)
          : undefined;
        if (refId) existingProductRefIds.add(refId);
      }
      if (!resolvedExistingProductRefId && existingProductRefIds.size === 1) {
        resolvedExistingProductRefId = Array.from(existingProductRefIds)[0];
      }

      if (existingProductRefIds.size > 1) {
        // Build a readable breakdown: group the SKUs by the product they resolve to.
        const skusByProduct = new Map<string, string[]>();
        for (const variant of group.variants) {
          const skuRefId = variant.sku?.trim()
            ? this.resolveProductRefIdBySku(variant.sku)
            : undefined;
          const bucket = skuRefId ?? '__new__';
          const list = skusByProduct.get(bucket) ?? [];
          list.push(variant.sku);
          skusByProduct.set(bucket, list);
        }
        const breakdown = [...skusByProduct.entries()]
          .filter(([bucket]) => bucket !== '__new__')
          .map(([refId, skus]) => `${skus.join(', ')} → ${this.productLabel(refId)}`)
          .join(' | ');

        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: 'Product SKU Code',
          invalidValue: group.variants.map((variant) => variant.sku).join(', '),
          reason: `The SKUs in this group belong to ${existingProductRefIds.size} different products in the database. A single import row (or style_group_id group) can only create or update one product. Breakdown: ${breakdown}`,
          suggestedFix: 'Split these SKUs into separate rows — one row (or style_group_id group) per product. Each row must contain only SKUs that belong to the same product.',
        });
      }

      // A. Mandatory Parent Field Validations
      if (!group.name) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: 'Product Name',
          invalidValue: '',
          reason: 'Product name is mandatory.',
          suggestedFix: 'Enter a valid product name.',
        });
      }

      if (group.productNature) {
        const refId = this.natureMap.get(group.productNature.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Product Nature',
            invalidValue: group.productNature,
            reason: masterRecordUnavailableReason('Product nature', group.productNature),
            suggestedFix: masterRecordUnavailableFix('product nature'),
          });
        }
      }

      if (!group.category) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: 'Category',
          invalidValue: '',
          reason: 'Category name is mandatory.',
          suggestedFix: 'Enter a valid category name.',
        });
      } else {
        const normalizedCategory = group.category.toLowerCase().trim();
        const refId = this.categoryMap.get(normalizedCategory);
        console.log('[BULK_UPLOAD_DEBUG][Validator.validateBatch] CATEGORY_CHECK', {
          rowNumber: group.rowNumber,
          rawCategory: group.category,
          normalizedCategory,
          found: Boolean(refId),
          refId: refId ?? null,
          availableMatchHints: Array.from(this.categoryMap.keys()).filter((name) =>
            name.includes(normalizedCategory) || normalizedCategory.includes(name),
          ).slice(0, 10),
        });
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Category',
            invalidValue: group.category,
            reason: masterRecordUnavailableReason('Category', group.category),
            suggestedFix: masterRecordUnavailableFix('category'),
          });
        }
      }

      if (!group.brand) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: 'Brand',
          invalidValue: '',
          reason: 'Brand name is mandatory.',
          suggestedFix: 'Enter a valid brand name from Brand master.',
        });
      } else {
        const refId = this.brandMap.get(group.brand.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Brand',
            invalidValue: group.brand,
            reason: masterRecordUnavailableReason('Brand', group.brand),
            suggestedFix: masterRecordUnavailableFix('brand'),
          });
        }
      }

      this.validateSubCategories(group, groupErrors);

      if (group.wellnessGoals && group.wellnessGoals.length > 0) {
        for (const goal of group.wellnessGoals) {
          const refId = this.wellnessGoalMap.get(goal.toLowerCase().trim());
          if (!refId) {
            groupErrors.push({
              rowNumber: group.rowNumber,
              sku: productSku,
              column: 'Wellness Goals',
              invalidValue: goal,
              reason: masterRecordUnavailableReason('Wellness goal', goal),
              suggestedFix: masterRecordUnavailableFix('wellness goal'),
            });
          }
        }
      }

      if (group.healthConcerns && group.healthConcerns.length > 0) {
        for (const concern of group.healthConcerns) {
          const refId = this.healthConcernMap.get(concern.toLowerCase().trim());
          if (!refId) {
            groupErrors.push({
              rowNumber: group.rowNumber,
              sku: productSku,
              column: 'Health Concerns',
              invalidValue: concern,
              reason: masterRecordUnavailableReason('Health concern', concern),
              suggestedFix: masterRecordUnavailableFix('health concern'),
            });
          }
        }
      }

      if (group.manufacturer) {
        const refId = this.manufacturerMap.get(
          group.manufacturer.toLowerCase().replace(/\s+/g, ' ').trim(),
        );
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Manufacturer',
            invalidValue: group.manufacturer,
            reason: masterRecordUnavailableReason('Manufacturer', group.manufacturer),
            suggestedFix: masterRecordUnavailableFix('manufacturer'),
          });
        }
      }

      if (group.packer) {
        const refId = this.packerMap.get(group.packer.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Packer',
            invalidValue: group.packer,
            reason: masterRecordUnavailableReason('Packer', group.packer),
            suggestedFix: masterRecordUnavailableFix('packer'),
          });
        }
      }

      if (group.importer) {
        const refId = this.importerMap.get(group.importer.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Importer',
            invalidValue: group.importer,
            reason: masterRecordUnavailableReason('Importer', group.importer),
            suggestedFix: masterRecordUnavailableFix('importer'),
          });
        }
      }

      if (group.countryOfOrigin) {
        const refId = this.countryMap.get(normalizeBulkUploadLookupKey(group.countryOfOrigin));
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Country of Origin',
            invalidValue: group.countryOfOrigin,
            reason: masterRecordUnavailableReason('Country', group.countryOfOrigin),
            suggestedFix: masterRecordUnavailableFix('country'),
          });
        }
      }

      // Track Product IDs from parent (simple) and each vertical variant row.
      const productIdsToCheck: Array<{ rowNumber: number; sku: string; id: string }> = [];
      const seenCheckIds = new Set<string>();
      const pushProductId = (rowNumber: number, sku: string, rawId: string | undefined) => {
        const id = rawId?.trim();
        if (!id) return;
        const key = id.toLowerCase();
        if (seenCheckIds.has(key)) return;
        seenCheckIds.add(key);
        productIdsToCheck.push({ rowNumber, sku, id });
      };
      pushProductId(group.rowNumber, productSku, group.externalProductId);
      for (const variant of group.variants ?? []) {
        pushProductId(variant.rowNumber, variant.sku || productSku, variant.externalProductId);
      }

      for (const item of productIdsToCheck) {
        const normalizedExternalId = item.id.toLowerCase();
        if (sheetExternalProductIds.has(normalizedExternalId)) {
          groupErrors.push({
            rowNumber: item.rowNumber,
            sku: item.sku,
            column: 'Product ID (String)',
            invalidValue: item.id,
            reason: `Product ID "${item.id}" is duplicated within the spreadsheet.`,
            suggestedFix: 'Assign a unique Product ID per product/variant row.',
          });
        } else {
          sheetExternalProductIds.add(normalizedExternalId);
        }

        const existingExternalIdProductRefId =
          this.externalProductIdToProductRefIdMap.get(normalizedExternalId);
        if (existingExternalIdProductRefId) {
          if (
            resolvedExistingProductRefId &&
            resolvedExistingProductRefId !== existingExternalIdProductRefId
          ) {
            const pidProduct  = this.productLabel(existingExternalIdProductRefId);
            const skuProduct  = this.productLabel(resolvedExistingProductRefId);
            const correctExtId = this.productRefIdToExternalIdMap.get(resolvedExistingProductRefId);
            groupErrors.push({
              rowNumber: item.rowNumber,
              sku: item.sku,
              column: 'Product ID (String)',
              invalidValue: item.id,
              reason: `Product ID "${item.id}" is already linked to ${pidProduct} in the database, but the SKU on this row belongs to a different product: ${skuProduct}. These two products cannot be merged into one row.`,
              suggestedFix: correctExtId
                ? `To update the product this SKU belongs to, change "Product ID (String)" to "${correctExtId}". To update the product this Product ID belongs to, use its own SKU(s) instead.`
                : 'Clear the "Product ID (String)" column on this row so the system matches by SKU only, or use the correct Product ID for the product this SKU belongs to.',
            });
          } else {
            resolvedExistingProductRefId = existingExternalIdProductRefId;
          }
        }
      }

      if (group.productTags && group.productTags.length > 0) {
        for (const tag of group.productTags) {
          const slug = this.tagMap.get(tag.toLowerCase().trim());
          if (!slug) {
            groupErrors.push({
              rowNumber: group.rowNumber,
              sku: productSku,
              column: 'Product Tags',
              invalidValue: tag,
              reason: masterRecordUnavailableReason('Product tag', tag),
              suggestedFix: masterRecordUnavailableFix('product tag'),
            });
          }
        }
      }

      this.validatePackMetadata(group, groupErrors);
      this.validateCategoryFilters(group, groupErrors);

      // B. Simple and Variable Product Validations
      if (group.productType === 'simple') {
        this.validateSimpleProductVariants(group, groupErrors, sheetSkus, resolvedExistingProductRefId);
      } else if (group.productType === 'variable') {
        this.validateVariableProduct(group, groupErrors, sheetSkus, resolvedExistingProductRefId);
      }

      // C. Bundle Product Validations
      if (group.productType === 'bundle') {
        if (group.bundleItems.length === 0) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: 'Child SKU',
            invalidValue: '',
            reason: 'Bundles must specify at least one child product row.',
            suggestedFix: 'Define child SKUs mapped to this bundle parent.',
          });
        }

        for (const item of group.bundleItems) {
          if (!item.childSku) {
            groupErrors.push({
              rowNumber: item.rowNumber,
              sku: 'EMPTY',
              column: 'Child SKU',
              invalidValue: '',
              reason: 'Child SKU is mandatory for bundle mappings.',
              suggestedFix: 'Enter a valid child SKU.',
            });
            continue;
          }

          const normChildSku = item.childSku.toLowerCase().trim();
          // Check that child SKU exists in DB
          if (!this.dbSkus.has(normChildSku) && !sheetSkus.has(normChildSku)) {
            groupErrors.push({
              rowNumber: item.rowNumber,
              sku: item.childSku,
              column: 'Child SKU',
              invalidValue: item.childSku,
              reason: `Child SKU "${item.childSku}" does not exist in the database or sheet.`,
              suggestedFix: 'Upload the child product first before bundling it.',
            });
          }

          if (item.quantity <= 0) {
            groupErrors.push({
              rowNumber: item.rowNumber,
              sku: item.childSku,
              column: 'Child Quantity',
              invalidValue: String(item.quantity),
              reason: 'Child item quantity must be greater than zero.',
              suggestedFix: 'Enter a positive quantity (e.g. 1, 2).',
            });
          }
        }
      }

      if (groupErrors.length > 0) {
        errors.push(...this.ensureErrorsCoverAllGroupRows(group, groupErrors));
      } else {
        validatedProducts.push(group);
      }
    }

    return { errors, validatedProducts };
  }

  /**
   * Failed product groups increment failedRows by every spreadsheet row in the group
   * (style_group / bundle). Ensure the error summary has at least one entry per those rows
   * so Failed count and Error Summary stay aligned.
   */
  private ensureErrorsCoverAllGroupRows(
    group: IParsedProductGroup,
    groupErrors: IValidationError[],
  ): IValidationError[] {
    if (!groupErrors.length) return groupErrors;

    const coveredRows = new Set(groupErrors.map((error) => error.rowNumber));
    const primary = groupErrors[0];
    const coverageErrors: IValidationError[] = [];

    for (const row of listSheetRowsForProductGroup(group)) {
      if (coveredRows.has(row.rowNumber)) continue;
      coverageErrors.push({
        rowNumber: row.rowNumber,
        sku: row.sku,
        column: 'Product',
        invalidValue: group.name || '',
        reason:
          `This spreadsheet row was not imported because its product group failed validation. ` +
          `Related error (row ${primary.rowNumber}, ${primary.column}): ${primary.reason}`,
        suggestedFix: primary.suggestedFix,
      });
    }

    return coverageErrors.length ? [...groupErrors, ...coverageErrors] : groupErrors;
  }

  private validateSimpleProductVariants(
    group: IParsedProductGroup,
    groupErrors: IValidationError[],
    sheetSkus: Set<string>,
    resolvedExistingProductRefId?: string,
  ): void {
    const productSku = group.variants[0]?.sku ?? 'PARENT';
    if (group.variants.length === 0) {
      groupErrors.push({
        rowNumber: group.rowNumber,
        sku: productSku,
        column: 'Product SKU Code',
        invalidValue: '',
        reason: 'At least one variant or product SKU row must be associated with the product.',
        suggestedFix: 'Add a variant row specifying Product SKU Code, MRP, and Selling Price.',
      });
      return;
    }

    for (const variant of group.variants) {
      this.validateVariantSku(variant, groupErrors, sheetSkus, resolvedExistingProductRefId, true);
      this.validateVariantPricing(variant, groupErrors, productSku);
    }
  }

  private validateVariableProduct(
    group: IParsedProductGroup,
    groupErrors: IValidationError[],
    sheetSkus: Set<string>,
    resolvedExistingProductRefId?: string,
  ): void {
    const productSku = group.variants[0]?.sku ?? 'PARENT';
    if (!group.styleGroupId) {
      groupErrors.push({
        rowNumber: group.rowNumber,
        sku: productSku,
        column: 'style_group_id',
        invalidValue: '',
        reason:
          'Variable products must use vertical rows bound by style_group_id (horizontal att_mrp_N slots are no longer supported).',
        suggestedFix:
          'Put the same style_group_id on each variant row (e.g. 5005), with per-row Product ID, SKU, prices, attributes, and images.',
      });
    }

    if (group.variants.length < 2) {
      groupErrors.push({
        rowNumber: group.rowNumber,
        sku: productSku,
        column: 'style_group_id',
        invalidValue: group.styleGroupId ?? '',
        reason: 'A variable style_group_id group must include at least 2 vertical variant rows.',
        suggestedFix: 'Add another sheet row with the same style_group_id, or leave style_group_id blank for a simple product.',
      });
      return;
    }

    if (group.variants.length > MAX_GENERATED_VARIANTS) {
      groupErrors.push({
        rowNumber: group.rowNumber,
        sku: productSku,
        column: 'style_group_id',
        invalidValue: String(group.variants.length),
        reason: `Variable product would create ${group.variants.length} variants, which exceeds the limit of ${MAX_GENERATED_VARIANTS}.`,
        suggestedFix: 'Reduce the number of rows sharing this style_group_id.',
      });
      return;
    }

    this.assignMissingVariableSkus(group, sheetSkus, resolvedExistingProductRefId);

    const productIdsInGroup = new Set<string>();
    for (const variant of group.variants) {
      const pid = variant.externalProductId?.trim().toLowerCase();
      if (!pid) continue;
      if (productIdsInGroup.has(pid)) {
        groupErrors.push({
          rowNumber: variant.rowNumber,
          sku: variant.sku || productSku,
          column: 'Product ID (String)',
          invalidValue: variant.externalProductId ?? '',
          reason: `Product ID "${variant.externalProductId}" is duplicated within style_group_id "${group.styleGroupId}".`,
          suggestedFix: 'Each variant row in a style group must have a unique Product ID.',
        });
      }
      productIdsInGroup.add(pid);
    }

    const resolvedVariantAttributes: Array<
      Array<{ attributeRefId: string; value: string; label: string }>
    > = [];

    for (const variant of group.variants) {
      this.validateVariantSku(variant, groupErrors, sheetSkus, resolvedExistingProductRefId, false);
      this.validateVariantPricing(variant, groupErrors, productSku);

      const resolvedAttributes: Array<{ attributeRefId: string; value: string; label: string }> = [];
      const attributeDetailNames = flattenAttributeDetailNames(group.attributeDetailNames ?? []);
      for (const attribute of variant.attributes ?? []) {
        const lookup = attribute.name;
        if (!lookup?.trim()) continue;

        let attributeRefId = this.resolveAttributeRefId(lookup);
        let resolvedLabel = lookup;
        if (!attributeRefId) {
          for (const candidate of flattenAttributeDetailNames([lookup])) {
            attributeRefId = this.resolveAttributeRefId(candidate);
            if (attributeRefId) {
              resolvedLabel = candidate;
              break;
            }
          }
        }

        if (!attributeRefId) {
          groupErrors.push({
            rowNumber: variant.rowNumber,
            sku: variant.sku || productSku,
            column: `Attribute: ${attribute.name}`,
            invalidValue: lookup,
            reason: masterRecordUnavailableReason('Attribute', lookup),
            suggestedFix: masterRecordUnavailableFix('attribute'),
          });
          continue;
        }
        resolvedAttributes.push({
          attributeRefId,
          value: attribute.value,
          label:
            resolvedLabel ||
            attributeDetailNames.find(
              (name) => name.toLowerCase() === lookup.toLowerCase(),
            ) ||
            attributeRefId,
        });
      }

      if (resolvedAttributes.length) {
        resolvedVariantAttributes.push(resolvedAttributes);
      }
    }

    const duplicateCombinations = findDuplicateCombinationLabels(resolvedVariantAttributes);
    for (const combination of duplicateCombinations) {
      groupErrors.push({
        rowNumber: group.rowNumber,
        sku: productSku,
        column: 'Attribute Values',
        invalidValue: combination,
        reason: `Duplicate variant attribute combinations detected (${combination}).`,
        suggestedFix: 'Ensure each variant row has a unique attribute combination.',
      });
    }
  }

  private assignMissingVariableSkus(
    group: IParsedProductGroup,
    sheetSkus: Set<string>,
    existingProductRefId?: string,
  ): void {
    if (!group.category?.trim() || !group.brand?.trim()) {
      return;
    }

    const hasMissingSku = group.variants.some((variant) => !variant.sku?.trim());
    if (!hasMissingSku) {
      return;
    }

    const prefix = buildSkuPrefix(group.category, group.brand);
    const existingSkus = [...this.dbSkus, ...sheetSkus];
    let sequence = findMaxSkuSequenceForPrefix(prefix, existingSkus);
    const reservedInGroup = new Set<string>();
    const reusableSkus = existingProductRefId
      ? [...(this.productRefIdToVariantSkusMap.get(existingProductRefId) ?? [])]
      : [];

    for (const [index, variant] of group.variants.entries()) {
      if (variant.sku?.trim()) {
        reservedInGroup.add(variant.sku.toLowerCase().trim());
        continue;
      }

      const reusedSku = reusableSkus[index]?.trim();
      if (reusedSku) {
        variant.sku = reusedSku;
        reservedInGroup.add(reusedSku.toLowerCase());
        continue;
      }

      let sku = '';
      do {
        sequence += 1;
        sku = formatGeneratedSku(prefix, sequence);
      } while (
        this.dbSkus.has(sku.toLowerCase()) ||
        sheetSkus.has(sku.toLowerCase()) ||
        reservedInGroup.has(sku.toLowerCase())
      );

      variant.sku = sku;
      reservedInGroup.add(sku.toLowerCase());
    }
  }

  private validateVariantSku(
    variant: IParsedProductGroup['variants'][number],
    groupErrors: IValidationError[],
    sheetSkus: Set<string>,
    resolvedExistingProductRefId: string | undefined,
    skuMandatory: boolean,
  ): void {
    if (!variant.sku?.trim()) {
      if (skuMandatory) {
        groupErrors.push({
          rowNumber: variant.rowNumber,
          sku: 'EMPTY',
          column: 'Product SKU Code',
          invalidValue: '',
          reason: 'Product SKU Code is mandatory.',
          suggestedFix: 'Define a unique Product SKU Code.',
        });
      }
      return;
    }

    const normSku = variant.sku.toLowerCase().trim();
    if (sheetSkus.has(normSku)) {
      groupErrors.push({
        rowNumber: variant.rowNumber,
        sku: variant.sku,
        column: 'Product SKU Code',
        invalidValue: variant.sku,
        reason: `Product SKU Code "${variant.sku}" is duplicated within the spreadsheet.`,
        suggestedFix: 'Assign unique Product SKU Codes to distinct variants.',
      });
      return;
    }

    sheetSkus.add(normSku);

    if (this.dbSkus.has(normSku)) {
      const existingSkuProductRefId = this.resolveProductRefIdBySku(variant.sku);
      if (
        resolvedExistingProductRefId &&
        existingSkuProductRefId &&
        existingSkuProductRefId === resolvedExistingProductRefId
      ) {
        return;
      }

      const ownerLabel = existingSkuProductRefId
        ? this.productLabel(existingSkuProductRefId)
        : 'another product';
      const ownerExtId = existingSkuProductRefId
        ? this.productRefIdToExternalIdMap.get(existingSkuProductRefId)
        : undefined;
      groupErrors.push({
        rowNumber: variant.rowNumber,
        sku: variant.sku,
        column: 'Product SKU Code',
        invalidValue: variant.sku,
        reason: `SKU "${variant.sku}" already belongs to ${ownerLabel} in the database. It cannot be assigned to a different product.`,
        suggestedFix: ownerExtId
          ? `To update ${ownerLabel}, set "Product ID (String)" to "${ownerExtId}" and keep this SKU. To create a new product, use a different SKU.`
          : `To update the product that owns this SKU, include its Product ID in the "Product ID (String)" column. To create a new product, use a different SKU.`,
      });
    }
  }

  private validateVariantPricing(
    variant: IParsedProductGroup['variants'][number],
    groupErrors: IValidationError[],
    parentSku: string,
  ): void {
    if (variant.mrp <= 0) {
      groupErrors.push({
        rowNumber: variant.rowNumber,
        sku: variant.sku || parentSku,
        column: 'MRP',
        invalidValue: String(variant.mrp),
        reason: 'MRP must be greater than zero.',
        suggestedFix: 'Enter a valid numerical MRP.',
      });
    }

    if (variant.sellingPrice <= 0) {
      groupErrors.push({
        rowNumber: variant.rowNumber,
        sku: variant.sku || parentSku,
        column: 'Selling Price',
        invalidValue: String(variant.sellingPrice),
        reason: 'Selling price must be greater than zero.',
        suggestedFix: 'Enter a valid numerical selling price.',
      });
    }

    if (variant.sellingPrice > variant.mrp) {
      groupErrors.push({
        rowNumber: variant.rowNumber,
        sku: variant.sku || parentSku,
        column: 'Selling Price',
        invalidValue: `${variant.sellingPrice} vs MRP ${variant.mrp}`,
        reason: 'Selling price cannot exceed the product MRP.',
        suggestedFix: 'Lower the selling price or adjust the MRP.',
      });
    }
  }

  private validateSubCategories(group: IParsedProductGroup, groupErrors: IValidationError[]): void {
    const productSku = group.variants[0]?.sku ?? 'PARENT';
    const checks: Array<{ value?: string; column: string; map: Map<string, string> }> = [
      { value: group.subCategory, column: 'Sub Category', map: this.subCategoryMap },
      { value: group.subSubCategory, column: 'Sub Sub Category', map: this.subSubCategoryMap },
      {
        value: group.subSubSubCategory,
        column: 'Sub Sub Sub Category',
        map: this.subSubSubCategoryMap,
      },
    ];

    for (const { value, column, map } of checks) {
      if (!value?.trim()) continue;
      if (!map.get(value.toLowerCase().trim())) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column,
          invalidValue: value,
          reason: masterRecordUnavailableReason(column, value),
          suggestedFix: masterRecordUnavailableFix('category'),
        });
      }
    }
  }

  private validatePackMetadata(group: IParsedProductGroup, groupErrors: IValidationError[]): void {
    const productSku = group.variants[0]?.sku ?? 'PARENT';
    for (const pack of group.packMetadata ?? []) {
      const packLabel = `Pack ${pack.packNumber}`;
      const hasSku = Boolean(pack.skuCode?.trim());
      const hasPrice = pack.mrp !== undefined || pack.sellingPrice !== undefined;
      const hasOtherFields = Boolean(
        pack.name?.trim() ||
          pack.barcode?.trim() ||
          pack.productId?.trim() ||
          pack.url?.trim() ||
          pack.unit?.trim(),
      );

      if ((hasPrice || hasOtherFields) && !hasSku) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: `${packLabel} SKU Code`,
          invalidValue: '',
          reason: `${packLabel} is partially filled but missing Pack SKU Code.`,
          suggestedFix: `Provide Pack SKU Code ${pack.packNumber} when other ${packLabel} fields are set.`,
        });
      }

      if (pack.mrp !== undefined && pack.mrp <= 0) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: `${packLabel} MRP`,
          invalidValue: String(pack.mrp),
          reason: `${packLabel} MRP must be greater than zero.`,
          suggestedFix: `Enter a valid numerical value for Pack MRP ${pack.packNumber}.`,
        });
      }

      if (pack.sellingPrice !== undefined && pack.sellingPrice <= 0) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: `${packLabel} Selling Price`,
          invalidValue: String(pack.sellingPrice),
          reason: `${packLabel} selling price must be greater than zero.`,
          suggestedFix: `Enter a valid numerical value for Pack Selling Price ${pack.packNumber}.`,
        });
      }

      if (
        pack.mrp !== undefined &&
        pack.sellingPrice !== undefined &&
        pack.sellingPrice > pack.mrp
      ) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: `${packLabel} Selling Price`,
          invalidValue: `${pack.sellingPrice} vs MRP ${pack.mrp}`,
          reason: `${packLabel} selling price cannot exceed pack MRP.`,
          suggestedFix: `Lower Pack Selling Price ${pack.packNumber} or adjust Pack MRP ${pack.packNumber}.`,
        });
      }
    }
  }

  private validateCategoryFilters(group: IParsedProductGroup, groupErrors: IValidationError[]): void {
    if (!group.categoryFilters.length) return;

    const productSku = group.variants[0]?.sku ?? 'PARENT';
    const categoryId = group.category
      ? this.categoryIdByName.get(group.category.toLowerCase().trim())
      : undefined;

    for (const binding of group.categoryFilters) {
      const lookupKey = binding.categoryFilterRefId.toLowerCase().trim();
      const filter = this.categoryFilterByLookupKey.get(lookupKey);
      const columnName = filter
        ? buildCategoryFilterColumnHeader(filter.name)
        : binding.categoryFilterRefId.startsWith('CF_')
          ? binding.categoryFilterRefId
          : buildCategoryFilterColumnHeader(binding.categoryFilterRefId);

      if (!filter) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: columnName,
          invalidValue: binding.categoryFilterRefId,
          reason: masterRecordUnavailableReason('Category filter', binding.categoryFilterRefId),
          suggestedFix: 'Use only active category filter columns from the downloaded template.',
        });
        continue;
      }

      if (categoryId && !filter.categoryIds.has(categoryId)) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: productSku,
          column: columnName,
          invalidValue: binding.values.join('|'),
          reason: `Category filter "${filter.name}" is not assigned to category "${group.category}".`,
          suggestedFix: 'Select a category that has this filter, or remove the value from this column.',
        });
        continue;
      }

      for (const value of binding.values) {
        if (!filter.allowedValues.has(value)) {
          const allowed = [...filter.allowedValues].join(', ');
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: productSku,
            column: columnName,
            invalidValue: value,
            reason: `Value "${value}" is not allowed for category filter "${filter.name}".`,
            suggestedFix: allowed
              ? `Use one of the allowed values: ${allowed}.`
              : 'Use a value configured for this category filter in master data.',
          });
        }
      }
    }
  }
}
