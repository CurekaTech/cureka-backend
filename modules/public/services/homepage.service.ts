import { Injectable } from '@nestjs/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { BannersService } from '@modules/master/services/banners.service';
import { IHomepageBannersBundle } from '@modules/master/interfaces/banner.interface';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { IPublicCategoryTree, IPublicHeaderCategory } from '../interfaces/public-category.interface';
import { mapCategoryEntityToPublicTree, mapHeaderCategoryEntity } from '../mappers/public-category.mapper';

@Injectable()
export class HomepageService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly bannersService: BannersService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}
  getHomepageBanners(): Promise<IHomepageBannersBundle> {
    return this.bannersService.getHomepageBanners();
  }

  async getHeaderCategoryTree(): Promise<IPublicHeaderCategory[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.categoryHeader(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHeaderCategoryTreeUncached(),
    });
  }

  /** Used by cache refresh after category mutations. */
  async loadHeaderCategoryTreeUncached(): Promise<IPublicHeaderCategory[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    return this.buildHeaderCategoryTree(categories);
  }

  async getShopByCategoryTree(): Promise<IPublicCategoryTree[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.shopByCategory(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadShopByCategoryTreeUncached(),
    });
  }

  /** Used by cache refresh after category mutations. */
  async loadShopByCategoryTreeUncached(): Promise<IPublicCategoryTree[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    const tree = this.buildShopByCategoryTree(categories);
    return this.enrichCategoryTree(tree);
  }

  private buildHeaderCategoryTree(categories: CategoryEntity[]): IPublicHeaderCategory[] {
    const childrenByParentId = new Map<string, CategoryEntity[]>();

    for (const category of categories) {
      if (!category.parentCategoryId) continue;
      const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
      siblings.push(category);
      childrenByParentId.set(category.parentCategoryId, siblings);
    }

    const sortCategories = (items: CategoryEntity[]): CategoryEntity[] =>
      [...items].sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);

    const buildNode = (entity: CategoryEntity): IPublicHeaderCategory => {
      const children = sortCategories(childrenByParentId.get(entity.id) ?? []).map(buildNode);
      return mapHeaderCategoryEntity(entity, children);
    };

    return sortCategories(
      categories.filter(
        (category) =>
          category.isInHeader && category.hierarchyLevel === CategoryHierarchyLevel.ROOT,
      ),
    ).map(buildNode);
  }

  private buildShopByCategoryTree(categories: CategoryEntity[]): IPublicCategoryTree[] {
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
          category.isInShopBy && category.hierarchyLevel === CategoryHierarchyLevel.ROOT,
      ),
    ).map(buildNode);
  }

  private async enrichCategoryTree(tree: IPublicCategoryTree[]): Promise<IPublicCategoryTree[]> {
    return Promise.all(tree.map((node) => this.enrichCategoryNode(node)));
  }

  private async enrichCategoryNode(node: IPublicCategoryTree): Promise<IPublicCategoryTree> {
    const [image, banner, children] = await Promise.all([
      this.storageUrlEnricher.toReference(node.image),
      this.storageUrlEnricher.toReference(node.banner),
      Promise.all((node.children ?? []).map((child) => this.enrichCategoryNode(child))),
    ]);

    return {
      ...node,
      image,
      banner,
      children,
    };
  }
}