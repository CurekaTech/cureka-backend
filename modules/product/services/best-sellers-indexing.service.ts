import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CacheInvalidationService, CacheKeys } from '@packages/cache';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductMediaType } from '../enums/product-media-type.enum';
import {
  ReorderBestSellerCategoriesDto,
  ReorderBestSellerProductsDto,
} from '../dto/best-sellers-indexing.dto';
import {
  IBestSellerIndexingCategory,
  IBestSellerIndexingProduct,
} from '../interfaces/best-sellers-indexing.interface';
import { BEST_SELLERS_TAG_SLUG } from '../repositories/product-relations.repository';
import { ProductsRepository } from '../repositories/products.repository';

@Injectable()
export class BestSellersIndexingService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async listCategories(): Promise<IBestSellerIndexingCategory[]> {
    const categories = await this.productsRepository.findRootCategoriesWithTag(
      BEST_SELLERS_TAG_SLUG,
    );

    return categories.map((category) => ({
      refId: category.refId,
      name: category.name,
      slug: category.slug,
      bestsellerSortIndex: category.bestsellerSortIndex,
      productCount: category.productCount,
    }));
  }

  async reorderCategories(
    dto: ReorderBestSellerCategoriesDto,
    updatedBy: string,
  ): Promise<IBestSellerIndexingCategory[]> {
    const uniqueRefIds = [...new Set(dto.categories.map((item) => item.refId))];
    if (uniqueRefIds.length !== dto.categories.length) {
      throw new BadRequestException('Duplicate category refIds are not allowed in reorder payload');
    }

    const positions = dto.categories.map((item) => item.position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Duplicate positions are not allowed in reorder payload');
    }

    const indexed = await this.productsRepository.findRootCategoriesWithTag(BEST_SELLERS_TAG_SLUG);
    const allowed = new Set(indexed.map((category) => category.refId));
    const missing = uniqueRefIds.filter((refId) => !allowed.has(refId));
    if (missing.length) {
      throw new BadRequestException(
        `Category refId(s) are not bestseller categories: ${missing.join(', ')}`,
      );
    }

    await Promise.all(
      dto.categories.map((item) =>
        this.categoriesRepository.updateByRefId(item.refId, {
          bestsellerSortIndex: item.position,
          updatedBy,
        }),
      ),
    );

    await this.invalidateBestSellersCache();
    return this.listCategories();
  }

  async listProducts(categoryRefId: string): Promise<IBestSellerIndexingProduct[]> {
    const category = await this.categoriesRepository.findByRefId(categoryRefId);
    if (!category) {
      throw new NotFoundException(`Category with refId ${categoryRefId} not found`);
    }

    const rows = await this.productsRepository.findBestSellerProductsForIndexing(
      category.id,
      BEST_SELLERS_TAG_SLUG,
    );

    const mapped: IBestSellerIndexingProduct[] = rows.map(({ product, sortOrder }) => {
      const media = (product.media ?? [])
        .filter(
          (item) =>
            item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const primary = media.find((item) => item.isPrimary) ?? media[0];

      return {
        refId: product.refId,
        name: product.name,
        slug: product.slug,
        status: product.status,
        sortOrder,
        primaryImageUrl: primary?.url ?? null,
      };
    });

    return this.storageUrlEnricher.enrichReferences(
      mapped,
      (item) => item.primaryImageUrl,
      (item, primaryImageUrl) => ({ ...item, primaryImageUrl }),
    );
  }

  async reorderProducts(
    categoryRefId: string,
    dto: ReorderBestSellerProductsDto,
    _updatedBy: string,
  ): Promise<IBestSellerIndexingProduct[]> {
    const category = await this.categoriesRepository.findByRefId(categoryRefId);
    if (!category) {
      throw new NotFoundException(`Category with refId ${categoryRefId} not found`);
    }

    const uniqueRefIds = [...new Set(dto.products.map((item) => item.refId))];
    if (uniqueRefIds.length !== dto.products.length) {
      throw new BadRequestException('Duplicate product refIds are not allowed in reorder payload');
    }

    const positions = dto.products.map((item) => item.position);
    if (new Set(positions).size !== positions.length) {
      throw new BadRequestException('Duplicate positions are not allowed in reorder payload');
    }

    const existing = await this.productsRepository.findBestSellerProductsForIndexing(
      category.id,
      BEST_SELLERS_TAG_SLUG,
    );
    const byRefId = new Map(existing.map((row) => [row.product.refId, row.product]));
    const missing = uniqueRefIds.filter((refId) => !byRefId.has(refId));
    if (missing.length) {
      throw new BadRequestException(
        `Product refId(s) are not bestsellers in this category: ${missing.join(', ')}`,
      );
    }

    await this.productsRepository.reorderBestSellerTagSortOrders(
      BEST_SELLERS_TAG_SLUG,
      dto.products.map((item) => ({
        productId: byRefId.get(item.refId)!.id,
        sortOrder: item.position,
      })),
    );

    await this.invalidateBestSellersCache();
    return this.listProducts(categoryRefId);
  }

  private async invalidateBestSellersCache(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.bestSellersPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.homepage.sectionsPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.publicProducts.listPattern());
  }
}
