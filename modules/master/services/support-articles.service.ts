import {
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
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupportArticleUpdatedEvent, EVENTS } from '@packages/events';
import { IStorageFileReference } from '@packages/storage';
import {
  CreateSupportArticleDto,
  SupportArticleQueryDto,
  UpdateSupportArticleDto,
  UpdateSupportArticleStatusDto,
} from '../dto/support.dto';
import { SupportArticleEntity } from '../entities/support-article.entity';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';
import { mapStorefrontArticle, mapSupportArticle } from '../mappers/support.mapper';
import { SupportArticlesRepository } from '../repositories/support-articles.repository';
import { SupportCategoriesService } from './support-categories.service';

const ARTICLE_UPLOAD_FIELDS = { featuredImageFile: UploadFolder.SUPPORT_ATTACHMENTS } as const;

@Injectable()
export class SupportArticlesService {
  constructor(
    private readonly articlesRepo: SupportArticlesRepository,
    private readonly categoriesService: SupportCategoriesService,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createFromJson(dto: CreateSupportArticleDto, actor: string) {
    return this.create(dto, actor);
  }

  async createFromRequest(req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateSupportArticleDto,
      ARTICLE_UPLOAD_FIELDS,
    );

    return this.create(
      {
        ...dto,
        ...(uploadedUrls.featuredImageFile
          ? { featuredImage: this.storageUrlEnricher.persist(uploadedUrls.featuredImageFile) }
          : {}),
      } as CreateSupportArticleDto & { featuredImage?: IStorageFileReference | null },
      actor,
    );
  }

  private async create(
    dto: CreateSupportArticleDto & { featuredImage?: IStorageFileReference | null },
    actor: string,
  ) {
    await this.categoriesService.assertCategoryExists(dto.categoryRefId, SupportCategoryType.ARTICLE);

    if (await this.articlesRepo.existsBySlug(dto.slug)) {
      throw new ConflictException('Article slug already exists');
    }

    const refId = await generateUniqueRefId(dto.title, (id) =>
      this.articlesRepo.existsByRefId(id),
    );

    const entity = await this.articlesRepo.create({
      refId,
      title: dto.title,
      slug: dto.slug,
      categoryRefId: dto.categoryRefId,
      content: dto.content,
      featuredImage: dto.featuredImage ?? null,
      status: dto.status ?? SupportContentStatus.ACTIVE,
      createdBy: actor,
      updatedBy: actor,
    });

    await this.emitSupportArticleUpdated(entity.refId, 'created');
    return this.enrichArticle(mapSupportArticle(entity));
  }

  async findAll(query: SupportArticleQueryDto): Promise<PaginatedResult<ReturnType<typeof mapSupportArticle>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.articlesRepo.findAllPaginated({
      ...pagination,
      categoryRefId: query.categoryRefId,
      status: query.status,
    });

    const mapped = await Promise.all(data.map((a) => this.enrichArticle(mapSupportArticle(a))));
    return buildPaginatedResult(mapped, total, pagination);
  }

  async findAllPublic(query: SupportArticleQueryDto) {
    const result = await this.findAll({
      ...query,
      status: SupportContentStatus.ACTIVE,
    });
    return {
      ...result,
      data: result.data.map((article) => ({
        refId: article.refId,
        title: article.title,
        slug: article.slug,
        categoryRefId: article.categoryRefId,
        featuredImage: article.featuredImage,
        views: article.views,
        createdAt: article.createdAt,
      })),
    };
  }

  async findOne(refId: string) {
    const entity = await this.articlesRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Support article not found');
    return this.enrichArticle(mapSupportArticle(entity));
  }

  async findOneBySlug(slug: string) {
    const entity = await this.articlesRepo.findBySlug(slug);
    if (!entity || entity.status !== SupportContentStatus.ACTIVE) {
      throw new NotFoundException('Support article not found');
    }

    await this.articlesRepo.incrementViews(entity.refId);
    return this.enrichArticle(mapStorefrontArticle({ ...entity, views: entity.views + 1 }));
  }

  async updateFromJson(refId: string, dto: UpdateSupportArticleDto, actor: string) {
    return this.update(refId, dto, actor);
  }

  async updateFromRequest(refId: string, req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateSupportArticleDto,
      ARTICLE_UPLOAD_FIELDS,
    );

    return this.update(
      refId,
      {
        ...dto,
        ...(uploadedUrls.featuredImageFile
          ? { featuredImage: this.storageUrlEnricher.persist(uploadedUrls.featuredImageFile) }
          : {}),
      } as UpdateSupportArticleDto & { featuredImage?: IStorageFileReference | null },
      actor,
    );
  }

  private async update(
    refId: string,
    dto: UpdateSupportArticleDto & { featuredImage?: IStorageFileReference | null },
    actor: string,
  ) {
    const existing = await this.articlesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support article not found');

    if (dto.categoryRefId) {
      await this.categoriesService.assertCategoryExists(dto.categoryRefId, SupportCategoryType.ARTICLE);
    }

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.articlesRepo.existsBySlug(dto.slug, refId)) {
        throw new ConflictException('Article slug already exists');
      }
    }

    const updated = await this.articlesRepo.updateByRefId(refId, {
      ...dto,
      updatedBy: actor,
    });

    await this.emitSupportArticleUpdated(refId, 'updated');
    return this.enrichArticle(mapSupportArticle(updated as SupportArticleEntity));
  }

  async updateStatus(refId: string, dto: UpdateSupportArticleStatusDto, actor: string) {
    return this.update(refId, { status: dto.status }, actor);
  }

  async remove(refId: string) {
    const existing = await this.articlesRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Support article not found');
    await this.articlesRepo.softDeleteByRefId(refId);
    await this.emitSupportArticleUpdated(refId, 'deleted');
  }

  private async emitSupportArticleUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.SUPPORT_ARTICLE_UPDATED,
      new SupportArticleUpdatedEvent(refId, action),
    );
  }

  private async enrichArticle<T extends { featuredImage?: unknown }>(article: T): Promise<T> {
    if (!article.featuredImage) return article;
    const enriched = await this.storageUrlEnricher.enrichFields(article, ['featuredImage']);
    return enriched as T;
  }
}
