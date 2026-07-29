import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { CreateVariantDto } from '../dto/variant.dto';
import { VariantStatus } from '../enums/variant-status.enum';
import { ProductType } from '../enums/product-type.enum';
import {
  buildVariantCombinationKey,
  IVariantAttributeInput,
} from '../utils/variant-combination-key.util';
import { buildVariantSlug } from '../utils/variant-slug.util';
import { assertProductUrlSlugLength } from '../utils/product-slug.util';
import { APP_CONSTANTS } from '@packages/common';
import {
  computeDiscountPercentage,
  validateVariantAttributes,
  validateVariantPricing,
  validateUniqueVariantCombinations,
} from '../validators/variant.validator';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductsRepository } from './products.repository';
import {
  mapVariantDetailDtoToEntityColumns,
  VariantDetailMasterIds,
} from '../utils/variant-details-payload.util';
import { ManufacturerEntity } from '@modules/master/entities/manufacturer.entity';
import { PackerEntity } from '@modules/master/entities/packer.entity';
import { ImporterEntity } from '@modules/master/entities/importer.entity';
import { CountryEntity } from '@modules/master/entities/country.entity';

const pickVariantUnit = (
  dto: CreateVariantDto,
  camel: 'weightUnit' | 'lengthUnit' | 'widthUnit' | 'heightUnit',
  snake: 'weight_unit' | 'length_unit' | 'width_unit' | 'height_unit',
): string | null => dto[camel]?.trim() || dto[snake]?.trim() || null;

const normalizeSearchTags = (tags?: string[] | null): string[] => {
  if (!tags?.length) return [];
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
};

@Injectable()
export class ProductVariantsRepository {
  constructor(
    @InjectRepository(ProductVariantEntity)
    private readonly repo: Repository<ProductVariantEntity>,
    @InjectRepository(VariantAttributeValueEntity)
    private readonly attributeValueRepo: Repository<VariantAttributeValueEntity>,
    private readonly productsRepository: ProductsRepository,
  ) {}

  async existsBySku(sku: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('variant').where('variant.sku = :sku', { sku });
    if (excludeId) qb.andWhere('variant.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async getAllSkus(): Promise<string[]> {
    const results = await this.repo.find({ select: ['sku'] });
    return results.map((r) => r.sku);
  }

  async existsByVendorSku(vendorSku: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('variant')
      .where('variant.vendorSku = :vendorSku', { vendorSku });
    if (excludeId) qb.andWhere('variant.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async createVariants(
    manager: EntityManager,
    productId: string,
    productSlug: string,
    variants: CreateVariantDto[],
    attributeIdByRefId: Map<string, string>,
  ): Promise<ProductVariantEntity[]> {
    const variantRepo = manager.getRepository(ProductVariantEntity);
    const attributeRepo = manager.getRepository(VariantAttributeValueEntity);
    const saved: ProductVariantEntity[] = [];

    for (const dto of variants) {
      await this.assertUniqueSkus(dto);

      validateVariantPricing({
        mrp: dto.mrp,
        sellingPrice: dto.sellingPrice,
        discountPercentage: dto.discountPercentage,
      });

      const attributeInputs: IVariantAttributeInput[] = (dto.attributes ?? []).map((item) => {
        const attributeId = attributeIdByRefId.get(item.attributeRefId);
        if (!attributeId) {
          throw new ConflictException(`Attribute refId "${item.attributeRefId}" not found`);
        }
        return { attributeId, value: item.value };
      });

      if (attributeInputs.length) {
        validateVariantAttributes(
          attributeInputs.map((item) => ({
            attributeId: item.attributeId,
            value: item.value,
          })),
        );
      }

      const combinationKey = buildVariantCombinationKey(attributeInputs);
      const discountPercentage =
        dto.discountPercentage ?? computeDiscountPercentage(dto.mrp, dto.sellingPrice);
      const attributeValues = (dto.attributes ?? []).map((item) => item.value);
      const slug = await this.resolveUniqueVariantSlug(
        productSlug,
        {
          slug: dto.slug,
          sku: dto.sku,
          attributeValues,
        },
        undefined,
      );

      const variant = variantRepo.create({
        productId,
        sku: dto.sku,
        slug,
        externalProductId: dto.externalProductId?.trim() || null,
        vendorSku: dto.vendorSku ?? null,
        barcode: dto.barcode ?? null,
        gtinNumber: dto.gtinNumber ?? null,
        hsnCode: dto.hsnCode ?? null,
        batchNumber: dto.batchNumber ?? null,
        expiryDate: dto.expiryDate ?? null,
        mrp: dto.mrp.toFixed(2),
        sellingPrice: dto.sellingPrice.toFixed(2),
        discountPercentage: discountPercentage.toFixed(2),
        stock: dto.stock,
        outOfStock: dto.outOfStock ?? false,
        weight: dto.weight?.toFixed(3) ?? null,
        weightUnit: pickVariantUnit(dto, 'weightUnit', 'weight_unit'),
        length: dto.length?.toFixed(2) ?? null,
        lengthUnit: pickVariantUnit(dto, 'lengthUnit', 'length_unit'),
        width: dto.width?.toFixed(2) ?? null,
        widthUnit: pickVariantUnit(dto, 'widthUnit', 'width_unit'),
        height: dto.height?.toFixed(2) ?? null,
        heightUnit: pickVariantUnit(dto, 'heightUnit', 'height_unit'),
        expiresIn: dto.expiresIn ?? null,
        taxClass: dto.taxClass ?? null,
        searchTags: normalizeSearchTags(dto.searchTags),
        status: VariantStatus.ACTIVE,
        combinationKey,
        ...(await this.mapVariantDetailColumns(manager, dto)),
      });

      try {
        const persisted = await variantRepo.save(variant);
        if (attributeInputs.length) {
          await attributeRepo.save(
            attributeInputs.map((item) =>
              attributeRepo.create({
                variantId: persisted.id,
                attributeId: item.attributeId,
                value: item.value.trim(),
              }),
            ),
          );
        }
        saved.push(persisted);
      } catch (error) {
        this.handleUniqueViolation(error, combinationKey, dto.sku, slug);
        throw error;
      }
    }

    return saved;
  }

  async syncVariants(
    manager: EntityManager,
    productId: string,
    productSlug: string,
    productType: ProductType,
    variants: CreateVariantDto[],
    attributeIdByRefId: Map<string, string>,
  ): Promise<void> {
    if (productType === ProductType.SIMPLE && variants.length !== 1) {
      throw new BadRequestException('Simple products must have exactly one variant');
    }

    if (productType === ProductType.BUNDLE) {
      if (variants.length !== 1) {
        throw new BadRequestException('Bundle products must have exactly one pricing variant');
      }
      if (variants[0]?.attributes?.length) {
        throw new BadRequestException('Bundle pricing variants cannot have attributes');
      }
    }

    if (productType === ProductType.VARIABLE) {
      if (!variants.length) {
        throw new BadRequestException('Variable products require at least one variant');
      }

      validateUniqueVariantCombinations(
        variants.map((variant) =>
          (variant.attributes ?? []).map((item) => {
            const attributeId = attributeIdByRefId.get(item.attributeRefId);
            if (!attributeId) {
              throw new ConflictException(`Attribute refId "${item.attributeRefId}" not found`);
            }
            return { attributeId, value: item.value };
          }),
        ),
      );
    }

    if (productType === ProductType.SIMPLE) {
      for (const variant of variants) {
        if (variant.attributes?.length) {
          throw new BadRequestException('Simple products cannot have variant attributes');
        }
      }
    }

    const variantRepo = manager.getRepository(ProductVariantEntity);
    const existing = await variantRepo.find({ where: { productId } });
    const existingBySku = new Map(existing.map((variant) => [variant.sku, variant]));
    const payloadSkus = new Set(variants.map((variant) => variant.sku));

    // Remove variants dropped from the payload first so their combination keys
    // do not block new/updated variants (partial unique index ignores soft-deleted rows).
    for (const variant of existing) {
      if (!payloadSkus.has(variant.sku)) {
        // Soft-delete does not cascade to product_media — remove media explicitly
        // so orphaned rows are not left attached to the product.
        await manager.getRepository(ProductMediaEntity).delete({ variantId: variant.id });
        await variantRepo.softDelete(variant.id);
      }
    }

    // Clear combination keys on variants being updated so attribute swaps (e.g. L↔M)
    // do not hit UQ_product_variants_combination mid-sync.
    const variantIdsToUpdate = variants
      .map((dto) => existingBySku.get(dto.sku)?.id)
      .filter((id): id is string => Boolean(id));

    if (variantIdsToUpdate.length) {
      await variantRepo
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ combinationKey: null })
        .where('id IN (:...ids)', { ids: variantIdsToUpdate })
        .execute();
    }

    for (const dto of variants) {
      const matched = existingBySku.get(dto.sku);
      if (matched) {
        await this.updateVariant(manager, matched, dto, productSlug, attributeIdByRefId);
      } else {
        await this.createVariants(manager, productId, productSlug, [dto], attributeIdByRefId);
      }
    }
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('variant').where('variant.slug = :slug', { slug });
    if (excludeId) {
      qb.andWhere('variant.id != :excludeId', { excludeId });
    }
    return (await qb.getCount()) > 0;
  }

  private async resolveUniqueVariantSlug(
    productSlug: string,
    input: { slug?: string; sku?: string; attributeValues?: string[] },
    excludeVariantId?: string,
  ): Promise<string> {
    const max = APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;
    let candidate = buildVariantSlug(productSlug, input);
    assertProductUrlSlugLength(candidate, 'Variant');
    let counter = 2;

    while (
      await this.productsRepository.isSlugTakenGlobally(candidate, {
        variantId: excludeVariantId,
      })
    ) {
      candidate = `${buildVariantSlug(productSlug, input)}-${counter}`.slice(0, max);
      counter += 1;
    }

    return candidate;
  }

  private async updateVariant(
    manager: EntityManager,
    existing: ProductVariantEntity,
    dto: CreateVariantDto,
    productSlug: string,
    attributeIdByRefId: Map<string, string>,
  ): Promise<void> {
    const variantRepo = manager.getRepository(ProductVariantEntity);
    const attributeRepo = manager.getRepository(VariantAttributeValueEntity);

    await this.assertUniqueSkus(dto, existing.id);
    validateVariantPricing({
      mrp: dto.mrp,
      sellingPrice: dto.sellingPrice,
      discountPercentage: dto.discountPercentage,
    });

    const attributeInputs: IVariantAttributeInput[] = (dto.attributes ?? []).map((item) => {
      const attributeId = attributeIdByRefId.get(item.attributeRefId);
      if (!attributeId) {
        throw new ConflictException(`Attribute refId "${item.attributeRefId}" not found`);
      }
      return { attributeId, value: item.value };
    });

    if (attributeInputs.length) {
      validateVariantAttributes(
        attributeInputs.map((item) => ({
          attributeId: item.attributeId,
          value: item.value,
        })),
      );
    }

    const combinationKey = buildVariantCombinationKey(attributeInputs);
    const discountPercentage =
      dto.discountPercentage ?? computeDiscountPercentage(dto.mrp, dto.sellingPrice);
    const attributeValues = (dto.attributes ?? []).map((item) => item.value);
    const slug = await this.resolveUniqueVariantSlug(
      productSlug,
      {
        slug: dto.slug,
        sku: dto.sku,
        attributeValues,
      },
      existing.id,
    );

    try {
      await variantRepo.update(
        { id: existing.id },
        {
          vendorSku: dto.vendorSku ?? null,
          barcode: dto.barcode ?? null,
          gtinNumber: dto.gtinNumber ?? null,
          hsnCode: dto.hsnCode ?? null,
          batchNumber: dto.batchNumber ?? null,
          expiryDate: dto.expiryDate ?? null,
          externalProductId: dto.externalProductId?.trim() || null,
          mrp: dto.mrp.toFixed(2),
          sellingPrice: dto.sellingPrice.toFixed(2),
          discountPercentage: discountPercentage.toFixed(2),
          stock: dto.stock,
          ...(dto.outOfStock !== undefined ? { outOfStock: dto.outOfStock } : {}),
          weight: dto.weight?.toFixed(3) ?? null,
          weightUnit: pickVariantUnit(dto, 'weightUnit', 'weight_unit'),
          length: dto.length?.toFixed(2) ?? null,
          lengthUnit: pickVariantUnit(dto, 'lengthUnit', 'length_unit'),
          width: dto.width?.toFixed(2) ?? null,
          widthUnit: pickVariantUnit(dto, 'widthUnit', 'width_unit'),
          height: dto.height?.toFixed(2) ?? null,
          heightUnit: pickVariantUnit(dto, 'heightUnit', 'height_unit'),
          expiresIn: dto.expiresIn ?? null,
          taxClass: dto.taxClass ?? null,
          searchTags: normalizeSearchTags(dto.searchTags),
          slug,
          combinationKey,
          ...(await this.mapVariantDetailColumns(manager, dto)),
        },
      );
    } catch (error) {
      this.handleUniqueViolation(error, combinationKey, dto.sku, slug);
      throw error;
    }

    await attributeRepo.delete({ variantId: existing.id });
    if (attributeInputs.length) {
      await attributeRepo.save(
        attributeInputs.map((item) =>
          attributeRepo.create({
            variantId: existing.id,
            attributeId: item.attributeId,
            value: item.value.trim(),
          }),
        ),
      );
    }
  }

  async findByProductId(productId: string): Promise<ProductVariantEntity[]> {
    return this.repo.find({
      where: { productId },
      relations: ['attributeValues', 'attributeValues.attribute'],
      order: { createdAt: 'ASC' },
    });
  }

  async findById(variantId: string): Promise<ProductVariantEntity | null> {
    return this.repo.findOne({
      where: { id: variantId },
      relations: ['attributeValues', 'attributeValues.attribute'],
    });
  }

  async softDeleteById(variantId: string): Promise<void> {
    await this.repo.softDelete(variantId);
  }

  async findPublishedActiveBySku(sku: string): Promise<ProductVariantEntity | null> {
    return this.repo
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .where('variant.sku = :sku', { sku })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :status', { status: ProductStatus.PUBLISHED })
      .getOne();
  }

  async updateStockById(variantId: string, stock: number): Promise<void> {
    await this.repo.update({ id: variantId }, { stock });
  }

  async setStockByProductIds(
    updates: Array<{ productId: string; stock: number }>,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!updates.length) return result;

    const productIds = [...new Set(updates.map((item) => item.productId))];
    const variants = await this.repo.find({
      where: { productId: In(productIds) },
      select: ['id', 'productId'],
    });
    const stockByProductId = new Map(updates.map((item) => [item.productId, item.stock]));

    for (const variant of variants) {
      const stock = stockByProductId.get(variant.productId);
      if (stock === undefined) continue;
      await this.repo.update({ id: variant.id }, { stock });
      result.set(variant.productId, (result.get(variant.productId) ?? 0) + 1);
    }

    return result;
  }

  /**
   * Sets stock = 0 for all non-deleted variants belonging to the given product IDs.
   * Returns per-product counts of variants touched vs already at zero.
   */
  async markOutOfStockByProductIds(
    productIds: string[],
  ): Promise<Map<string, { updated: number; alreadyZero: number }>> {
    const result = new Map<string, { updated: number; alreadyZero: number }>();
    if (!productIds.length) return result;

    const variants = await this.repo.find({
      where: { productId: In([...new Set(productIds)]) },
      select: ['id', 'productId', 'stock'],
    });

    for (const productId of productIds) {
      result.set(productId, { updated: 0, alreadyZero: 0 });
    }

    const toZeroIds: string[] = [];
    for (const variant of variants) {
      const stats = result.get(variant.productId) ?? { updated: 0, alreadyZero: 0 };
      if (variant.stock <= 0) {
        stats.alreadyZero += 1;
      } else {
        stats.updated += 1;
        toZeroIds.push(variant.id);
      }
      result.set(variant.productId, stats);
    }

    if (toZeroIds.length) {
      await this.repo
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ stock: 0, outOfStock: true })
        .where('id IN (:...ids)', { ids: toZeroIds })
        .execute();
    }

    return result;
  }

  private async assertUniqueSkus(dto: CreateVariantDto, excludeId?: string): Promise<void> {
    if (await this.existsBySku(dto.sku, excludeId)) {
      throw new ConflictException(`SKU "${dto.sku}" already exists`);
    }
    if (dto.vendorSku && (await this.existsByVendorSku(dto.vendorSku, excludeId))) {
      throw new ConflictException(`Vendor SKU "${dto.vendorSku}" already exists`);
    }
  }

  private async mapVariantDetailColumns(
    manager: EntityManager,
    dto: CreateVariantDto,
  ): Promise<Partial<ProductVariantEntity>> {
    const masterIds = await this.resolveVariantMasterIds(manager, dto);
    return mapVariantDetailDtoToEntityColumns(dto, masterIds);
  }

  private async resolveVariantMasterIds(
    manager: EntityManager,
    dto: CreateVariantDto,
  ): Promise<VariantDetailMasterIds> {
    const resolveManufacturerId = async (): Promise<string | null | undefined> => {
      if (dto.manufacturerRefId === undefined) return undefined;
      if (!dto.manufacturerRefId) return null;
      const row = await manager.getRepository(ManufacturerEntity).findOne({
        where: { refId: dto.manufacturerRefId },
        select: ['id'],
      });
      return row?.id ?? null;
    };
    const resolvePackerId = async (): Promise<string | null | undefined> => {
      if (dto.packerRefId === undefined) return undefined;
      if (!dto.packerRefId) return null;
      const row = await manager.getRepository(PackerEntity).findOne({
        where: { refId: dto.packerRefId },
        select: ['id'],
      });
      return row?.id ?? null;
    };
    const resolveImporterId = async (): Promise<string | null | undefined> => {
      if (dto.importerRefId === undefined) return undefined;
      if (!dto.importerRefId) return null;
      const row = await manager.getRepository(ImporterEntity).findOne({
        where: { refId: dto.importerRefId },
        select: ['id'],
      });
      return row?.id ?? null;
    };
    const resolveCountryId = async (): Promise<string | null | undefined> => {
      if (dto.countryOfOriginRefId === undefined) return undefined;
      if (!dto.countryOfOriginRefId) return null;
      const row = await manager.getRepository(CountryEntity).findOne({
        where: { refId: dto.countryOfOriginRefId },
        select: ['id'],
      });
      return row?.id ?? null;
    };

    const [manufacturerId, packerId, importerId, countryOfOriginId] = await Promise.all([
      resolveManufacturerId(),
      resolvePackerId(),
      resolveImporterId(),
      resolveCountryId(),
    ]);

    return { manufacturerId, packerId, importerId, countryOfOriginId };
  }

  private handleUniqueViolation(
    error: unknown,
    combinationKey: string | null,
    sku: string,
    slug: string,
  ): never | void {
    if (!(error instanceof Error)) return;
    const message = error.message ?? '';
    if (message.includes('UQ_product_variants_sku_active')) {
      throw new ConflictException(`SKU "${sku}" already exists`);
    }
    if (message.includes('UQ_product_variants_vendor_sku_active')) {
      throw new ConflictException(`Vendor SKU already exists`);
    }
    if (message.includes('UQ_product_variants_slug_active')) {
      throw new ConflictException(`Variant slug "${slug}" already exists`);
    }
    if (message.includes('UQ_product_variants_combination')) {
      throw new ConflictException(
        `Duplicate variant combination detected (${combinationKey ?? 'unknown'})`,
      );
    }
  }
}
