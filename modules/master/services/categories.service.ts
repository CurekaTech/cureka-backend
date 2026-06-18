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
import { CreateCategoryDto, UpdateCategoryDto, UpdateCategoryStatusDto, CategoryQueryDto } from '../dto/category.dto';
import { ICategory, ICategoryTree } from '../interfaces/category.interface';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { AttributeEntity } from '../entities/attribute.entity';
import { CategoryEntity } from '../entities/category.entity';
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

const CATEGORY_MEDIA_FIELDS = ['image', 'banner'] as const;

const CATEGORY_UPLOAD_FIELDS = {
  image: UploadFolder.IMAGES,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly attributesRepository: AttributesRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

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
    const slug = this.generateSlugFromName(dto.name);
    const attributes = await this.resolveAttributes(dto.attributeRefIds ?? []);

    const entity = await this.categoriesRepository.createCategory(
      {
        name: dto.name,
        hierarchyId,
        parentCategoryId,
        position: dto.position ?? 0,
        hierarchyLevel,
        image: media.image ?? null,
        banner: media.banner ?? null,
        slug,
        metaTitle: dto.metaTitle ?? null,
        metaDescription: dto.metaDescription ?? null,
        metaKeywords: dto.metaKeywords ?? null,
        aboveTheFold: dto.aboveTheFold ?? null,
        belowTheFold: dto.belowTheFold ?? null,
        status: dto.status ?? MasterStatus.ACTIVE,
        refId: await generateUniqueRefId(dto.name, (refId) =>
          this.categoriesRepository.existsByRefId(refId),
        ),
        createdBy,
      },
      attributes,
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
    };
    const queryHash = buildQueryCacheHash({
      hierarchyLevel: query.hierarchyLevel,
      parentCategoryRefId: query.parentCategoryRefId,
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

    // Regenerate slug only when name changes
    let slug = existing.slug;
    if (dto.name && dto.name !== existing.name) {
      slug = this.generateSlugFromName(dto.name);
    }

    // Resolve attribute relations when attributeIds explicitly provided
    let attributes: AttributeEntity[] | undefined;
    if (dto.attributeRefIds !== undefined) {
      attributes = await this.resolveAttributes(dto.attributeRefIds);
    }

    const updatePayload: Partial<CategoryEntity> = {
      hierarchyLevel,
      slug,
      updatedBy,
    };
    if (dto.name !== undefined) updatePayload.name = dto.name;
    if (dto.parentCategoryRefId !== undefined) updatePayload.parentCategoryId = parentCategoryId;
    if (dto.position !== undefined) updatePayload.position = dto.position;
    if (media.image !== undefined) updatePayload.image = media.image;
    if (media.banner !== undefined) updatePayload.banner = media.banner;
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

    const childCount = await this.categoriesRepository.countChildren(existing.id);
    if (childCount > 0) {
      throw new ConflictException(
        `Cannot delete category "${existing.name}" — it has ${childCount} child ${childCount === 1 ? 'category' : 'categories'}. Delete or reassign children first.`,
      );
    }

    await this.categoriesRepository.softDeleteByRefId(refId);
    await this.emitCategoryUpdated(refId, 'deleted');
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

  private generateSlugFromName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
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
