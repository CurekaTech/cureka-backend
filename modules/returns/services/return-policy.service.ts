import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { AuditService } from '@modules/master/services/audit.service';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateReturnPolicyDto } from '../dto/return-request.dto';
import { ReturnActor } from '../interfaces/return-request.interface';

export interface IReturnPolicyView {
  level: 'PRODUCT' | 'VARIANT';
  id: string;
  /** Null for variants — `product_variants` has no ref-id column. */
  refId: string | null;
  name: string;
  sku: string | null;
  returnAllowed: boolean | null;
  replaceAllowed: boolean | null;
  refundAllowed: boolean | null;
  returnWindowDays: number | null;
  returnWindowUnit: PolicyWindowUnit | null;
  replaceWindowDays: number | null;
  replaceWindowUnit: PolicyWindowUnit | null;
  returnPickupRequired: boolean | null;
  returnQcRequired: boolean | null;
  returnEvidenceRequired: boolean | null;
  noPickupRefundAllowed: boolean | null;
  returnPolicy: string | null;
}

/**
 * Admin configuration of the return policy on a product or a single SKU.
 *
 * Variant columns are nullable on purpose: a null means "inherit the product",
 * so a SKU only overrides what an admin explicitly sets. Changes here affect
 * future orders only — existing orders keep the snapshot taken at placement.
 */
@Injectable()
export class ReturnPolicyService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepository: Repository<ProductEntity>,
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepository: Repository<ProductVariantEntity>,
    private readonly auditService: AuditService,
  ) {}

  async getProductPolicy(productId: string): Promise<{
    product: IReturnPolicyView;
    variants: IReturnPolicyView[];
  }> {
    const product = await this.requireProduct(productId);
    const variants = await this.variantsRepository.find({ where: { productId: product.id } });
    return {
      product: this.toProductView(product),
      variants: variants.map((variant) => this.toVariantView(variant)),
    };
  }

  async updateProductPolicy(
    productId: string,
    dto: UpdateReturnPolicyDto,
    actor: ReturnActor,
  ): Promise<IReturnPolicyView> {
    const product = await this.requireProduct(productId);
    const patch = this.buildPatch(dto);
    await this.productsRepository.update(
      { id: product.id },
      { ...patch, updatedBy: actor.email ?? actor.id },
    );
    await this.auditService.log({
      entityType: AuditEntityType.RETURN_POLICY,
      entityId: product.id,
      entityRefId: product.refId,
      action: 'RETURN_POLICY_UPDATED',
      performedBy: actor.email ?? actor.id,
      details: { level: 'PRODUCT', changes: patch },
    });
    const reloaded = await this.requireProduct(product.id);
    return this.toProductView(reloaded);
  }

  async updateVariantPolicy(
    variantId: string,
    dto: UpdateReturnPolicyDto,
    actor: ReturnActor,
  ): Promise<IReturnPolicyView> {
    const variant = await this.variantsRepository.findOne({ where: { id: variantId } });
    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }
    const patch = this.buildPatch(dto);
    await this.variantsRepository.update({ id: variant.id }, patch);
    await this.auditService.log({
      entityType: AuditEntityType.RETURN_POLICY,
      entityId: variant.id,
      entityRefId: variant.sku,
      action: 'RETURN_POLICY_UPDATED',
      performedBy: actor.email ?? actor.id,
      details: { level: 'VARIANT', sku: variant.sku, changes: patch },
    });
    const reloaded = await this.variantsRepository.findOne({ where: { id: variant.id } });
    return this.toVariantView(reloaded!);
  }

  private buildPatch(dto: UpdateReturnPolicyDto): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const assign = (key: keyof UpdateReturnPolicyDto): void => {
      if (dto[key] !== undefined) {
        patch[key] = dto[key];
      }
    };
    assign('returnAllowed');
    assign('replaceAllowed');
    assign('refundAllowed');
    assign('returnWindowDays');
    assign('returnWindowUnit');
    assign('replaceWindowDays');
    assign('replaceWindowUnit');
    assign('returnPickupRequired');
    assign('returnQcRequired');
    assign('returnEvidenceRequired');
    assign('noPickupRefundAllowed');
    assign('returnPolicy');
    return patch;
  }

  private async requireProduct(productId: string): Promise<ProductEntity> {
    const product = await this.productsRepository.findOne({
      where: [{ id: productId }, { refId: productId }],
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  private toProductView(product: ProductEntity): IReturnPolicyView {
    return {
      level: 'PRODUCT',
      id: product.id,
      refId: product.refId,
      name: product.name,
      sku: null,
      returnAllowed: product.returnAllowed,
      replaceAllowed: product.replaceAllowed,
      refundAllowed: product.refundAllowed,
      returnWindowDays: product.returnWindowDays,
      returnWindowUnit: product.returnWindowUnit,
      replaceWindowDays: product.replaceWindowDays,
      replaceWindowUnit: product.replaceWindowUnit,
      returnPickupRequired: product.returnPickupRequired,
      returnQcRequired: product.returnQcRequired,
      returnEvidenceRequired: product.returnEvidenceRequired,
      noPickupRefundAllowed: product.noPickupRefundAllowed,
      returnPolicy: product.returnPolicy,
    };
  }

  private toVariantView(variant: ProductVariantEntity): IReturnPolicyView {
    return {
      level: 'VARIANT',
      id: variant.id,
      refId: null,
      name: variant.sku,
      sku: variant.sku,
      returnAllowed: variant.returnAllowed,
      replaceAllowed: variant.replaceAllowed,
      refundAllowed: variant.refundAllowed,
      returnWindowDays: variant.returnWindowDays,
      returnWindowUnit: variant.returnWindowUnit,
      replaceWindowDays: variant.replaceWindowDays,
      replaceWindowUnit: variant.replaceWindowUnit,
      returnPickupRequired: variant.returnPickupRequired,
      returnQcRequired: variant.returnQcRequired,
      returnEvidenceRequired: variant.returnEvidenceRequired,
      noPickupRefundAllowed: variant.noPickupRefundAllowed,
      returnPolicy: variant.returnPolicy,
    };
  }
}
