import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const slug = await this.generateUniqueSlug(dto.name, hierarchyId, null);
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
        status: dto.status ?? MasterStatus.ACTIVE,
        refId: await generateUniqueRefId(dto.name, (refId) =>
          this.categoriesRepository.existsByRefId(refId),
        ),
        createdBy,
      },
      attributes,
    );

    return mapCategoryEntityToResponse(entity);
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

    const options = {
      ...buildPaginationOptions(query),
      hierarchyLevel: query.hierarchyLevel,
      parentCategoryId,
    };
    const { data, total } = await this.categoriesRepository.findAllPaginated(options);
    return buildPaginatedResult(mapCategoryEntitiesToResponse(data), total, options);
  }

  async findTree(): Promise<ICategoryTree[]> {
    const categories = await this.categoriesRepository.findTree();
    return this.buildTree(categories);
  }

  async findOne(refId: string): Promise<ICategory> {
    const entity = await this.categoriesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }
    return mapCategoryEntityToResponse(entity);
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
      slug = await this.generateUniqueSlug(dto.name, existing.hierarchyId, existing.id);
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

    return mapCategoryEntityToResponse(updated);
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

    return mapCategoryEntityToResponse(updated);
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
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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

  private async generateUniqueSlug(
    name: string,
    hierarchyId: number,
    excludeId: string | null,
  ): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

    const existingBase = excludeId
      ? await this.categoriesRepository.findBySlugExcluding(baseSlug, excludeId)
      : await this.categoriesRepository.findBySlug(baseSlug);

    if (!existingBase) return baseSlug;

    const slugWithId = `${baseSlug}-${hierarchyId}`;
    const existingWithId = excludeId
      ? await this.categoriesRepository.findBySlugExcluding(slugWithId, excludeId)
      : await this.categoriesRepository.findBySlug(slugWithId);

    if (!existingWithId) return slugWithId;

    throw new ConflictException(
      `Could not generate a unique slug for "${name}". Please choose a more specific name.`,
    );
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
}
