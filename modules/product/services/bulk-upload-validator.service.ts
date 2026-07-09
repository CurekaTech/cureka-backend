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
import { IParsedProductGroup } from './bulk-upload-parser.service';
import {
  BulkUploadProductInformationLabel,
  buildCategoryFilterColumnHeader,
} from '../utils/bulk-upload-columns.util';

type CachedCategoryFilter = {
  refId: string;
  name: string;
  allowedValues: Set<string>;
  categoryIds: Set<string>;
};

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
  private packerMap = new Map<string, string>(); // name (lowercase) -> refId
  private importerMap = new Map<string, string>(); // name (lowercase) -> refId
  private countryMap = new Map<string, string>(); // name (lowercase) -> refId
  private skuToProductRefIdMap = new Map<string, string>(); // SKU (lowercase) -> parent product refId
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
      productInformationLabels,
      categoryFilters,
    ] = await Promise.all([
      this.dataSource.getRepository(ProductNatureEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(CategoryEntity).find({ select: ['id', 'name', 'refId'] }),
      this.dataSource.getRepository(BrandEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(HealthConcernEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(WellnessGoalEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(ProductTagEntity).find({ select: ['name', 'slug'] }),
      this.dataSource.getRepository(AttributeEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(ManufacturerEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(PackerEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(ImporterEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(CountryEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(ProductVariantEntity).find({
        relations: { product: true },
        select: {
          sku: true,
          product: {
            refId: true,
          },
        },
      }),
      this.dataSource.getRepository(ProductEntity).find({
        select: ['refId', 'externalProductId'],
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
    this.attributeMap = new Map(attributes.map((a: any) => [a.name.toLowerCase().trim(), a.refId]));
    this.manufacturerMap = new Map(manufacturers.map((m: any) => [m.name.toLowerCase().trim(), m.refId]));
    this.packerMap = new Map(packers.map((p: any) => [p.name.toLowerCase().trim(), p.refId]));
    this.importerMap = new Map(importers.map((i: any) => [i.name.toLowerCase().trim(), i.refId]));
    this.countryMap = new Map(countries.map((co: any) => [co.name.toLowerCase().trim(), co.refId]));

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
        categoryIds: new Set((filter.categories ?? []).map((category) => category.id)),
      };
      const normalizedName = filter.name.toLowerCase().trim();
      this.categoryFilterByLookupKey.set(normalizedName, cached);
      this.categoryFilterByLookupKey.set(filter.refId.toLowerCase().trim(), cached);
      this.activeCategoryFilterNames.add(normalizedName);
    }

    this.dbSkus = new Set();
    this.skuToProductRefIdMap = new Map();
    this.externalProductIdToProductRefIdMap = new Map();
    this.dbExternalProductIds = new Set(
      externalProductIds
        .map((product) => product.externalProductId?.toLowerCase().trim())
        .filter((value): value is string => Boolean(value)),
    );
    for (const product of externalProductIds) {
      const normalizedExternalId = product.externalProductId?.toLowerCase().trim();
      if (!normalizedExternalId) continue;
      this.externalProductIdToProductRefIdMap.set(normalizedExternalId, product.refId);
    }
    for (const v of skusWithProducts) {
      if (v.sku) {
        const normSku = v.sku.toLowerCase().trim();
        this.dbSkus.add(normSku);
        if (v.product) {
          this.skuToProductRefIdMap.set(normSku, v.product.refId);
        }
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
   * Resolves attribute refId by normalized name.
   */
  resolveAttributeRefId(name: string): string | undefined {
    return this.attributeMap.get(name.toLowerCase().trim());
  }

  /**
   * Resolves child product refId by SKU code.
   */
  resolveProductRefIdBySku(sku: string): string | undefined {
    return this.skuToProductRefIdMap.get(sku.toLowerCase().trim());
  }

  resolveExistingProductRefIdForGroup(group: IParsedProductGroup): string | undefined {
    if (!group.variants?.length) {
      return undefined;
    }

    const foundRefIds = new Set<string>();
    for (const variant of group.variants) {
      const refId = this.resolveProductRefIdBySku(variant.sku);
      if (refId) {
        foundRefIds.add(refId);
      }
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
      manufacturerRefId: group.manufacturer ? this.manufacturerMap.get(group.manufacturer.toLowerCase().trim()) : undefined,
      packerRefId: group.packer ? this.packerMap.get(group.packer.toLowerCase().trim()) : undefined,
      importerRefId: group.importer ? this.importerMap.get(group.importer.toLowerCase().trim()) : undefined,
      countryOfOriginRefId: group.countryOfOrigin ? this.countryMap.get(group.countryOfOrigin.toLowerCase().trim()) : undefined,
    };
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
      const existingProductRefIds = new Set(
        group.variants
          .map((variant) => this.resolveProductRefIdBySku(variant.sku))
          .filter((refId): refId is string => Boolean(refId)),
      );
      const resolvedExistingProductRefId =
        existingProductRefIds.size === 1 ? Array.from(existingProductRefIds)[0] : undefined;

      if (existingProductRefIds.size > 1) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: group.variants[0]?.sku ?? 'PARENT',
          column: 'Product SKU Code',
          invalidValue: group.variants.map((variant) => variant.sku).join(', '),
          reason: 'Sheet row maps to multiple existing products by SKU. A single row can only update one product.',
          suggestedFix: 'Keep all SKUs of a row under the same product or split into separate rows.',
        });
      }

      // A. Mandatory Parent Field Validations
      if (!group.name) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
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
            sku: 'PARENT',
            column: 'Product Nature',
            invalidValue: group.productNature,
            reason: `Product nature "${group.productNature}" does not exist in master records.`,
            suggestedFix: 'Use a pre-defined active product nature.',
          });
        }
      }

      if (!group.category) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
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
            sku: 'PARENT',
            column: 'Category',
            invalidValue: group.category,
            reason: `Category "${group.category}" does not exist in master records.`,
            suggestedFix: 'Ensure category matches one of the master names.',
          });
        }
      }

      if (!group.brand) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
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
            sku: 'PARENT',
            column: 'Brand',
            invalidValue: group.brand,
            reason: `Brand "${group.brand}" does not exist in master records.`,
            suggestedFix: 'Register the brand name in Brand master first.',
          });
        }
      }

      if (group.wellnessGoals && group.wellnessGoals.length > 0) {
        for (const goal of group.wellnessGoals) {
          const refId = this.wellnessGoalMap.get(goal.toLowerCase().trim());
          if (!refId) {
            groupErrors.push({
              rowNumber: group.rowNumber,
              sku: 'PARENT',
              column: 'Wellness Goals',
              invalidValue: goal,
              reason: `Wellness goal "${goal}" does not exist in master records.`,
              suggestedFix: 'Use a pre-defined active wellness goal name.',
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
              sku: 'PARENT',
              column: 'Health Concerns',
              invalidValue: concern,
              reason: `Health concern "${concern}" does not exist in master records.`,
              suggestedFix: 'Use a pre-defined active health concern name.',
            });
          }
        }
      }

      if (group.manufacturer) {
        const refId = this.manufacturerMap.get(group.manufacturer.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Manufacturer',
            invalidValue: group.manufacturer,
            reason: `Manufacturer "${group.manufacturer}" does not exist in master records.`,
            suggestedFix: 'Register the manufacturer name in Manufacturer master first.',
          });
        }
      }

      if (group.packer) {
        const refId = this.packerMap.get(group.packer.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Packer',
            invalidValue: group.packer,
            reason: `Packer "${group.packer}" does not exist in master records.`,
            suggestedFix: 'Register the packer name in Packer master first.',
          });
        }
      }

      if (group.importer) {
        const refId = this.importerMap.get(group.importer.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Importer',
            invalidValue: group.importer,
            reason: `Importer "${group.importer}" does not exist in master records.`,
            suggestedFix: 'Register the importer name in Importer master first.',
          });
        }
      }

      if (group.countryOfOrigin) {
        const refId = this.countryMap.get(group.countryOfOrigin.toLowerCase().trim());
        if (!refId) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Country of Origin',
            invalidValue: group.countryOfOrigin,
            reason: `Country "${group.countryOfOrigin}" does not exist in master records.`,
            suggestedFix: 'Register the country name in Country master first.',
          });
        }
      }

      if (group.externalProductId) {
        const normalizedExternalId = group.externalProductId.toLowerCase().trim();
        if (sheetExternalProductIds.has(normalizedExternalId)) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Product ID (String)',
            invalidValue: group.externalProductId,
            reason: `Product ID "${group.externalProductId}" is duplicated within the spreadsheet.`,
            suggestedFix: 'Assign a unique external product ID per product row.',
          });
        } else {
          sheetExternalProductIds.add(normalizedExternalId);
        }

        const existingExternalIdProductRefId =
          this.externalProductIdToProductRefIdMap.get(normalizedExternalId);
        if (
          existingExternalIdProductRefId &&
          (!resolvedExistingProductRefId || existingExternalIdProductRefId !== resolvedExistingProductRefId)
        ) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Product ID (String)',
            invalidValue: group.externalProductId,
            reason: `Product ID "${group.externalProductId}" already exists in the database.`,
            suggestedFix:
              'Use a new unique external product ID or upload with SKU(s) of that same existing product.',
          });
        }
      }

      this.validatePackMetadata(group, groupErrors);
      this.validateCategoryFilters(group, groupErrors);

      // B. Simple and Variable Product Validations
      if (group.productType === 'simple' || group.productType === 'variable') {
        if (group.variants.length === 0) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'Product SKU Code',
            invalidValue: '',
            reason: 'At least one variant or product SKU row must be associated with the product.',
            suggestedFix: 'Add a variant row specifying Product SKU Code, MRP, Selling Price, and stock.',
          });
        }

        for (const variant of group.variants) {
          if (!variant.sku) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: 'EMPTY',
              column: 'Product SKU Code',
              invalidValue: '',
              reason: 'Product SKU Code is mandatory.',
              suggestedFix: 'Define a unique Product SKU Code.',
            });
            continue;
          }

          const normSku = variant.sku.toLowerCase().trim();

          // Check inside-sheet SKU duplicates
          if (sheetSkus.has(normSku)) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'Product SKU Code',
              invalidValue: variant.sku,
              reason: `Product SKU Code "${variant.sku}" is duplicated within the spreadsheet.`,
              suggestedFix: 'Assign unique Product SKU Codes to distinct variants.',
            });
          } else {
            sheetSkus.add(normSku);
          }

          // Check DB duplicates
          if (this.dbSkus.has(normSku)) {
            const existingSkuProductRefId = this.resolveProductRefIdBySku(variant.sku);
            if (
              resolvedExistingProductRefId &&
              existingSkuProductRefId &&
              existingSkuProductRefId === resolvedExistingProductRefId
            ) {
              continue;
            }
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'Product SKU Code',
              invalidValue: variant.sku,
              reason: `Product SKU Code "${variant.sku}" already exists in the database.`,
              suggestedFix:
                'Use this SKU only to update its existing product, or change to a new unique SKU.',
            });
          }

          // Price validations
          if (variant.mrp <= 0) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'MRP',
              invalidValue: String(variant.mrp),
              reason: 'MRP must be greater than zero.',
              suggestedFix: 'Enter a valid numerical MRP.',
            });
          }

          if (variant.sellingPrice <= 0) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'Selling Price',
              invalidValue: String(variant.sellingPrice),
              reason: 'Selling price must be greater than zero.',
              suggestedFix: 'Enter a valid numerical selling price.',
            });
          }

          if (variant.sellingPrice > variant.mrp) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'Selling Price',
              invalidValue: `${variant.sellingPrice} vs MRP ${variant.mrp}`,
              reason: 'Selling price cannot exceed the product MRP.',
              suggestedFix: 'Lower the selling price or adjust the MRP.',
            });
          }
        }
      }

      // C. Bundle Product Validations
      if (group.productType === 'bundle') {
        if (group.bundleItems.length === 0) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
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
        errors.push(...groupErrors);
      } else {
        validatedProducts.push(group);
      }
    }

    return { errors, validatedProducts };
  }

  private validatePackMetadata(group: IParsedProductGroup, groupErrors: IValidationError[]): void {
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
          sku: 'PARENT',
          column: `${packLabel} SKU Code`,
          invalidValue: '',
          reason: `${packLabel} is partially filled but missing Pack SKU Code.`,
          suggestedFix: `Provide Pack SKU Code ${pack.packNumber} when other ${packLabel} fields are set.`,
        });
      }

      if (pack.mrp !== undefined && pack.mrp <= 0) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
          column: `${packLabel} MRP`,
          invalidValue: String(pack.mrp),
          reason: `${packLabel} MRP must be greater than zero.`,
          suggestedFix: `Enter a valid numerical value for Pack MRP ${pack.packNumber}.`,
        });
      }

      if (pack.sellingPrice !== undefined && pack.sellingPrice <= 0) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
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
          sku: 'PARENT',
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
          sku: group.variants[0]?.sku ?? 'PARENT',
          column: columnName,
          invalidValue: binding.categoryFilterRefId,
          reason: `Category filter "${binding.categoryFilterRefId}" does not exist in master records.`,
          suggestedFix: 'Use only active category filter columns from the downloaded template.',
        });
        continue;
      }

      if (categoryId && !filter.categoryIds.has(categoryId)) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: group.variants[0]?.sku ?? 'PARENT',
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
            sku: group.variants[0]?.sku ?? 'PARENT',
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
