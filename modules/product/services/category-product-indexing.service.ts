import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CacheInvalidationService, CacheKeys } from '@packages/cache';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { SaveCategoryTopProductsDto } from '../dto/category-product-indexing.dto';
import {
  ICategoryProductIndexingCategory,
  ICategoryTopProductsSaveResult,
  ICategoryTopProductVariant,
} from '../interfaces/category-product-indexing.interface';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';

@Injectable()
export class CategoryProductIndexingService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly productVariantsRepository: ProductVariantsRepository,
    private readonly cacheInvalidation: CacheInvalidationService,
  ) {}

  async getCategoryContext(categoryRefId: string): Promise<ICategoryProductIndexingCategory> {
    const category = await this.requireCategory(categoryRefId);
    return this.mapCategory(category);
  }

  async listTopVariants(categoryRefId: string): Promise<{
    category: ICategoryProductIndexingCategory;
    variants: ICategoryTopProductVariant[];
  }> {
    const category = await this.requireCategory(categoryRefId);
    const rows = await this.productVariantsRepository.findTopVariantsForCategory(category.id);
    return {
      category: this.mapCategory(category),
      variants: rows.map((row) => ({
        id: row.id,
        sku: row.sku,
        slug: row.slug,
        productRefId: row.product.refId,
        productName: row.product.name,
        isTop: true,
      })),
    };
  }

  async saveTopVariants(
    categoryRefId: string,
    dto: SaveCategoryTopProductsDto,
  ): Promise<ICategoryTopProductsSaveResult> {
    const category = await this.requireCategory(categoryRefId);
    const uniqueIds = [...new Set(dto.variantIds)];

    if (uniqueIds.length) {
      const belonging = await this.productVariantsRepository.findActiveVariantsInCategory(
        category.id,
        uniqueIds,
      );
      const foundIds = new Set(belonging.map((v) => v.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      if (missing.length) {
        throw new BadRequestException(
          `Variant id(s) are missing, inactive, or not in this category: ${missing.join(', ')}`,
        );
      }
    }

    const { selectedCount, clearedCount } =
      await this.productVariantsRepository.syncIsTopForCategory(category.id, uniqueIds);

    await this.invalidateCaches();

    const topRows = await this.productVariantsRepository.findTopVariantsForCategory(category.id);

    return {
      category: this.mapCategory(category),
      selectedCount,
      clearedCount,
      variants: topRows.map((row) => ({
        id: row.id,
        sku: row.sku,
        slug: row.slug,
        productRefId: row.product.refId,
        productName: row.product.name,
        isTop: true,
      })),
    };
  }

  private async requireCategory(categoryRefId: string): Promise<CategoryEntity> {
    const category = await this.categoriesRepository.findByRefId(categoryRefId);
    if (!category) {
      throw new NotFoundException(`Category with refId ${categoryRefId} not found`);
    }
    return category;
  }

  private mapCategory(category: CategoryEntity): ICategoryProductIndexingCategory {
    return {
      refId: category.refId,
      name: category.name,
      slug: category.slug,
      hierarchyLevel: category.hierarchyLevel,
      hierarchyLabel: this.hierarchyLevelLabel(category.hierarchyLevel),
    };
  }

  private hierarchyLevelLabel(level: CategoryHierarchyLevel): string {
    switch (level) {
      case CategoryHierarchyLevel.ROOT:
        return 'Main Category';
      case CategoryHierarchyLevel.CHILD:
        return 'Sub Category';
      case CategoryHierarchyLevel.GRANDCHILD:
        return 'Sub-Sub Category';
      case CategoryHierarchyLevel.GREAT_GRANDCHILD:
        return 'Sub-Sub-Sub Category';
      default:
        return 'Category';
    }
  }

  private async invalidateCaches(): Promise<void> {
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.products.listPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.publicProducts.listPattern());
    await this.cacheInvalidation.invalidateByPattern(CacheKeys.publicProducts.detailPattern());
  }
}
