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
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { AuditEntityType } from '@modules/audit/constants/audit-entity-type.constant';
import { AuditService } from '@modules/audit/services/audit.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { IStorageFileReference } from '@packages/storage';
import { mapProductEntitiesToPublicCards } from '@modules/public/mappers/public-product.mapper';
import {
  BlogPostQueryDto,
  CreateBlogPostDto,
  PublicBlogSearchQueryDto,
  UpdateBlogPostDto,
  UpdateBlogPostStatusDto,
} from '../dto/blog.dto';
import { BlogPostEntity } from '../entities/blog-post.entity';
import { BlogAuditAction } from '../enums/blog-audit-action.enum';
import { BlogPostStatus } from '../enums/blog-post-status.enum';
import { BlogPostVisibility } from '../enums/blog-post-visibility.enum';
import { mapBlogPost, mapBlogPostCard, mapStorefrontBlogPost } from '../mappers/blog.mapper';
import { BlogPostProductsRepository } from '../repositories/blog-post-products.repository';
import { BlogPostsRepository } from '../repositories/blog-posts.repository';
import { BlogCategoriesService } from './blog-categories.service';
import { IBlogHealthReadsSection } from '../interfaces/blog-homepage.interface';


const BLOG_UPLOAD_FIELDS = {
  featuredImageFile: UploadFolder.BLOG_IMAGES,
  featuredVideoFile: UploadFolder.BLOG_VIDEOS,
} as const;

const HEALTH_READS_HOMEPAGE_LIMIT = 3;

@Injectable()
export class BlogPostsService {
  constructor(
    private readonly postsRepo: BlogPostsRepository,
    private readonly postProductsRepo: BlogPostProductsRepository,
    private readonly auditService: AuditService,
    private readonly categoriesService: BlogCategoriesService,
    private readonly productsRepo: ProductsRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async createFromJson(dto: CreateBlogPostDto, actor: string) {
    return this.create(dto, actor);
  }

  async createFromRequest(req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateBlogPostDto,
      BLOG_UPLOAD_FIELDS,
    );

    return this.create(
      {
        ...dto,
        ...(uploadedUrls.featuredImageFile
          ? { featuredImage: this.storageUrlEnricher.persist(uploadedUrls.featuredImageFile) }
          : {}),
        ...(uploadedUrls.featuredVideoFile
          ? { featuredVideo: this.storageUrlEnricher.persist(uploadedUrls.featuredVideoFile) }
          : {}),
      } as CreateBlogPostDto & {
        featuredImage?: IStorageFileReference | null;
        featuredVideo?: IStorageFileReference | null;
      },
      actor,
    );
  }

  private async create(
    dto: CreateBlogPostDto & {
      featuredImage?: IStorageFileReference | null;
      featuredVideo?: IStorageFileReference | null;
    },
    actor: string,
  ) {
    await this.categoriesService.assertCategoryExists(dto.categoryRefId);

    if (await this.postsRepo.existsBySlug(dto.slug)) {
      throw new ConflictException('Blog slug already exists');
    }

    if (dto.productRefIds?.length) {
      await this.assertProductsExist(dto.productRefIds);
    }

    const refId = await generateUniqueRefId(dto.title, (id) => this.postsRepo.existsByRefId(id));

    const status = dto.status ?? BlogPostStatus.DRAFT;
    const publishedAt = this.resolvePublishedAt(status, dto.publishedAt, dto.scheduledAt);

    const entity = await this.postsRepo.create({
      refId,
      title: dto.title,
      slug: dto.slug,
      excerpt: dto.excerpt ?? null,
      content: dto.content,
      faqs: this.normalizeFaqs(dto.faqs),
      categoryRefId: dto.categoryRefId,
      author: dto.author ?? null,
      featuredImage: dto.featuredImage ?? null,
      featuredVideo: dto.featuredVideo ?? null,
      tags: dto.tags ?? null,
      status,
      visibility: dto.visibility ?? BlogPostVisibility.PUBLIC,
      isFeatured: dto.isFeatured ?? false,
      isTrending: dto.isTrending ?? false,
      metaTitle: dto.metaTitle ?? null,
      metaDescription: dto.metaDescription ?? null,
      metaKeywords: dto.metaKeywords ?? null,
      publishedAt,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      createdBy: actor,
      updatedBy: actor,
    });

    if (dto.productRefIds) {
      await this.postProductsRepo.replaceForBlogPost(entity.id, dto.productRefIds, actor);
    }

    await this.logAudit(entity.id, entity.refId, BlogAuditAction.CREATED, actor, {
      refId: entity.refId,
    });

    await this.invalidateHomepageHealthReadsCache();

    return this.enrichPost(await this.mapWithProducts(entity));
  }

  async findAll(query: BlogPostQueryDto): Promise<PaginatedResult<ReturnType<typeof mapBlogPost>>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.postsRepo.findAllPaginated({
      ...pagination,
      categoryRefId: query.categoryRefId,
      status: query.status,
      visibility: query.visibility,
      isFeatured: query.isFeatured,
      isTrending: query.isTrending,
    });

    const mapped = await Promise.all(
      data.map(async (post) => this.enrichPost(await this.mapWithProducts(post))),
    );

    return buildPaginatedResult(mapped, total, pagination);
  }

  async findAllPublic(query: PublicBlogSearchQueryDto) {
    let categoryRefId = query.categoryRefId;

    if (query.categorySlug) {
      const category = await this.categoriesService.findBySlug(query.categorySlug);
      categoryRefId = category.refId;
    }

    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.postsRepo.findAllPaginated({
      ...pagination,
      categoryRefId,
      status: BlogPostStatus.PUBLISHED,
      visibility: BlogPostVisibility.PUBLIC,
      tag: query.tag,
    });

    const mapped = await Promise.all(
      data.map(async (post) => this.enrichPostCard(await this.mapWithProducts(post))),
    );

    return buildPaginatedResult(mapped, total, pagination);
  }

  async findFeaturedPublic() {
    const posts = await this.postsRepo.findFeatured();
    return Promise.all(
      posts.map(async (post) => this.enrichPostCard(await this.mapWithProducts(post))),
    );
  }

  async findTrendingPublic() {
    const posts = await this.postsRepo.findTrending();
    return Promise.all(
      posts.map(async (post) => this.enrichPostCard(await this.mapWithProducts(post))),
    );
  }

  /** Homepage Health Reads — storage refs only; signed URLs are added after cache read. */
  async loadHealthReadsUncached(): Promise<IBlogHealthReadsSection> {
    const collected: BlogPostEntity[] = [];
    const seen = new Set<string>();

    const appendUnique = (posts: BlogPostEntity[]) => {
      for (const post of posts) {
        if (seen.has(post.refId)) continue;
        collected.push(post);
        seen.add(post.refId);
        if (collected.length >= HEALTH_READS_HOMEPAGE_LIMIT) return;
      }
    };

    appendUnique(await this.postsRepo.findFeatured(HEALTH_READS_HOMEPAGE_LIMIT));
    if (collected.length < HEALTH_READS_HOMEPAGE_LIMIT) {
      appendUnique(await this.postsRepo.findTrending(HEALTH_READS_HOMEPAGE_LIMIT));
    }
    if (collected.length < HEALTH_READS_HOMEPAGE_LIMIT) {
      appendUnique(await this.postsRepo.findLatestPublished(HEALTH_READS_HOMEPAGE_LIMIT));
    }

    const posts = collected.slice(0, HEALTH_READS_HOMEPAGE_LIMIT).map((entity) => {
      const mapped = mapBlogPostCard(entity);
      return {
        refId: mapped.refId,
        title: mapped.title,
        slug: mapped.slug,
        excerpt: mapped.excerpt,
        categoryRefId: mapped.categoryRefId,
        author: mapped.author,
        featuredImage: this.storageUrlEnricher.persist(entity.featuredImage),
        tags: mapped.tags,
        publishedAt: mapped.publishedAt,
        views: mapped.views,
      };
    });

    return { posts };
  }

  async findOne(refId: string) {
    const entity = await this.postsRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Blog post not found');
    return this.enrichPost(await this.mapWithProducts(entity));
  }

  async findOneBySlug(slug: string) {
    const entity = await this.postsRepo.findBySlug(slug);
    if (
      !entity ||
      entity.status !== BlogPostStatus.PUBLISHED ||
      entity.visibility !== BlogPostVisibility.PUBLIC
    ) {
      throw new NotFoundException('Blog post not found');
    }

    await this.postsRepo.incrementViews(entity.refId);
    const viewedEntity = { ...entity, views: entity.views + 1 };
    const productRefIds = await this.postProductsRepo.findProductRefIdsByBlogPostId(entity.id);
    const storefront = mapStorefrontBlogPost(viewedEntity, { productRefIds });

    const [enrichedPost, products, relatedBlogs] = await Promise.all([
      this.enrichPost(storefront),
      this.loadLinkedProducts(productRefIds),
      this.findRelatedPublic(entity.categoryRefId, entity.refId),
    ]);

    return {
      ...enrichedPost,
      products,
      relatedBlogs,
    };
  }

  async findRelatedPublic(categoryRefId: string, excludeRefId: string) {
    const posts = await this.postsRepo.findRelated(categoryRefId, excludeRefId);
    return Promise.all(
      posts.map(async (post) => this.enrichPostCard(await this.mapWithProducts(post))),
    );
  }

  async findAuditLogs(refId: string) {
    const entity = await this.postsRepo.findByRefId(refId);
    if (!entity) throw new NotFoundException('Blog post not found');
    return this.auditService.findByEntity(AuditEntityType.BLOG_POST, entity.id, 'DESC');
  }

  async updateFromJson(refId: string, dto: UpdateBlogPostDto, actor: string) {
    return this.update(refId, dto, actor);
  }

  async updateFromRequest(refId: string, req: FastifyRequest, actor: string) {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateBlogPostDto,
      BLOG_UPLOAD_FIELDS,
    );

    return this.update(
      refId,
      {
        ...dto,
        ...(uploadedUrls.featuredImageFile
          ? { featuredImage: this.storageUrlEnricher.persist(uploadedUrls.featuredImageFile) }
          : {}),
        ...(uploadedUrls.featuredVideoFile
          ? { featuredVideo: this.storageUrlEnricher.persist(uploadedUrls.featuredVideoFile) }
          : {}),
      } as UpdateBlogPostDto & {
        featuredImage?: IStorageFileReference | null;
        featuredVideo?: IStorageFileReference | null;
      },
      actor,
    );
  }

  private async update(
    refId: string,
    dto: UpdateBlogPostDto & {
      featuredImage?: IStorageFileReference | null;
      featuredVideo?: IStorageFileReference | null;
    },
    actor: string,
  ) {
    const existing = await this.postsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog post not found');

    if (dto.categoryRefId) {
      await this.categoriesService.assertCategoryExists(dto.categoryRefId);
    }

    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.postsRepo.existsBySlug(dto.slug, refId)) {
        throw new ConflictException('Blog slug already exists');
      }
    }

    if (dto.productRefIds?.length) {
      await this.assertProductsExist(dto.productRefIds);
    }

    const nextStatus = dto.status ?? existing.status;
    const publishedAt =
      dto.publishedAt !== undefined || dto.status !== undefined || dto.scheduledAt !== undefined
        ? this.resolvePublishedAt(
            nextStatus,
            dto.publishedAt ?? existing.publishedAt?.toISOString(),
            dto.scheduledAt ?? existing.scheduledAt?.toISOString(),
          )
        : existing.publishedAt;

    const { productRefIds, faqs, ...postDto } = dto;

    const updated = await this.postsRepo.updateByRefId(refId, {
      ...postDto,
      ...(faqs !== undefined ? { faqs: this.normalizeFaqs(faqs) } : {}),
      publishedAt,
      scheduledAt:
        dto.scheduledAt !== undefined
          ? dto.scheduledAt
            ? new Date(dto.scheduledAt)
            : null
          : existing.scheduledAt,
      updatedBy: actor,
    });

    if (productRefIds !== undefined) {
      await this.postProductsRepo.replaceForBlogPost(existing.id, productRefIds, actor);
    }

    await this.logAudit(existing.id, refId, BlogAuditAction.UPDATED, actor, {
      refId,
      changes: Object.keys(dto),
    });

    if (dto.status && dto.status !== existing.status) {
      await this.logAudit(existing.id, refId, BlogAuditAction.STATUS_CHANGED, actor, {
        from: existing.status,
        to: dto.status,
      });
    }

    if (dto.isFeatured !== undefined && dto.isFeatured !== existing.isFeatured) {
      await this.logAudit(
        existing.id,
        refId,
        dto.isFeatured ? BlogAuditAction.FEATURED : BlogAuditAction.UNFEATURED,
        actor,
      );
    }

    if (dto.isTrending !== undefined && dto.isTrending !== existing.isTrending) {
      await this.logAudit(
        existing.id,
        refId,
        dto.isTrending ? BlogAuditAction.TRENDING : BlogAuditAction.UNTRENDING,
        actor,
      );
    }

    await this.invalidateHomepageHealthReadsCache();

    return this.enrichPost(await this.mapWithProducts(updated as BlogPostEntity));
  }

  async updateStatus(refId: string, dto: UpdateBlogPostStatusDto, actor: string) {
    const existing = await this.postsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog post not found');

    const publishedAt = this.resolvePublishedAt(
      dto.status,
      existing.publishedAt?.toISOString(),
      existing.scheduledAt?.toISOString(),
    );

    const updated = await this.update(
      refId,
      { status: dto.status, publishedAt: publishedAt?.toISOString() },
      actor,
    );

    const action =
      dto.status === BlogPostStatus.PUBLISHED
        ? BlogAuditAction.PUBLISHED
        : dto.status === BlogPostStatus.DRAFT
          ? BlogAuditAction.UNPUBLISHED
          : BlogAuditAction.STATUS_CHANGED;

    await this.logAudit(existing.id, refId, action, actor, { status: dto.status });

    await this.invalidateHomepageHealthReadsCache();

    return updated;
  }

  async remove(refId: string, actor: string) {
    const existing = await this.postsRepo.findByRefId(refId);
    if (!existing) throw new NotFoundException('Blog post not found');

    await this.logAudit(existing.id, refId, BlogAuditAction.DELETED, actor, { refId });
    await this.postsRepo.softDeleteByRefId(refId);
    await this.invalidateHomepageHealthReadsCache();
  }

  private resolvePublishedAt(
    status: BlogPostStatus,
    publishedAt?: string,
    scheduledAt?: string,
  ): Date | null {
    if (status === BlogPostStatus.PUBLISHED) {
      return publishedAt ? new Date(publishedAt) : new Date();
    }

    if (status === BlogPostStatus.SCHEDULED && scheduledAt) {
      return null;
    }

    return publishedAt ? new Date(publishedAt) : null;
  }

  private normalizeFaqs(
    faqs?: Array<{ question: string; answer: string }>,
  ): Array<{ question: string; answer: string }> {
    if (!faqs?.length) return [];
    return faqs
      .map((faq) => ({
        question: faq.question?.trim() ?? '',
        answer: faq.answer?.trim() ?? '',
      }))
      .filter((faq) => faq.question && faq.answer);
  }

  private async assertProductsExist(productRefIds: string[]) {
    for (const productRefId of [...new Set(productRefIds)]) {
      const product = await this.productsRepo.findByRefId(productRefId);
      if (!product) {
        throw new BadRequestException(`Invalid product reference: ${productRefId}`);
      }
    }
  }

  private async mapWithProducts(entity: BlogPostEntity) {
    const productRefIds = await this.postProductsRepo.findProductRefIdsByBlogPostId(entity.id);
    return mapBlogPost(entity, { productRefIds });
  }

  private async enrichPostCard<T extends { featuredImage?: unknown }>(post: T): Promise<T> {
    if (!post.featuredImage) return post;
    return this.storageUrlEnricher.enrichFields(post, ['featuredImage']) as Promise<T>;
  }

  private async enrichPost<T extends { featuredImage?: unknown; featuredVideo?: unknown }>(
    post: T,
  ): Promise<T> {
    return this.storageUrlEnricher.enrichFields(post, [
      'featuredImage',
      'featuredVideo',
    ]) as Promise<T>;
  }

  private async loadLinkedProducts(productRefIds: string[]) {
    if (!productRefIds.length) return [];
    const products = await this.productsRepo.findPublishedByRefIds(productRefIds);
    const cards = mapProductEntitiesToPublicCards(products);
    return Promise.all(
      cards.map(async (card) => ({
        ...card,
        primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
      })),
    );
  }

  private async logAudit(
    blogPostId: string,
    entityRefId: string,
    action: BlogAuditAction,
    performedBy: string,
    details?: Record<string, unknown>,
  ) {
    await this.auditService.log({
      entityType: AuditEntityType.BLOG_POST,
      entityId: blogPostId,
      entityRefId,
      action,
      performedBy,
      details: details ?? null,
    });
  }

  private async invalidateHomepageHealthReadsCache(): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.healthReadsPattern(),
        CacheKeys.homepage.sectionsPattern(),
      ],
    });
  }
}
