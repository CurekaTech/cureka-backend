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
import { IProduct } from '../interfaces/product.interface';
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
  ) {}

  async createDraft(dto: CreateProductDto, createdBy: string): Promise<IProduct> {
    const masters = await this.masterResolver.resolve(dto);
    const slug = dto.slug ?? generateProductSlug(dto.name);

    if (await this.productsRepository.existsBySlug(slug)) {
      throw new ConflictException(`Product slug "${slug}" already exists`);
    }

    const attributeRefIds = [
      ...new Set(
        (dto.variants ?? []).flatMap((variant) =>
          (variant.attributes ?? []).map((item) => item.attributeRefId),
        ),
      ),
    ];
    const attributeIdByRefId = await this.masterResolver.resolveAttributeIds(attributeRefIds);

    const product = await this.dataSource.transaction(async (manager) => {
      const created = await this.productsRepository.create(
        {
          vendorId: dto.vendorId ?? null,
          name: dto.name,
          slug,
          description: dto.description ?? null,
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
          status: ProductStatus.DRAFT,
          subscriptionEnabled: dto.subscriptionEnabled ?? false,
          codAvailable: dto.codAvailable ?? false,
          emiAvailable: dto.emiAvailable ?? false,
          replaceAllowed: dto.replaceAllowed ?? false,
          replaceWindowDays: dto.replaceWindowDays ?? null,
          returnWindowDays: dto.returnWindowDays ?? null,
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

      const strategy = this.strategyFactory.resolve(dto.productType);
      await strategy.createVariants(manager, created, dto, masters, attributeIdByRefId);

      await this.relationsRepository.syncHealthConcerns(
        manager,
        created.id,
        masters.healthConcernIds,
      );
      await this.relationsRepository.syncTags(manager, created.id, dto.tagNames ?? [], createdBy);
      await this.relationsRepository.syncProductFaqs(manager, created.id, masters.faqIds);

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
    return mapProductEntityToResponse(loaded!);
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
    });
  }

  async findOne(refId: string): Promise<IProduct> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.products.detail(refId),
      module: CacheModuleName.PRODUCT,
      loader: async () => {
        const entity = await this.productsRepository.findByRefId(refId);
        if (!entity) throw new NotFoundException(`Product with refId ${refId} not found`);
        return mapProductEntityToResponse(entity);
      },
    });
  }

  async update(refId: string, dto: UpdateProductDto, updatedBy: string): Promise<IProduct> {
    const existing = await this.productsRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException(`Product with refId ${refId} not found`);

    const payload: Partial<ProductEntity> = { updatedBy };
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

    const masters = dto.productNatureRefId || dto.categoryRefId ? await this.masterResolver.resolve({
      ...dto,
      productType: existing.productType,
      productNatureRefId: dto.productNatureRefId ?? existing.productNature?.refId ?? '',
      categoryRefId: dto.categoryRefId ?? existing.category?.refId ?? '',
      name: dto.name ?? existing.name,
    } as CreateProductDto) : null;

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
    }

    await this.productsRepository.updateByRefId(refId, payload);

    if (dto.healthConcernRefIds || dto.tagNames || dto.faqRefIds) {
      const resolved = masters ?? (await this.masterResolver.resolve({
        productType: existing.productType,
        productNatureRefId: existing.productNature?.refId ?? '',
        categoryRefId: existing.category?.refId ?? '',
        name: existing.name,
        healthConcernRefIds: dto.healthConcernRefIds,
        faqRefIds: dto.faqRefIds,
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
      });
    }

    await this.emitProductUpdated(refId, 'updated');
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
