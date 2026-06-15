import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import {
  ProductWizardStep1Dto,
  ProductWizardStep2Dto,
  ProductWizardStep3Dto,
  ProductWizardStep4Dto,
} from '../dto/product-wizard.dto';
import { CreateProductDto } from '../dto/product.dto';
import { ProductEntity } from '../entities/product.entity';
import { ProductCreationStep } from '../enums/product-creation-step.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductType } from '../enums/product-type.enum';
import { IProductWizardState, IWizardStepStatus } from '../interfaces/product-wizard.interface';
import { mapProductEntityToResponse } from '../mappers/product.mapper';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { ProductStrategyFactory } from '../strategies/product-strategies';
import { generateProductSlug } from '../utils/product-slug.util';

const STEP_LABELS: Record<ProductCreationStep, string> = {
  [ProductCreationStep.IDENTITY]: 'Identity & Classification',
  [ProductCreationStep.CONTENT]: 'Content & Media',
  [ProductCreationStep.PRICING]: 'Pricing & Inventory',
  [ProductCreationStep.POLICIES]: 'Policies & Recommendations',
  [ProductCreationStep.REVIEW]: 'Review & Publish',
};

@Injectable()
export class ProductWizardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepository: ProductsRepository,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly strategyFactory: ProductStrategyFactory,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createStep1(dto: ProductWizardStep1Dto, createdBy: string): Promise<IProductWizardState> {
    const masters = await this.masterResolver.resolve(this.toCreateProductDto(dto));
    const slug = dto.slug ?? generateProductSlug(dto.name);

    if (await this.productsRepository.existsBySlug(slug)) {
      throw new ConflictException(`Product slug "${slug}" already exists`);
    }

    const product = await this.dataSource.transaction(async (manager) => {
      const created = await this.productsRepository.create(
        {
          vendorId: null,
          name: dto.name,
          slug,
          description: null,
          productType: dto.productType,
          productNatureId: masters.productNatureId,
          categoryId: masters.categoryId,
          subCategoryId: masters.subCategoryId,
          subSubCategoryId: masters.subSubCategoryId,
          subSubSubCategoryId: masters.subSubSubCategoryId,
          brandId: masters.brandId,
          manufacturerId: null,
          packerId: null,
          importerId: null,
          status: ProductStatus.DRAFT,
          creationStep: ProductCreationStep.IDENTITY,
          rejectionReason: null,
          subscriptionEnabled: false,
          codAvailable: false,
          emiAvailable: false,
          replaceAllowed: false,
          replaceWindowDays: null,
          returnWindowDays: null,
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          metaKeywords: dto.metaKeywords ?? null,
          refId: await generateUniqueRefId(dto.name, (refId) =>
            this.productsRepository.existsByRefId(refId),
          ),
          createdBy,
        },
        manager,
      );

      await this.relationsRepository.syncHealthConcerns(
        manager,
        created.id,
        masters.healthConcernIds,
      );
      await this.relationsRepository.syncTags(manager, created.id, dto.tagNames ?? [], createdBy);

      return created;
    });

    await this.emitProductUpdated(product.refId, 'created');
    return this.getWizardState(product.refId);
  }

  async saveStep1(
    refId: string,
    dto: ProductWizardStep1Dto,
    updatedBy: string,
  ): Promise<IProductWizardState> {
    const existing = await this.requireEditableProduct(refId);
    const masters = await this.masterResolver.resolve(this.toCreateProductDto(dto));
    const slug = dto.slug ?? generateProductSlug(dto.name);

    if (await this.productsRepository.existsBySlug(slug, refId)) {
      throw new ConflictException(`Product slug "${slug}" already exists`);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.productsRepository.updateByRefId(
        refId,
        {
          name: dto.name,
          slug,
          productType: dto.productType,
          productNatureId: masters.productNatureId,
          categoryId: masters.categoryId,
          subCategoryId: masters.subCategoryId,
          subSubCategoryId: masters.subSubCategoryId,
          subSubSubCategoryId: masters.subSubSubCategoryId,
          brandId: masters.brandId,
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          metaKeywords: dto.metaKeywords ?? null,
          creationStep: Math.max(existing.creationStep, ProductCreationStep.IDENTITY),
          status: ProductStatus.DRAFT,
          rejectionReason: null,
          updatedBy,
        },
        manager,
      );

      const product = await this.productsRepository.findByRefId(refId, manager);
      await this.relationsRepository.syncHealthConcerns(
        manager,
        product!.id,
        masters.healthConcernIds,
      );
      await this.relationsRepository.syncTags(manager, product!.id, dto.tagNames ?? [], updatedBy);
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async saveStep2(
    refId: string,
    dto: ProductWizardStep2Dto,
    updatedBy: string,
  ): Promise<IProductWizardState> {
    const existing = await this.requireEditableProduct(refId);
    this.assertStepAccessible(existing, ProductCreationStep.CONTENT);

    const masters = dto.manufacturerRefId || dto.packerRefId || dto.importerRefId
      ? await this.masterResolver.resolve({
          productType: existing.productType,
          productNatureRefId: existing.productNature?.refId ?? '',
          categoryRefId: existing.category?.refId ?? '',
          name: existing.name,
          manufacturerRefId: dto.manufacturerRefId,
          packerRefId: dto.packerRefId,
          importerRefId: dto.importerRefId,
        } as CreateProductDto)
      : null;

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.productsRepository.existsBySlug(dto.slug, refId)) {
        throw new ConflictException(`Product slug "${dto.slug}" already exists`);
      }
    }

    const faqIds: string[] = [];
    for (const faqRefId of dto.faqRefIds ?? []) {
      const productFaq = await this.relationsRepository.requireProductFaqByRefId(faqRefId);
      faqIds.push(productFaq.id);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.productsRepository.updateByRefId(
        refId,
        {
          description: dto.description ?? existing.description,
          slug: dto.slug ?? existing.slug,
          manufacturerId: masters?.manufacturerId ?? existing.manufacturerId,
          packerId: masters?.packerId ?? existing.packerId,
          importerId: masters?.importerId ?? existing.importerId,
          creationStep: Math.max(existing.creationStep, ProductCreationStep.CONTENT),
          status: ProductStatus.DRAFT,
          rejectionReason: null,
          updatedBy,
        },
        manager,
      );

      const product = await this.productsRepository.findByRefId(refId, manager);
      await this.relationsRepository.syncProductFaqs(manager, product!.id, faqIds);

      if (dto.media !== undefined) {
        await this.relationsRepository.replaceMedia(manager, product!.id, dto.media);
      }
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async saveStep3(
    refId: string,
    dto: ProductWizardStep3Dto,
    updatedBy: string,
  ): Promise<IProductWizardState> {
    const existing = await this.requireEditableProduct(refId);
    this.assertStepAccessible(existing, ProductCreationStep.PRICING);

    const attributeRefIds = [
      ...new Set(
        (dto.variants ?? []).flatMap((variant) =>
          (variant.attributes ?? []).map((item) => item.attributeRefId),
        ),
      ),
    ];
    const attributeIdByRefId = await this.masterResolver.resolveAttributeIds(attributeRefIds);

    await this.dataSource.transaction(async (manager) => {
      await this.productsRepository.updateByRefId(
        refId,
        {
          subscriptionEnabled: dto.subscriptionEnabled ?? existing.subscriptionEnabled,
          codAvailable: dto.codAvailable ?? existing.codAvailable,
          emiAvailable: dto.emiAvailable ?? existing.emiAvailable,
          creationStep: Math.max(existing.creationStep, ProductCreationStep.PRICING),
          status: ProductStatus.DRAFT,
          rejectionReason: null,
          updatedBy,
        },
        manager,
      );

      const product = await this.productsRepository.findByRefId(refId, manager);
      await this.variantsRepository.softDeleteByProductId(product!.id, manager);

      const strategy = this.strategyFactory.resolve(existing.productType);
      await strategy.createVariants(
        manager,
        product!,
        {
          productType: existing.productType,
          productNatureRefId: existing.productNature?.refId ?? '',
          categoryRefId: existing.category?.refId ?? '',
          name: existing.name,
          variants: dto.variants,
          bundleItems: dto.bundleItems,
        } as CreateProductDto,
        {
          productNatureId: existing.productNatureId,
          categoryId: existing.categoryId,
          subCategoryId: existing.subCategoryId,
          subSubCategoryId: existing.subSubCategoryId,
          subSubSubCategoryId: existing.subSubSubCategoryId,
          brandId: existing.brandId,
          manufacturerId: existing.manufacturerId,
          packerId: existing.packerId,
          importerId: existing.importerId,
          healthConcernIds: [],
          faqIds: [],
        },
        attributeIdByRefId,
      );
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async saveStep4(
    refId: string,
    dto: ProductWizardStep4Dto,
    updatedBy: string,
  ): Promise<IProductWizardState> {
    const existing = await this.requireEditableProduct(refId);
    this.assertStepAccessible(existing, ProductCreationStep.POLICIES);

    await this.productsRepository.updateByRefId(refId, {
      replaceAllowed: dto.replaceAllowed ?? existing.replaceAllowed,
      replaceWindowDays: dto.replaceWindowDays ?? existing.replaceWindowDays,
      returnWindowDays: dto.returnWindowDays ?? existing.returnWindowDays,
      creationStep: Math.max(existing.creationStep, ProductCreationStep.POLICIES),
      status: ProductStatus.DRAFT,
      rejectionReason: null,
      updatedBy,
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async getWizardState(refId: string): Promise<IProductWizardState> {
    const entity = await this.productsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);

    const steps = this.buildStepStatuses(entity);
    const canSubmit = steps
      .filter((step) => step.step <= ProductCreationStep.POLICIES)
      .every((step) => step.completed);

    return {
      refId: entity.refId,
      status: entity.status,
      creationStep: entity.creationStep,
      rejectionReason: entity.rejectionReason,
      steps,
      canSubmit,
      canPublish:
        entity.status === ProductStatus.DRAFT &&
        canSubmit &&
        entity.creationStep >= ProductCreationStep.POLICIES,
      product: mapProductEntityToResponse(entity),
    };
  }

  async submitForReview(refId: string, updatedBy: string): Promise<IProductWizardState> {
    const state = await this.getWizardState(refId);
    if (!state.canSubmit) {
      throw new BadRequestException('Complete steps 1–4 before submitting for review');
    }
    if (state.status === ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Product is already pending review');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PENDING_REVIEW,
      creationStep: ProductCreationStep.REVIEW,
      rejectionReason: null,
      updatedBy,
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async approve(refId: string, updatedBy: string): Promise<IProductWizardState> {
    const entity = await this.productsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (entity.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only products pending review can be approved');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.DRAFT,
      creationStep: ProductCreationStep.REVIEW,
      rejectionReason: null,
      updatedBy,
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  async reject(refId: string, reason: string, updatedBy: string): Promise<IProductWizardState> {
    const entity = await this.productsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (entity.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only products pending review can be rejected');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.REJECTED,
      rejectionReason: reason,
      updatedBy,
    });

    await this.emitProductUpdated(refId, 'updated');
    return this.getWizardState(refId);
  }

  private async requireEditableProduct(refId: string): Promise<ProductEntity> {
    const entity = await this.productsRepository.findByRefId(refId);
    if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (entity.status === ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Product is pending review and cannot be edited');
    }
    if (entity.status === ProductStatus.PUBLISHED) {
      throw new BadRequestException('Published products must be updated via PATCH /products/:refId');
    }
    if (entity.status === ProductStatus.ARCHIVED || entity.status === ProductStatus.INACTIVE) {
      throw new BadRequestException('Product cannot be edited in its current status');
    }
    return entity;
  }

  private assertStepAccessible(entity: ProductEntity, step: ProductCreationStep): void {
    if (entity.creationStep < step - 1) {
      throw new BadRequestException(`Complete step ${step - 1} before saving step ${step}`);
    }
  }

  private buildStepStatuses(entity: ProductEntity): IWizardStepStatus[] {
    const step1Missing: string[] = [];
    if (!entity.name) step1Missing.push('name');
    if (!entity.productType) step1Missing.push('productType');
    if (!entity.productNatureId) step1Missing.push('productNatureRefId');
    if (!entity.categoryId) step1Missing.push('categoryRefId');

    const step2Missing: string[] = [];
    if (!entity.description?.trim()) step2Missing.push('description');

    const step3Missing: string[] = [];
    if (entity.productType === ProductType.BUNDLE) {
      if (!entity.bundleItems?.length) step3Missing.push('bundleItems');
    } else if (!entity.variants?.length) {
      step3Missing.push('variants');
    }

    const step4Missing: string[] = [];

    return [
      ProductCreationStep.IDENTITY,
      ProductCreationStep.CONTENT,
      ProductCreationStep.PRICING,
      ProductCreationStep.POLICIES,
      ProductCreationStep.REVIEW,
    ].map((step) => {
      let missingFields: string[] = [];
      let completed = false;

      switch (step) {
        case ProductCreationStep.IDENTITY:
          missingFields = step1Missing;
          completed = step1Missing.length === 0;
          break;
        case ProductCreationStep.CONTENT:
          missingFields = step2Missing;
          completed = step2Missing.length === 0 && entity.creationStep >= step;
          break;
        case ProductCreationStep.PRICING:
          missingFields = step3Missing;
          completed = step3Missing.length === 0 && entity.creationStep >= step;
          break;
        case ProductCreationStep.POLICIES:
          missingFields = step4Missing;
          completed = entity.creationStep >= step;
          break;
        case ProductCreationStep.REVIEW:
          completed =
            entity.status === ProductStatus.PENDING_REVIEW ||
            entity.status === ProductStatus.PUBLISHED;
          break;
      }

      return { step, label: STEP_LABELS[step], completed, missingFields };
    });
  }

  private toCreateProductDto(dto: ProductWizardStep1Dto): CreateProductDto {
    return {
      name: dto.name,
      productType: dto.productType,
      productNatureRefId: dto.productNatureRefId,
      categoryRefId: dto.categoryRefId,
      subCategoryRefId: dto.subCategoryRefId,
      subSubCategoryRefId: dto.subSubCategoryRefId,
      subSubSubCategoryRefId: dto.subSubSubCategoryRefId,
      brandRefId: dto.brandRefId,
      healthConcernRefIds: dto.healthConcernRefIds,
      tagNames: dto.tagNames,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      metaKeywords: dto.metaKeywords,
      slug: dto.slug,
    };
  }

  private async emitProductUpdated(
    refId: string,
    action: 'created' | 'updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(refId, action),
    );
  }
}
