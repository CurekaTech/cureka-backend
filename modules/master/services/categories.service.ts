import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { CategoryUpdatedEvent, EVENTS } from '@packages/events';
import { FastifyRequest } from 'fastify';
import { CategoriesRepository } from '../repositories/categories.repository';
import { AttributesRepository } from '../repositories/attributes.repository';
import { CategoryFiltersRepository } from '../repositories/category-filters.repository';
import { CreateCategoryDto, UpdateCategoryDto, UpdateCategoryStatusDto, CategoryQueryDto, ReorderCategoriesDto } from '../dto/category.dto';
import { ICategory, ICategoryTree } from '../interfaces/category.interface';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { resolveMasterListStatus } from '../utils/master-list-query.util';
import { AttributeEntity } from '../entities/attribute.entity';
import { CategoryEntity } from '../entities/category.entity';
import { CategoryFilterEntity } from '../entities/category-filter.entity';
import {
  mapCategoryEntityToResponse,
  mapCategoryEntitiesToResponse,
  mapCategoryEntityToTree,
} from '../mappers/category.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';
import { HOMEPAGE_FLAG_LIMIT } from '../constants/homepage-flag-limit.constant';

const CATEGORY_MEDIA_FIELDS = ['image', 'banner'] as const;

const CATEGORY_FLAG_LABELS: Record<'isInHeader' | 'isInShopBy', string> = {
  isInHeader: 'header',
  isInShopBy: 'shop by category',
};

const CATEGORY_UPLOAD_FIELDS = {
  image: UploadFolder.IMAGES,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly categoryFiltersRepository: CategoryFiltersRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) { }

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<ICategory> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateCategoryDto,
      CATEGORY_UPLOAD_FIELDS,
    );

    return this.create(
      dto,
      {
        image: uploadedUrls['image'] ?? null,
        banner: uploadedUrls['banner'] ?? null,
      },
      createdBy,
    );
  }

  async updateFromRequest(refId: string, req: FastifyRequest, updatedBy: string): Promise<ICategory> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateCategoryDto,
      CATEGORY_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, {
      image: uploadedUrls['image'],
      banner: uploadedUrls['banner'],
    });
  }

  async create(
    dto: CreateCategoryDto,
    media: { image?: string | null; banner?: string | null } = {},
    createdBy: string,
  ): Promise<ICategory> {
    let hierarchyLevel = CategoryHierarchyLevel.ROOT;
    let parentCategoryId: string | null = null;

    if (dto.parentCategoryRefId) {
      const parent = await this.categoriesRepository.findByRefId(dto.parentCategoryRefId);
      if (!parent) {
        throw new NotFoundException(
          `Parent category with refId "${dto.parentCategoryRefId}" not found`,
        );
      }
      hierarchyLevel = this.getNextHierarchyLevel(parent.hierarchyLevel);
      parentCategoryId = parent.id;
    }

    const hierarchyId = await this.categoriesRepository.getNextHierarchyId();
    const slug = this.resolveCategorySlug(dto.slug, dto.name);
    if (await this.categoriesRepository.existsBySlug(slug)) {
      throw new ConflictException(`A category with slug "${slug}" already exists`);
    }
    const attributes = await this.resolveAttributes(dto.attributeRefIds ?? []);
    this.assertCategoryFiltersAllowed(hierarchyLevel, dto.categoryFilterRefIds);
    const categoryFilters =
      hierarchyLevel === CategoryHierarchyLevel.ROOT
        ? await this.resolveCategoryFilters(dto.categoryFilterRefIds ?? [])
        : [];
    await Promise.all([
      this.assertCategoryFlagWithinLimit('isInHeader', hierarchyLevel, dto.isInHeader ?? false),
      this.assertCategoryFlagWithinLimit('isInShopBy', hierarchyLevel, dto.isInShopBy ?? false),
    ]);

    if (
      await this.categoriesRepository.existsByNameAtHierarchyLevel(
        dto.name,
        hierarchyLevel,
      )
    ) {
      throw new ConflictException(
        `A ${this.hierarchyLevelLabel(hierarchyLevel)} with name "${dto.name}" already exists`,
      );
    }

    const maxSiblingPosition =
      await this.categoriesRepository.getMaxPositionAmongSiblings(parentCategoryId);
    const position = dto.position ?? maxSiblingPosition + 1;

    const entity = await this.categoriesRepository.createCategory(
      {
        name: dto.name,
        hierarchyId,
        parentCategoryId,
        position,
        hierarchyLevel,
        image: this.storageUrlEnricher.persist(media.image),
        banner: this.storageUrlEnricher.persist(media.banner),
        slug,
        description: dto.description ?? null,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        aboveTheFold: dto.aboveTheFold ?? null,
        belowTheFold: dto.belowTheFold ?? null,
        status: dto.status ?? MasterStatus.ACTIVE,
        refId: await generateUniqueRefId(dto.name, (refId) =>
          this.categoriesRepository.existsByRefId(refId),
        ),
        isInHeader: dto.isInHeader ?? false,
        isInShopBy: dto.isInShopBy ?? false,
        createdBy,
      },
      attributes,
      categoryFilters,
    );

    await this.emitCategoryUpdated(entity.refId, 'created');
    return this.enrichCategory(mapCategoryEntityToResponse(entity));
  }

  async findAll(query: CategoryQueryDto): Promise<PaginatedResult<ICategory>> {
    let parentCategoryId: string | null | undefined;

    if (query.parentCategoryRefId !== undefined) {
      if (!query.parentCategoryRefId) {
        parentCategoryId = null;
      } else {
        const parent = await this.categoriesRepository.findByRefId(query.parentCategoryRefId);
        if (!parent) {
          throw new NotFoundException(
            `Parent category with refId "${query.parentCategoryRefId}" not found`,
          );
        }
        parentCategoryId = parent.id;
      }
    }

    const paginationOptions = buildPaginationOptions(query);
    const options = {
      ...paginationOptions,
      hierarchyLevel: query.hierarchyLevel,
      parentCategoryId,
      status: resolveMasterListStatus(query.status),
      isInHeader: query.isInHeader,
      isInShopBy: query.isInShopBy,
    };
    const queryHash = buildQueryCacheHash({
      hierarchyLevel: query.hierarchyLevel,
      parentCategoryRefId: query.parentCategoryRefId,
      status: query.status,
      isInHeader: query.isInHeader,
      isInShopBy: query.isInShopBy,
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      sortBy: paginationOptions.sortBy,
      sortOrder: paginationOptions.sortOrder,
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.categories.list(queryHash),
      module: CacheModuleName.CATEGORY,
      loader: async () => {
        const { data, total } = await this.categoriesRepository.findAllPaginated(options);
        return buildPaginatedResult(mapCategoryEntitiesToResponse(data), total, options);
      },
    }).then((result) => this.storageUrlEnricher.enrichPaginated(result, [...CATEGORY_MEDIA_FIELDS]));
  }

  async findTree(): Promise<ICategoryTree[]> {
    const tree = await this.cacheStrategy.cacheAside({
      key: CacheKeys.categories.tree(),
      module: CacheModuleName.CATEGORY,
      loader: () => this.loadTreeUncached(),
    });

    return this.enrichCategoryTree(tree);
  }

  /** Used by cache listeners for write-through tree synchronization. */
  async loadTreeUncached(): Promise<ICategoryTree[]> {
    const categories = await this.categoriesRepository.findTree();
    return this.buildTree(categories);
  }

  async findOne(refId: string): Promise<ICategory> {
    const entity = await this.categoriesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }
    return this.enrichCategory(mapCategoryEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateCategoryDto,
    updatedBy: string,
    media: { image?: string; banner?: string } = {},
  ): Promise<ICategory> {
    const existing = await this.categoriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }

    // Re-determine hierarchy level if parent is changing
    let hierarchyLevel = existing.hierarchyLevel;
    let parentCategoryId = existing.parentCategoryId;

    if (dto.parentCategoryRefId !== undefined) {
      parentCategoryId = dto.parentCategoryRefId
        ? (await this.requireCategoryByRefId(dto.parentCategoryRefId)).id
        : null;

      await this.validateParentChange(existing.id, parentCategoryId);
      if (parentCategoryId) {
        const newParent = await this.categoriesRepository.findById(parentCategoryId);
        hierarchyLevel = this.getNextHierarchyLevel(newParent!.hierarchyLevel);
      } else {
        hierarchyLevel = CategoryHierarchyLevel.ROOT;
      }
    }

    // Prefer explicit slug from the form; otherwise regenerate only when name changes.
    let slug = existing.slug;
    if (dto.slug !== undefined) {
      slug = this.resolveCategorySlug(dto.slug, dto.name ?? existing.name);
    } else if (dto.name && dto.name !== existing.name) {
      slug = this.generateSlugFromName(dto.name);
    }
    if (slug !== existing.slug) {
      if (await this.categoriesRepository.existsBySlugExcluding(slug, refId)) {
        throw new ConflictException(`A category with slug "${slug}" already exists`);
      }
    }

    // Resolve attribute relations when attributeIds explicitly provided
    let attributes: AttributeEntity[] | undefined;
    if (dto.attributeRefIds !== undefined) {
      attributes = await this.resolveAttributes(dto.attributeRefIds);
    }

    this.assertCategoryFiltersAllowed(hierarchyLevel, dto.categoryFilterRefIds);

    let categoryFilters: CategoryFilterEntity[] | undefined;
    if (dto.categoryFilterRefIds !== undefined) {
      categoryFilters =
        hierarchyLevel === CategoryHierarchyLevel.ROOT
          ? await this.resolveCategoryFilters(dto.categoryFilterRefIds)
          : [];
    } else if (
      hierarchyLevel !== CategoryHierarchyLevel.ROOT &&
      (existing.categoryFilters?.length ?? 0) > 0
    ) {
      categoryFilters = [];
    }

    const effectiveIsInHeader = dto.isInHeader ?? existing.isInHeader;
    const effectiveIsInShopBy = dto.isInShopBy ?? existing.isInShopBy;
    await Promise.all([
      this.assertCategoryFlagWithinLimit('isInHeader', hierarchyLevel, effectiveIsInHeader, existing.id),
      this.assertCategoryFlagWithinLimit('isInShopBy', hierarchyLevel, effectiveIsInShopBy, existing.id),
    ]);

    const nameToCheck = dto.name ?? existing.name;
    if (
      (dto.name !== undefined && dto.name !== existing.name) ||
      dto.parentCategoryRefId !== undefined
    ) {
      if (
        await this.categoriesRepository.existsByNameAtHierarchyLevel(
          nameToCheck,
          hierarchyLevel,
          refId,
        )
      ) {
        throw new ConflictException(
          `A ${this.hierarchyLevelLabel(hierarchyLevel)} with name "${nameToCheck}" already exists`,
        );
      }
    }

    const updatePayload: Partial<CategoryEntity> = {
      hierarchyLevel,
      slug,
      updatedBy,
    };
    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.description !== undefined) updatePayload.description = dto.description ?? null;
    if (dto.parentCategoryRefId !== undefined) updatePayload.parentCategoryId = parentCategoryId;
    if (dto.position !== undefined) updatePayload.position = dto.position;
    if (media.image !== undefined) updatePayload.image = this.storageUrlEnricher.persist(media.image);
    if (media.banner !== undefined) updatePayload.banner = this.storageUrlEnricher.persist(media.banner);
    if (dto.metaTitle !== undefined) updatePayload.metaTitle = dto.metaTitle ?? null;
    if (dto.metaDescription !== undefined)
      updatePayload.metaDescription = dto.metaDescription ?? null;
    if (dto.aboveTheFold !== undefined) updatePayload.aboveTheFold = dto.aboveTheFold ?? null;
    if (dto.belowTheFold !== undefined) updatePayload.belowTheFold = dto.belowTheFold ?? null;
    if (dto.metaKeywords !== undefined) updatePayload.metaKeywords = dto.metaKeywords ?? null;
    if (dto.isInHeader !== undefined) updatePayload.isInHeader = dto.isInHeader;
    if (dto.isInShopBy !== undefined) updatePayload.isInShopBy = dto.isInShopBy;
    if (dto.status !== undefined) updatePayload.status = dto.status;

    const updated = await this.categoriesRepository.updateCategory(
      existing.id,
      updatePayload,
      attributes,
      categoryFilters,
    );
    if (!updated) {
      throw new NotFoundException(`Category with refId ${refId} not found after update`);
    }

    await this.emitCategoryUpdated(refId, 'updated');
    return this.enrichCategory(mapCategoryEntityToResponse(updated));
  }

  async updateStatus(
    refId: string,
    dto: UpdateCategoryStatusDto,
    updatedBy: string,
  ): Promise<ICategory> {
    const existing = await this.categoriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }

    const updated = await this.categoriesRepository.updateCategory(
      existing.id,
      { status: dto.status, updatedBy },
      undefined,
    );

    if (!updated) {
      throw new NotFoundException(`Category with refId ${refId} not found after status update`);
    }

    await this.emitCategoryUpdated(refId, 'status_updated');
    return this.enrichCategory(mapCategoryEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.categoriesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }

    await this.deletionGuard.assertCategoryDeletable(existing.id, existing.name);

    await this.categoriesRepository.softDeleteByRefId(refId);
    await this.emitCategoryUpdated(refId, 'deleted');
  }

  async findHeaderCategoriesForIndexing(
    parentCategoryRefId?: string,
  ): Promise<ICategory[]> {
    if (parentCategoryRefId) {
      const parent = await this.categoriesRepository.findByRefId(parentCategoryRefId);
      if (!parent) {
        throw new NotFoundException(
          `Parent category with refId "${parentCategoryRefId}" not found`,
        );
      }
      const children = await this.categoriesRepository.findChildrenForIndexing(parent.id);
      return mapCategoryEntitiesToResponse(children);
    }

    const roots = await this.categoriesRepository.findHeaderRootCategories();
    return mapCategoryEntitiesToResponse(roots);
  }

  async findShopByCategoriesForIndexing(): Promise<ICategory[]> {
    const roots = await this.categoriesRepository.findShopByRootCategories();
    return mapCategoryEntitiesToResponse(roots);
  }

  async reorderHeaderCategories(
    dto: ReorderCategoriesDto,
    updatedBy: string,
  ): Promise<ICategory[]> {
    return this.reorderCategorySiblings(dto, updatedBy, 'header');
  }

  async reorderShopByCategories(
    dto: ReorderCategoriesDto,
    updatedBy: string,
  ): Promise<ICategory[]> {
    return this.reorderCategorySiblings(dto, updatedBy, 'shopBy');
  }

  private async reorderCategorySiblings(
    dto: ReorderCategoriesDto,
    updatedBy: string,
    placement: 'header' | 'shopBy',
  ): Promise<ICategory[]> {
    let parentCategoryId: string | null = null;

    if (dto.parentCategoryRefId) {
      const parent = await this.categoriesRepository.findByRefId(dto.parentCategoryRefId);
      if (!parent) {
        throw new NotFoundException(
          `Parent category with refId "${dto.parentCategoryRefId}" not found`,
        );
      }
      parentCategoryId = parent.id;
    }

    for (const item of dto.categories) {
      const existing = await this.categoriesRepository.findByRefId(item.refId);
      if (!existing) {
        throw new NotFoundException(`Category with refId ${item.refId} not found`);
      }

      if (dto.parentCategoryRefId) {
        if (existing.parentCategoryId !== parentCategoryId) {
          throw new BadRequestException(
            `Category "${existing.name}" is not a child of the selected parent`,
          );
        }
      } else if (placement === 'header') {
        if (!existing.isInHeader || existing.hierarchyLevel !== CategoryHierarchyLevel.ROOT) {
          throw new BadRequestException(
            `Category "${existing.name}" is not a root header category`,
          );
        }
      } else if (!existing.isInShopBy || existing.hierarchyLevel !== CategoryHierarchyLevel.ROOT) {
        throw new BadRequestException(
          `Category "${existing.name}" is not a root shop-by category`,
        );
      }
    }

    await this.categoriesRepository.reorderCategoriesByRefId(
      dto.categories.map((item) => ({ refId: item.refId, position: item.position })),
    );

    for (const item of dto.categories) {
      await this.categoriesRepository.updateByRefId(item.refId, { updatedBy });
    }

    await this.emitCategoryUpdated(dto.categories[0].refId, 'updated');

    const results = await Promise.all(
      dto.categories.map((item) => this.categoriesRepository.findByRefId(item.refId)),
    );

    return mapCategoryEntitiesToResponse(
      results.filter((entity): entity is CategoryEntity => !!entity),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async emitCategoryUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.CATEGORY_UPDATED,
      new CategoryUpdatedEvent(refId, action),
    );
  }

  /**
   * Enforces that at most {@link HOMEPAGE_FLAG_LIMIT} root categories carry a given
   * homepage placement flag. Only root categories are capped since they drive the
   * top-level header / shop-by layout; nested categories are unrestricted.
   */
  private async assertCategoryFlagWithinLimit(
    flag: 'isInHeader' | 'isInShopBy',
    hierarchyLevel: CategoryHierarchyLevel,
    enabling: boolean,
    excludeId?: string,
  ): Promise<void> {
    if (!enabling || hierarchyLevel !== CategoryHierarchyLevel.ROOT) return;

    const count = await this.categoriesRepository.countRootCategoriesByFlag(flag, excludeId);
    if (count + 1 > HOMEPAGE_FLAG_LIMIT) {
      throw new BadRequestException(
        `A maximum of ${HOMEPAGE_FLAG_LIMIT} categories can be shown in the ${CATEGORY_FLAG_LABELS[flag]} section`,
      );
    }
  }

  private getNextHierarchyLevel(currentLevel: CategoryHierarchyLevel): CategoryHierarchyLevel {
    switch (currentLevel) {
      case CategoryHierarchyLevel.ROOT:
        return CategoryHierarchyLevel.CHILD;
      case CategoryHierarchyLevel.CHILD:
        return CategoryHierarchyLevel.GRANDCHILD;
      case CategoryHierarchyLevel.GRANDCHILD:
        return CategoryHierarchyLevel.GREAT_GRANDCHILD;
      case CategoryHierarchyLevel.GREAT_GRANDCHILD:
        throw new BadRequestException(
          'Maximum hierarchy depth exceeded. A GREAT_GRANDCHILD category cannot have children.',
        );
    }
  }

  private async requireCategoryByRefId(refId: string): Promise<CategoryEntity> {
    const category = await this.categoriesRepository.findByRefId(refId);
    if (!category) {
      throw new NotFoundException(`Category with refId "${refId}" not found`);
    }
    return category;
  }

  private async validateParentChange(
    categoryId: string,
    newParentId: string | null,
  ): Promise<void> {
    if (!newParentId) return; // Moving to root is always valid

    const parent = await this.categoriesRepository.findById(newParentId);
    if (!parent) {
      throw new NotFoundException(`Parent category with id "${newParentId}" not found`);
    }

    // Circular hierarchy guard — new parent must not be a descendant of this category
    const descendantIds = await this.categoriesRepository.findAllDescendantIds(categoryId);
    if (descendantIds.includes(newParentId)) {
      throw new BadRequestException(
        'Circular hierarchy detected. A category cannot be moved under one of its own descendants.',
      );
    }
  }

  private resolveCategorySlug(slugInput: string | undefined, name: string): string {
    const trimmed = slugInput?.trim();
    return trimmed ? trimmed : this.generateSlugFromName(name);
  }

  private generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private hierarchyLevelLabel(level: CategoryHierarchyLevel): string {
    switch (level) {
      case CategoryHierarchyLevel.ROOT:
        return 'root category';
      case CategoryHierarchyLevel.CHILD:
        return 'sub category';
      case CategoryHierarchyLevel.GRANDCHILD:
        return 'sub-sub category';
      case CategoryHierarchyLevel.GREAT_GRANDCHILD:
        return 'sub-sub-sub category';
      default:
        return 'category';
    }
  }

  private async resolveAttributes(attributeRefIds: string[]): Promise<AttributeEntity[]> {
    if (!attributeRefIds.length) return [];

    const results = await Promise.all(
      attributeRefIds.map((refId) => this.attributesRepository.findByRefId(refId)),
    );

    const missing = attributeRefIds.filter((_, i) => !results[i]);
    if (missing.length) {
      throw new NotFoundException(
        `Attribute(s) not found with refId(s): ${missing.join(', ')}`,
      );
    }

    return results as AttributeEntity[];
  }

  private assertCategoryFiltersAllowed(
    hierarchyLevel: CategoryHierarchyLevel,
    categoryFilterRefIds: string[] | undefined,
  ): void {
    if (
      hierarchyLevel !== CategoryHierarchyLevel.ROOT &&
      categoryFilterRefIds !== undefined &&
      categoryFilterRefIds.length > 0
    ) {
      throw new BadRequestException('Category filters can only be assigned to root categories');
    }
  }

  private async resolveCategoryFilters(
    categoryFilterRefIds: string[],
  ): Promise<CategoryFilterEntity[]> {
    if (!categoryFilterRefIds.length) return [];

    const filters = await this.categoryFiltersRepository.findByRefIds(categoryFilterRefIds);
    const foundRefIds = new Set(filters.map((filter) => filter.refId));
    const missing = categoryFilterRefIds.filter((refId) => !foundRefIds.has(refId));
    if (missing.length) {
      throw new NotFoundException(
        `Category filter(s) not found with refId(s): ${missing.join(', ')}`,
      );
    }

    return categoryFilterRefIds.map(
      (refId) => filters.find((filter) => filter.refId === refId)!,
    );
  }

  private buildTree(categories: CategoryEntity[]): ICategoryTree[] {
    const map = new Map<string, ICategoryTree>();

    for (const cat of categories) {
      map.set(cat.refId, mapCategoryEntityToTree(cat));
    }

    const roots: ICategoryTree[] = [];

    map.forEach((node) => {
      if (node.parentCategoryRefId) {
        const parent = map.get(node.parentCategoryRefId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Orphaned node — parent not in result set (e.g. deleted); promote to root
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    const sortByPosition = (items: ICategoryTree[]): void => {
      items.sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);
      items.forEach((item) => sortByPosition(item.children));
    };
    sortByPosition(roots);

    return roots;
  }

  private enrichCategory(category: ICategory): Promise<ICategory> {
    return this.storageUrlEnricher.enrichFields(category, [...CATEGORY_MEDIA_FIELDS]);
  }

  private async enrichCategoryTree(nodes: ICategoryTree[]): Promise<ICategoryTree[]> {
    return Promise.all(
      nodes.map(async (node) => ({
        ...(await this.storageUrlEnricher.enrichFields(node, [...CATEGORY_MEDIA_FIELDS])),
        children: node.children.length
          ? await this.enrichCategoryTree(node.children)
          : node.children,
      })),
    );
  }
}
