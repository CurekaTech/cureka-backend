import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { VariantAttributeValueEntity } from '../entities/variant-attribute-value.entity';
import { CreateVariantDto } from '../dto/variant.dto';
import { VariantStatus } from '../enums/variant-status.enum';
import {
  buildVariantCombinationKey,
  IVariantAttributeInput,
} from '../utils/variant-combination-key.util';
import {
  computeDiscountPercentage,
  validateVariantAttributes,
  validateVariantPricing,
} from '../validators/variant.validator';

@Injectable()
export class ProductVariantsRepository {
  constructor(
    @InjectRepository(ProductVariantEntity)
    private readonly repo: Repository<ProductVariantEntity>,
    @InjectRepository(VariantAttributeValueEntity)
    private readonly attributeValueRepo: Repository<VariantAttributeValueEntity>,
  ) {}

  async existsBySku(sku: string, excludeId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('variant').where('variant.sku = :sku', { sku });
    if (excludeId) qb.andWhere('variant.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
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

      const variant = variantRepo.create({
        productId,
        sku: dto.sku,
        vendorSku: dto.vendorSku ?? null,
        barcode: dto.barcode ?? null,
        mrp: dto.mrp.toFixed(2),
        sellingPrice: dto.sellingPrice.toFixed(2),
        discountPercentage: discountPercentage.toFixed(2),
        stock: dto.stock,
        weight: dto.weight?.toFixed(3) ?? null,
        length: dto.length?.toFixed(2) ?? null,
        width: dto.width?.toFixed(2) ?? null,
        height: dto.height?.toFixed(2) ?? null,
        expiresIn: dto.expiresIn ?? null,
        status: VariantStatus.ACTIVE,
        combinationKey,
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
        this.handleUniqueViolation(error, combinationKey, dto.sku);
        throw error;
      }
    }

    return saved;
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

  async softDeleteByProductId(productId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(ProductVariantEntity) : this.repo;
    await repository.softDelete({ productId });
  }

  private async assertUniqueSkus(dto: CreateVariantDto): Promise<void> {
    if (await this.existsBySku(dto.sku)) {
      throw new ConflictException(`SKU "${dto.sku}" already exists`);
    }
    if (dto.vendorSku && (await this.existsByVendorSku(dto.vendorSku))) {
      throw new ConflictException(`Vendor SKU "${dto.vendorSku}" already exists`);
    }
  }

  private handleUniqueViolation(
    error: unknown,
    combinationKey: string | null,
    sku: string,
  ): never | void {
    if (!(error instanceof Error)) return;
    const message = error.message ?? '';
    if (message.includes('UQ_product_variants_sku_active')) {
      throw new ConflictException(`SKU "${sku}" already exists`);
    }
    if (message.includes('UQ_product_variants_vendor_sku_active')) {
      throw new ConflictException(`Vendor SKU already exists`);
    }
    if (message.includes('UQ_product_variants_combination')) {
      throw new ConflictException(
        `Duplicate variant combination detected (${combinationKey ?? 'unknown'})`,
      );
    }
  }
}
