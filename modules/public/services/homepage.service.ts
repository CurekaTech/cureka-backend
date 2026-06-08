import { Injectable } from '@nestjs/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IPublicCategoryTree } from '../interfaces/public-category.interface';
import { mapCategoryEntityToPublicTree } from '../mappers/public-category.mapper';

@Injectable()
export class HomepageService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async getHeaderCategoryTree(): Promise<IPublicCategoryTree[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.categoryHeader(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHeaderCategoryTreeUncached(),
    });
  }

  /** Used by cache refresh after category mutations. */
  async loadHeaderCategoryTreeUncached(): Promise<IPublicCategoryTree[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    return this.buildHeaderCategoryTree(categories);
  }

  private buildHeaderCategoryTree(categories: CategoryEntity[]): IPublicCategoryTree[] {
    const childrenByParentId = new Map<string, CategoryEntity[]>();

    for (const category of categories) {
      if (!category.parentCategoryId) continue;
      const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
      siblings.push(category);
      childrenByParentId.set(category.parentCategoryId, siblings);
    }

    const sortCategories = (items: CategoryEntity[]): CategoryEntity[] =>
      [...items].sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);

    const buildNode = (entity: CategoryEntity): IPublicCategoryTree => {
      const children = sortCategories(childrenByParentId.get(entity.id) ?? []).map(buildNode);
      return mapCategoryEntityToPublicTree(entity, children);
    };

    return sortCategories(
      categories.filter(
        (category) =>
          category.isInHeader && category.hierarchyLevel === CategoryHierarchyLevel.ROOT,
      ),
    ).map(buildNode);
  }
}
