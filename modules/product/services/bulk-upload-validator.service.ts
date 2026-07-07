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
import { IParsedProductGroup } from './bulk-upload-parser.service';

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
    ] = await Promise.all([
      this.dataSource.getRepository(ProductNatureEntity).find({ select: ['name', 'refId'] }),
      this.dataSource.getRepository(CategoryEntity).find({ select: ['name', 'refId'] }),
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
    ]);

    this.natureMap = new Map(natures.map((n: any) => [n.name.toLowerCase().trim(), n.refId]));
    this.brandMap = new Map(brands.map((b: any) => [b.name.toLowerCase().trim(), b.refId]));
    this.categoryMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.refId]));
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

    this.dbSkus = new Set();
    this.skuToProductRefIdMap = new Map();
    for (const v of skusWithProducts) {
      if (v.sku) {
        const normSku = v.sku.toLowerCase().trim();
        this.dbSkus.add(normSku);
        if (v.product) {
          this.skuToProductRefIdMap.set(normSku, v.product.refId);
        }
      }
    }

    this.logger.log(`Caches primed: Natures=${this.natureMap.size}, Brands=${this.brandMap.size}, Categories=${this.categoryMap.size}, DB SKUs=${this.dbSkus.size}`);
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
  ): { errors: IValidationError[]; validatedProducts: IParsedProductGroup[] } {
    const errors: IValidationError[] = [];
    const validatedProducts: IParsedProductGroup[] = [];

    for (const group of batch) {
      const groupErrors: IValidationError[] = [];

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

      if (!group.productNature) {
        groupErrors.push({
          rowNumber: group.rowNumber,
          sku: 'PARENT',
          column: 'Product Nature',
          invalidValue: '',
          reason: 'Product nature is mandatory.',
          suggestedFix: 'Enter a valid product nature (e.g. Capsule, Tablet).',
        });
      } else {
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
        const refId = this.categoryMap.get(group.category.toLowerCase().trim());
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

      if (group.brand) {
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

      // B. Simple and Variable Product Validations
      if (group.productType === 'simple' || group.productType === 'variable') {
        if (group.variants.length === 0) {
          groupErrors.push({
            rowNumber: group.rowNumber,
            sku: 'PARENT',
            column: 'SKU Code',
            invalidValue: '',
            reason: 'At least one variant or SKU row must be associated with the product.',
            suggestedFix: 'Add a variant row specifying SKU code, MRP, Selling Price, and stock.',
          });
        }

        for (const variant of group.variants) {
          if (!variant.sku) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: 'EMPTY',
              column: 'SKU Code',
              invalidValue: '',
              reason: 'SKU code is mandatory.',
              suggestedFix: 'Define a unique SKU code.',
            });
            continue;
          }

          const normSku = variant.sku.toLowerCase().trim();

          // Check inside-sheet SKU duplicates
          if (sheetSkus.has(normSku)) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'SKU Code',
              invalidValue: variant.sku,
              reason: `SKU code "${variant.sku}" is duplicated within the spreadsheet.`,
              suggestedFix: 'Assign unique SKU codes to distinct variants.',
            });
          } else {
            sheetSkus.add(normSku);
          }

          // Check DB duplicates
          if (this.dbSkus.has(normSku)) {
            groupErrors.push({
              rowNumber: variant.rowNumber,
              sku: variant.sku,
              column: 'SKU Code',
              invalidValue: variant.sku,
              reason: `SKU code "${variant.sku}" already exists in the database.`,
              suggestedFix: 'Change the SKU to a new unique code.',
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
}
