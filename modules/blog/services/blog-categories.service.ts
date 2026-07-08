import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import {
  BlogCategoryQueryDto,
  CreateBlogCategoryDto,
  UpdateBlogCategoryDto,
  UpdateBlogCategoryStatusDto,
} from '../dto/blog.dto';
import { BlogCategoryEntity } from '../entities/blog-category.entity';
import { BlogCategoryStatus } from '../enums/blog-category-status.enum';
import { mapBlogCategory } from '../mappers/blog.mapper';
import { BlogCategoriesRepository } from '../repositories/blog-categories.repository';

const BLOG_CATEGORY_UPLOAD_FIELDS = {
  icon: UploadFolder.ICONS,
} as const;

@Injectable()
export class BlogCategoriesService {
  constructor(
    private readonly categoriesRepo: BlogCategoriesRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async createFromRequest(req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateBlogCategoryDto,
      BLOG_CATEGORY_UPLOAD_FIELDS,
    );

    return this.create(dto, actor, {
      icon: uploadedUrls.icon ?? null,
    });
  }

  async updateFromRequest(refId: string, req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateBlogCategoryDto,
      BLOG_CATEGORY_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, actor, {
      icon: uploadedUrls.icon,
    });
  }

  async create(
    dto: CreateBlogCategoryDto,
    actor: string,
    media: { icon?: string | null } = {},
  ) {
    if (await this.categoriesRepo.existsBySlug(dto.slug)) {
      throw new ConflictException('Blog category slug already exists');
    }

    const refId = await generateUniqueRefId(dto.name, (id) =>
      this.categoriesRepo.existsByRefId(id),
    );

    const entity = await this.categoriesRepo.create({
      refId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description ?? null,
      icon: this.storageUrlEnricher.persist(media.icon),
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? BlogCategoryStatus.ACTIVE,
      createdBy: actor,
      updatedBy: actor,
    });

    return this.enrichCategory(mapBlogCategory(entity));
  }

  async findAll(
    query: BlogCategoryQueryDto,
  ): Promise<PaginatedResult<Awaited<ReturnType<typeof this.enrichCategory>>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.categoriesRepo.findAllPaginated({
      ...pagination,
      status: query.status,
    });

    const mapped = await Promise.all(
      data.map((entity) => this.enrichCategory(mapBlogCategory(entity))),
    );

    return buildPaginatedResult(mapped, total, pagination);
  }

  async findAllActive() {
    const data = await this.categoriesRepo.findAllActive();
    return Promise.all(
      data.map((entity) => this.enrichCategory(mapBlogCategory(entity))),
    );
  }

  async findOne(refId: string) {
    const entity = await this.categoriesRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Blog category not found');
    return this.enrichCategory(mapBlogCategory(entity));
  }

  async findBySlug(slug: string) {
    const entity = await this.categoriesRepo.findBySlug(slug);
    if (!entity || entity.status !== BlogCategoryStatus.ACTIVE) {
      throw new NotFoundException('Blog category not found');
    }
    return this.enrichCategory(mapBlogCategory(entity));
  }

  async update(
    refId: string,
    dto: UpdateBlogCategoryDto,
    actor: string,
    media: { icon?: string | null } = {},
  ) {
    const existing = await this.categoriesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog category not found');

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.categoriesRepo.existsBySlug(dto.slug, refId)) {
        throw new ConflictException('Blog category slug already exists');
      }
    }

    const patch: Partial<BlogCategoryEntity> = {
      ...dto,
      updatedBy: actor,
    };

    if (media.icon !== undefined) {
      patch.icon = this.storageUrlEnricher.persist(media.icon);
    }

    const updated = await this.categoriesRepo.updateByRefId(refId, patch);

    return this.enrichCategory(mapBlogCategory(updated as BlogCategoryEntity));
  }

  async updateStatus(refId: string, dto: UpdateBlogCategoryStatusDto, actor: string) {
    return this.update(refId, { status: dto.status }, actor);
  }

  async remove(refId: string) {
    const existing = await this.categoriesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog category not found');
    await this.categoriesRepo.softDeleteByRefId(refId);
  }

  async assertCategoryExists(refId: string) {
    const category = await this.categoriesRepo.findByRefId(refId);
    if (!category) throw new BadRequestException('Invalid blog category');
    return category;
  }

  private async enrichCategory<T extends { icon?: unknown }>(category: T): Promise<T> {
    if (!category.icon) return category;
    return this.storageUrlEnricher.enrichFields(category, ['icon']) as Promise<T>;
  }
}
