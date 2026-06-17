import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
import { CreateProductDto, ProductQueryDto, UpdateProductDto, UpdateProductStatusDto } from '../dto/product.dto';
import { RejectProductDto } from '../dto/reject-product.dto';
import { IProduct } from '../interfaces/product.interface';
import { mapSpecificationFields } from '../utils/product-payload.util';
import { validateVariantAttributeScope } from '../validators/variant.validator';
import { ProductsRepository } from '../repositories/products.repository';
import { ProductRelationsRepository } from '../repositories/product-relations.repository';
import { ProductMasterResolverService } from './product-master-resolver.service';
import { ProductStrategyFactory } from '../strategies/product-strategies';
import { mapProductEntitiesToResponse, mapProductEntityToResponse } from '../mappers/product.mapper';
import { generateProductSlug } from '../utils/product-slug.util';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductType } from '../enums/product-type.enum';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { ProductNaturesRepository } from '@modules/master/repositories/product-natures.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';

@Injectable()
export class ProductsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly productsRepository: ProductsRepository,
    private readonly relationsRepository: ProductRelationsRepository,
    private readonly masterResolver: ProductMasterResolverService,
    private readonly strategyFactory: ProductStrategyFactory,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly productNaturesRepository: ProductNaturesRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async createDraft(dto: CreateProductDto, createdBy: string): Promise<IProduct> {
    const masters = await this.masterResolver.resolve(dto);
    const slug = dto.slug ?? generateProductSlug(dto.name);

    if (await this.productsRepository.existsBySlug(slug)) {
      throw new ConflictException(`Product slug "${slug}" already exists`);
    }

    const attributeRefIds = [
      ...new Set([
        ...(dto.attributeRefIds ?? []),
        ...(dto.variants ?? []).flatMap((variant) =>
          (variant.attributes ?? []).map((item) => item.attributeRefId),
        ),
      ]),
    ];
    const attributeIdByRefId = await this.masterResolver.resolveAttributeIds(attributeRefIds);

    if (dto.productType === ProductType.VARIABLE) {
      const allowed = new Set(dto.attributeRefIds ?? []);
      for (const variant of dto.variants ?? []) {
        validateVariantAttributeScope(variant.attributes ?? [], allowed);
      }
    }

    const product = await this.dataSource.transaction(async (manager) => {
      const created = await this.productsRepository.create(
        {
          vendorId: dto.vendorId ?? null,
          name: dto.name,
          slug,
          productType: dto.productType,
          productNatureId: masters.productNatureId,
          categoryId: masters.categoryId,
          subCategoryId: masters.subCategoryId,
          subSubCategoryId: masters.subSubCategoryId,
          subSubSubCategoryId: masters.subSubSubCategoryId,
          brandId: masters.brandId,
          manufacturerId: masters.manufacturerId,
          packerId: masters.packerId,
          importerId: masters.importerId,
          countryOfOriginId: masters.countryOfOriginId,
          status: ProductStatus.DRAFT,
          rejectionReason: null,
          ...mapSpecificationFields(dto),
          description: dto.description ?? null,
          refId: await generateUniqueRefId(dto.name, (refId) =>
            this.productsRepository.existsByRefId(refId),
          ),
          createdBy,
        },
        manager,
      );

      const strategy = this.strategyFactory.resolve(dto.productType);
      await strategy.createVariants(manager, created, dto, masters, attributeIdByRefId);

      await this.relationsRepository.syncHealthConcerns(
        manager,
        created.id,
        masters.healthConcernIds,
      );
      await this.relationsRepository.syncTags(manager, created.id, dto.tagNames ?? [], createdBy);

      const faqIds = [...masters.faqIds];
      if (dto.customFaqs?.length) {
        faqIds.push(
          ...(await this.relationsRepository.createCustomProductFaqs(
            manager,
            dto.customFaqs,
            createdBy,
          )),
        );
      }
      await this.relationsRepository.syncProductFaqs(manager, created.id, faqIds);
      await this.relationsRepository.syncProductAttributes(
        manager,
        created.id,
        masters.attributeIds,
      );

      if (dto.media?.length) {
        const variants = await manager.getRepository(ProductVariantEntity).find({
          where: { productId: created.id },
        });
        const skuToVariantId = new Map(variants.map((v) => [v.sku, v.id]));
        await this.relationsRepository.createMedia(manager, created.id, dto.media, skuToVariantId);
      }

      return created;
    });

    await this.emitProductUpdated(product.refId, 'created');
    const loaded = await this.productsRepository.findByRefId(product.refId);
    if (!loaded) throw new NotFoundException('Product could not be loaded after creation');
    this.validateForSubmission(loaded);

    await this.productsRepository.updateByRefId(product.refId, {
      status: ProductStatus.PENDING_REVIEW,
      rejectionReason: null,
    });
    await this.emitProductUpdated(product.refId, 'status_updated');

    const reviewed = await this.productsRepository.findByRefId(product.refId);
    return this.enrichProduct(mapProductEntityToResponse(reviewed!));
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedResult<IProduct>> {
    const paginationOptions = buildPaginationOptions(query);
    const filters = await this.resolveListFilters(query);
    const queryHash = buildQueryCacheHash({
      ...filters,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.products.list(paginationOptions.page, paginationOptions.limit, queryHash),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        const { data, total } = await this.productsRepository.findAllPaginated({
          page: paginationOptions.page,
          limit: paginationOptions.limit,
          search: paginationOptions.search,
          sortBy: paginationOptions.sortBy,
          sortOrder: paginationOptions.sortOrder,
          productType: query.productType,
          status: query.status,
          categoryId: filters.categoryId,
          brandId: filters.brandId,
          productNatureId: filters.productNatureId,
        });
        return buildPaginatedResult(mapProductEntitiesToResponse(data), total, paginationOptions);
      },
    }).then((result) => this.enrichPaginatedProducts(result));
  }

  async findOne(refId: string): Promise<IProduct> {
    const product = await this.cacheStrategy.cacheAside({
      key: CacheKeys.products.detail(refId),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        const entity = await this.productsRepository.findByRefId(refId);
        if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
        return mapProductEntityToResponse(entity);
      },
    });

    return this.enrichProduct(product);
  }

  async update(refId: string, dto: UpdateProductDto, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    this.assertEditable(existing);

    const payload: Partial<ProductEntity> = { updatedBy, ...mapSpecificationFields(dto) };
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.description !== undefined) payload.description = dto.description ?? null;
    if (dto.vendorId !== undefined) payload.vendorId = dto.vendorId ?? null;

    if (dto.slug !== undefined || dto.name !== undefined) {
      const slug = dto.slug ?? generateProductSlug(dto.name ?? existing.name);
      if (await this.productsRepository.existsBySlug(slug, refId)) {
        throw new ConflictException(`Product slug "${slug}" already exists`);
      }
      payload.slug = slug;
    }

    if (dto.productType && dto.productType !== existing.productType) {
      throw new BadRequestException('productType cannot be changed after creation');
    }

    const masters =
      dto.productNatureRefId ||
      dto.categoryRefId ||
      dto.brandRefId ||
      dto.countryOfOriginRefId ||
      dto.attributeRefIds
        ? await this.masterResolver.resolve({
            ...dto,
            productType: existing.productType,
            productNatureRefId: dto.productNatureRefId ?? existing.productNature?.refId,
            categoryRefId: dto.categoryRefId ?? existing.category?.refId ?? '',
            brandRefId: dto.brandRefId ?? existing.brand?.refId ?? '',
            name: dto.name ?? existing.name,
          } as CreateProductDto)
        : null;

    if (masters) {
      payload.productNatureId = masters.productNatureId;
      payload.categoryId = masters.categoryId;
      payload.subCategoryId = masters.subCategoryId;
      payload.subSubCategoryId = masters.subSubCategoryId;
      payload.subSubSubCategoryId = masters.subSubSubCategoryId;
      payload.brandId = masters.brandId;
      payload.manufacturerId = masters.manufacturerId;
      payload.packerId = masters.packerId;
      payload.importerId = masters.importerId;
      payload.countryOfOriginId = masters.countryOfOriginId;
    }

    if (existing.status === ProductStatus.REJECTED) {
      payload.status = ProductStatus.DRAFT;
      payload.rejectionReason = null;
    }

    await this.productsRepository.updateByRefId(refId, payload);

    if (
      dto.healthConcernRefIds ||
      dto.tagNames ||
      dto.faqRefIds ||
      dto.customFaqs ||
      dto.attributeRefIds ||
      masters?.attributeIds
    ) {
      const resolved =
        masters ??
        (await this.masterResolver.resolve({
          productType: existing.productType,
          productNatureRefId: existing.productNature?.refId,
          categoryRefId: existing.category?.refId ?? '',
          brandRefId: existing.brand?.refId ?? '',
          name: existing.name,
          healthConcernRefIds: dto.healthConcernRefIds,
          faqRefIds: dto.faqRefIds,
          attributeRefIds: dto.attributeRefIds,
        } as CreateProductDto));

      await this.dataSource.transaction(async (manager) => {
        if (dto.healthConcernRefIds) {
          await this.relationsRepository.syncHealthConcerns(
            manager,
            existing.id,
            resolved.healthConcernIds,
          );
        }
        if (dto.tagNames) {
          await this.relationsRepository.syncTags(manager, existing.id, dto.tagNames, updatedBy);
        }
        if (dto.faqRefIds) {
          await this.relationsRepository.syncProductFaqs(manager, existing.id, resolved.faqIds);
        }
        if (dto.customFaqs) {
          const faqIds = await this.relationsRepository.createCustomProductFaqs(
            manager,
            dto.customFaqs,
            updatedBy,
          );
          await this.relationsRepository.syncProductFaqs(manager, existing.id, faqIds);
        }
        if (dto.attributeRefIds) {
          await this.relationsRepository.syncProductAttributes(
            manager,
            existing.id,
            resolved.attributeIds,
          );
        }
      });
    }

    await this.emitProductUpdated(refId, 'updated');
    return this.findOne(refId);
  }

  async submitForReview(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    this.assertEditable(existing);
    this.validateForSubmission(existing);

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PENDING_REVIEW,
      rejectionReason: null,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async approve(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (existing.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only products pending review can be approved');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      rejectionReason: null,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async reject(refId: string, dto: RejectProductDto, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (existing.status !== ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Only products pending review can be rejected');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.REJECTED,
      rejectionReason: dto.reason,
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async publish(refId: string, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    if (!existing.variants?.length && existing.productType !== ProductType.BUNDLE) {
      throw new BadRequestException('Product must have at least one variant before publishing');
    }

    await this.productsRepository.updateByRefId(refId, {
      status: ProductStatus.PUBLISHED,
      publishedAt: new Date(),
      updatedBy,
    });
    await this.emitProductUpdated(refId, 'updated');
    return this.findOne(refId);
  }

  async updateStatus(refId: string, dto: UpdateProductStatusDto, updatedBy: string): Promise<IProduct> {
    await this.productsRepository.updateByRefId(refId, { status: dto.status, updatedBy });
    await this.emitProductUpdated(refId, 'status_updated');
    return this.findOne(refId);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);
    await this.productsRepository.softDeleteByRefId(refId);
    await this.emitProductUpdated(refId, 'deleted');
  }

  private assertEditable(entity: ProductEntity): void {
    if (entity.status === ProductStatus.PENDING_REVIEW) {
      throw new BadRequestException('Product is pending review and cannot be edited');
    }
    if (entity.status === ProductStatus.PUBLISHED) {
      throw new BadRequestException('Published products cannot be edited via create/update flow');
    }
  }

  private validateForSubmission(entity: ProductEntity): void {
    if (!entity.brandId) throw new BadRequestException('Brand is required before submission');
    if (!entity.categoryId) throw new BadRequestException('Category is required before submission');

    if (entity.productType === ProductType.BUNDLE) {
      if (!entity.bundleItems?.length) {
        throw new BadRequestException('Bundle products require at least one bundle item');
      }
      return;
    }

    if (!entity.variants?.length) {
      throw new BadRequestException('Product must have at least one variant before submission');
    }

    if (entity.productType === ProductType.SIMPLE && entity.variants.length !== 1) {
      throw new BadRequestException('Single products must have exactly one variant');
    }

    if (entity.productType === ProductType.VARIABLE) {
      if (!entity.attributeMappings?.length) {
        throw new BadRequestException('Variant products require configured attributes');
      }
      for (const variant of entity.variants) {
        if (!variant.attributeValues?.length) {
          throw new BadRequestException('Each variant must include attribute values');
        }
      }
    }
  }

  private async enrichProduct(product: IProduct): Promise<IProduct> {
    return {
      ...product,
      media: await Promise.all(
        product.media.map(async (item) => ({
          ...item,
          url: (await this.storageUrlEnricher.resolve(item.url)) ?? item.url,
        })),
      ),
    };
  }

  private async enrichPaginatedProducts(
    result: PaginatedResult<IProduct>,
  ): Promise<PaginatedResult<IProduct>> {
    return {
      ...result,
      data: await Promise.all(result.data.map((product) => this.enrichProduct(product))),
    };
  }

  private async resolveListFilters(query: ProductQueryDto) {
    let categoryId: string | undefined;
    let brandId: string | undefined;
    let productNatureId: string | undefined;

    if (query.categoryRefId) {
      const category = await this.categoriesRepository.findByRefId(query.categoryRefId);
      categoryId = category?.id;
    }
    if (query.brandRefId) {
      const brand = await this.brandsRepository.findByRefId(query.brandRefId);
      brandId = brand?.id;
    }
    if (query.productNatureRefId) {
      const nature = await this.productNaturesRepository.findByRefId(query.productNatureRefId);
      productNatureId = nature?.id;
    }

    return { categoryId, brandId, productNatureId };
  }

  private async emitProductUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(EVENTS.PRODUCT_UPDATED, new ProductUpdatedEvent(refId, action));
  }
}
