import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProductEntity } from '../entities/product.entity';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductHealthConcernEntity } from '../entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '../entities/product-wellness-goal.entity';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductTagMappingEntity } from '../entities/product-tag-mapping.entity';
import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';
import { ProductBundleEntity } from '../entities/product-bundle.entity';
import { ProductFaqEntity } from '../entities/product-faq.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { ProductAttributeMappingEntity } from '../entities/product-attribute-mapping.entity';
import { ProductCategoryFilterMappingEntity } from '../entities/product-category-filter-mapping.entity';
import { ProductCategoryHierarchyEntity } from '../entities/product-category-hierarchy.entity';
import { CreateProductMediaDto } from '../dto/variant.dto';
import { CustomProductFaqDto } from '../dto/product-support.dto';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { IVariantInlineFaq } from '../interfaces/variant-details.interface';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { generateTagSlug } from '../utils/product-slug.util';
import { generateUniqueRefId } from '@packages/common';
import { IStorageFileReference, StorageService } from '@packages/storage';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { assertFaqLengths } from '@modules/master/utils/master-faq.util';
import { IResolvedCategoryHierarchy } from '../interfaces/product-creation-context.interface';

/** Canonical slug for homepage / CMS Best Sellers membership. */
export const BEST_SELLERS_TAG_SLUG = 'bestsellers';

@Injectable()
export class ProductRelationsRepository {
  constructor(
    @InjectRepository(ProductMediaEntity)
    private readonly mediaRepo: Repository<ProductMediaEntity>,
    @InjectRepository(ProductHealthConcernEntity)
    private readonly healthConcernRepo: Repository<ProductHealthConcernEntity>,
    @InjectRepository(ProductWellnessGoalEntity)
    private readonly wellnessGoalRepo: Repository<ProductWellnessGoalEntity>,
    @InjectRepository(ProductTagEntity)
    private readonly tagRepo: Repository<ProductTagEntity>,
    @InjectRepository(ProductTagMappingEntity)
    private readonly tagMappingRepo: Repository<ProductTagMappingEntity>,
    @InjectRepository(ProductFaqMappingEntity)
    private readonly faqMappingRepo: Repository<ProductFaqMappingEntity>,
    @InjectRepository(ProductBundleEntity)
    private readonly bundleRepo: Repository<ProductBundleEntity>,
    @InjectRepository(ProductFaqEntity)
    private readonly productFaqRepo: Repository<ProductFaqEntity>,
    @InjectRepository(ProductAttributeMappingEntity)
    private readonly attributeMappingRepo: Repository<ProductAttributeMappingEntity>,
    @InjectRepository(ProductCategoryFilterMappingEntity)
    private readonly categoryFilterMappingRepo: Repository<ProductCategoryFilterMappingEntity>,
    @InjectRepository(ProductCategoryHierarchyEntity)
    private readonly categoryHierarchyRepo: Repository<ProductCategoryHierarchyEntity>,
    private readonly storageService: StorageService,
  ) {}

  async syncCategoryHierarchies(
    manager: EntityManager,
    productId: string,
    hierarchies: IResolvedCategoryHierarchy[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductCategoryHierarchyEntity);
    await repo.delete({ productId });
    if (!hierarchies.length) return;
    await repo.save(
      hierarchies.map((item) =>
        repo.create({
          productId,
          sortOrder: item.sortOrder,
          categoryId: item.categoryId,
          subCategoryId: item.subCategoryId,
          subSubCategoryId: item.subSubCategoryId,
          subSubSubCategoryId: item.subSubSubCategoryId,
        }),
      ),
    );
  }

  async syncHealthConcerns(
    manager: EntityManager,
    productId: string,
    healthConcernIds: string[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductHealthConcernEntity);
    await repo.delete({ productId });
    if (!healthConcernIds.length) return;
    await repo.save(
      healthConcernIds.map((healthConcernId) => repo.create({ productId, healthConcernId })),
    );
  }

  async syncWellnessGoals(
    manager: EntityManager,
    productId: string,
    wellnessGoalIds: string[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductWellnessGoalEntity);
    await repo.delete({ productId });
    if (!wellnessGoalIds.length) return;
    await repo.save(
      wellnessGoalIds.map((wellnessGoalId) => repo.create({ productId, wellnessGoalId })),
    );
  }

  async syncTags(
    manager: EntityManager,
    productId: string,
    tagNames: string[],
    createdBy: string,
  ): Promise<void> {
    const tagRepository = manager.getRepository(ProductTagEntity);
    const mappingRepository = manager.getRepository(ProductTagMappingEntity);
    const productRepository = manager.getRepository(ProductEntity);

    const existingMappings = await mappingRepository.find({
      where: { productId },
      relations: ['tag'],
    });
    const previousSortBySlug = new Map(
      existingMappings
        .filter((mapping) => mapping.tag?.slug)
        .map((mapping) => [mapping.tag.slug, mapping.sortOrder ?? 0]),
    );

    await mappingRepository.delete({ productId });
    if (!tagNames.length) return;

    const normalizedNames = tagNames.map((name) => name.trim()).filter(Boolean);
    const slugs = normalizedNames.map((name) => generateTagSlug(name));
    const existingTags = await tagRepository.find({ where: { slug: In(slugs) } });
    const tagsBySlug = new Map(existingTags.map((tag) => [tag.slug, tag]));

    const tagsToCreate = normalizedNames
      .map((name, index) => ({ name, slug: slugs[index]! }))
      .filter(({ slug }) => !tagsBySlug.has(slug));

    if (tagsToCreate.length) {
      const createdTags = await Promise.all(
        tagsToCreate.map(async ({ name, slug }) =>
          tagRepository.save(
            tagRepository.create({
              name,
              slug,
              status: MasterStatus.ACTIVE,
              refId: await generateUniqueRefId(name, async (candidate) => {
                return (
                  (await tagRepository
                    .createQueryBuilder('tag')
                    .withDeleted()
                    .where('tag.refId = :refId', { refId: candidate })
                    .getCount()) > 0
                );
              }),
              createdBy,
            }),
          ),
        ),
      );
      for (const tag of createdTags) {
        tagsBySlug.set(tag.slug, tag);
      }
    }

    const product = await productRepository.findOne({
      where: { id: productId },
      select: ['id', 'categoryId'],
    });

    const rows: Array<{ productId: string; tagId: string; sortOrder: number }> = [];
    for (const slug of slugs) {
      const tag = tagsBySlug.get(slug);
      if (!tag) continue;

      let sortOrder = previousSortBySlug.get(slug);
      if (sortOrder === undefined) {
        if (slug === BEST_SELLERS_TAG_SLUG && product?.categoryId) {
          sortOrder = await this.getNextBestsellerSortOrder(manager, product.categoryId, tag.id);
        } else {
          sortOrder = 0;
        }
      }

      rows.push({ productId, tagId: tag.id, sortOrder });
    }

    if (rows.length) {
      await mappingRepository.save(rows.map((row) => mappingRepository.create(row)));
    }
  }

  /** Next sort_order for a newly tagged bestseller in a root category (append). */
  private async getNextBestsellerSortOrder(
    manager: EntityManager,
    categoryId: string,
    tagId: string,
  ): Promise<number> {
    const result = await manager
      .getRepository(ProductTagMappingEntity)
      .createQueryBuilder('ptm')
      .innerJoin(ProductEntity, 'product', 'product.id = ptm.productId')
      .select('MAX(ptm.sortOrder)', 'max')
      .where('ptm.tagId = :tagId', { tagId })
      .andWhere('product.categoryId = :categoryId', { categoryId })
      .andWhere('product.deletedAt IS NULL')
      .getRawOne<{ max: string | null }>();

    if (result?.max === null || result?.max === undefined) return 1;
    return parseInt(result.max, 10) + 1;
  }

  async createCustomProductFaqs(
    manager: EntityManager,
    customFaqs: CustomProductFaqDto[],
    createdBy: string,
  ): Promise<string[]> {
    const repo = manager.getRepository(ProductFaqEntity);
    const productFaqIds: string[] = [];

    for (const faq of customFaqs) {
      const question = faq.question.trim();
      const answer = faq.answer.trim();
      assertFaqLengths(question, answer);
      const saved = await repo.save(
        repo.create({
          question,
          answer,
          status: ProductFaqStatus.ACTIVE,
          refId: await generateUniqueRefId(question.slice(0, 20), async (candidate) => {
            return (
              (await repo
                .createQueryBuilder('faq')
                .withDeleted()
                .where('faq.refId = :refId', { refId: candidate })
                .getCount()) > 0
            );
          }),
          createdBy,
        }),
      );
      productFaqIds.push(saved.id);
    }

    return productFaqIds;
  }

  async syncProductFaqs(
    manager: EntityManager,
    productId: string,
    productFaqIds: string[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductFaqMappingEntity);
    await repo.delete({ productId });
    if (productFaqIds.length) {
      await repo.save(
        productFaqIds.map((productFaqId, index) =>
          repo.create({ productId, productFaqId, sortOrder: index }),
        ),
      );
    }
    // Keep every variant's inline FAQs in sync with the product-level set.
    await this.cascadeProductFaqsToVariants(manager, productId);
  }

  /**
   * Overwrite `product_variants.faqs` for all active variants of a product
   * with the current product-level FAQ mappings (question + answer).
   * Empty product FAQ set clears variant overrides so PDP uses product FAQs.
   */
  async cascadeProductFaqsToVariants(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    const mappings = await manager.getRepository(ProductFaqMappingEntity).find({
      where: { productId },
      relations: { productFaq: true },
      order: { sortOrder: 'ASC' },
    });

    const faqs: IVariantInlineFaq[] = mappings
      .filter(
        (mapping) =>
          Boolean(mapping.productFaq) &&
          mapping.productFaq.status === ProductFaqStatus.ACTIVE &&
          !mapping.productFaq.deletedAt,
      )
      .map((mapping) => ({
        question: mapping.productFaq!.question,
        answer: mapping.productFaq!.answer,
        sequence: mapping.sortOrder ?? 0,
      }));

    await manager
      .getRepository(ProductVariantEntity)
      .createQueryBuilder()
      .update(ProductVariantEntity)
      .set({ faqs })
      .where('product_id = :productId', { productId })
      .andWhere('deleted_at IS NULL')
      .execute();
  }

  async syncBundles(
    manager: EntityManager,
    parentProductId: string,
    items: Array<{ childProductId: string; quantity: number }>,
  ): Promise<void> {
    const repo = manager.getRepository(ProductBundleEntity);
    await repo.delete({ parentProductId });
    if (!items.length) return;
    await repo.save(
      items.map((item) =>
        repo.create({
          parentProductId,
          childProductId: item.childProductId,
          quantity: item.quantity,
        }),
      ),
    );
  }

  async syncProductAttributes(
    manager: EntityManager,
    productId: string,
    attributeIds: string[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductAttributeMappingEntity);
    await repo.delete({ productId });
    if (!attributeIds.length) return;
    await repo.save(attributeIds.map((attributeId) => repo.create({ productId, attributeId })));
  }

  async syncCategoryFilters(
    manager: EntityManager,
    productId: string,
    bindings: Array<{ categoryFilterId: string; values: string[] }>,
  ): Promise<void> {
    const repo = manager.getRepository(ProductCategoryFilterMappingEntity);
    await repo.delete({ productId });
    if (!bindings.length) return;

    const rows = bindings.flatMap(({ categoryFilterId, values }) =>
      values.map((value) => repo.create({ productId, categoryFilterId, value })),
    );
    await repo.save(rows);
  }

  /**
   * Build persistable product_media rows. Empty / null / invalid `url` slots are skipped
   * (admin UI often sends placeholder image slots). Never returns a row with null url.
   */
  private buildMediaRows(
    productId: string,
    media: CreateProductMediaDto[],
    skuToVariantId: Map<string, string>,
  ): Array<{
    productId: string;
    variantId: string | null;
    type: ProductMediaType;
    url: IStorageFileReference;
    sortOrder: number;
    isPrimary: boolean;
  }> {
    const rows: Array<{
      productId: string;
      variantId: string | null;
      type: ProductMediaType;
      url: IStorageFileReference;
      sortOrder: number;
      isPrimary: boolean;
    }> = [];

    for (const item of media) {
      const persisted = this.resolvePersistableMediaUrl(item.url);
      if (!persisted) continue;

      rows.push({
        productId,
        variantId:
          item.type === ProductMediaType.COMMON
            ? null
            : item.variantSku
              ? (skuToVariantId.get(item.variantSku) ?? null)
              : null,
        type: item.type,
        url: persisted,
        sortOrder: item.sortOrder ?? 0,
        isPrimary: item.isPrimary ?? false,
      });
    }

    return rows;
  }

  /**
   * Accept storage key string, `{ key, name }`, or enriched `{ key, name, url }`.
   * Reject null / empty / signed-only URLs that cannot be reduced to a key.
   */
  private resolvePersistableMediaUrl(
    raw: CreateProductMediaDto['url'],
  ): IStorageFileReference | null {
    if (raw == null || raw === '') return null;

    if (typeof raw === 'object') {
      const candidate =
        typeof raw.key === 'string' && raw.key.trim()
          ? raw.key.trim()
          : typeof (raw as { url?: unknown }).url === 'string'
            ? String((raw as { url: string }).url).trim()
            : '';
      if (!candidate) return null;
      // Prefer explicit key; otherwise reduce public/signed URLs via StorageService.
      if (typeof raw.key === 'string' && raw.key.trim() && typeof raw.name === 'string' && raw.name.trim()) {
        return this.storageService.persistFileReference({
          key: raw.key.trim(),
          name: raw.name.trim(),
        });
      }
      return this.storageService.persistFileReference(candidate);
    }

    if (typeof raw === 'string') {
      return this.storageService.persistFileReference(raw.trim());
    }

    return null;
  }

  async createMedia(
    manager: EntityManager,
    productId: string,
    media: CreateProductMediaDto[],
    skuToVariantId: Map<string, string>,
  ): Promise<void> {
    const rows = this.buildMediaRows(productId, media, skuToVariantId);
    if (!rows.length) return;
    const repo = manager.getRepository(ProductMediaEntity);
    await repo.save(rows.map((row) => repo.create(row)));
  }

  async syncMedia(
    manager: EntityManager,
    productId: string,
    media: CreateProductMediaDto[],
    skuToVariantId: Map<string, string>,
  ): Promise<void> {
    const rows = this.buildMediaRows(productId, media, skuToVariantId);

    // Admin often sends empty placeholder slots (url: null). Skip those.
    // If every slot was empty/invalid, do not wipe existing images.
    if (media.length > 0 && rows.length === 0) {
      throw new BadRequestException(
        'No valid product media URLs found. Each image needs a storage key ' +
          '(e.g. images/….webp or { key, name }). Empty/null image slots are ignored; ' +
          'send media: [] only when you intentionally want to clear all images.',
      );
    }

    const repo = manager.getRepository(ProductMediaEntity);
    // Hard-replace only after we know what we will insert (or intentional clear via []).
    await repo
      .createQueryBuilder()
      .delete()
      .from(ProductMediaEntity)
      .where('product_id = :productId', { productId })
      .execute();

    if (!rows.length) return;
    await repo.save(rows.map((row) => repo.create(row)));
  }

  async cleanupLegacyManualMediaKeys(
    manager: EntityManager,
    productId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .delete()
      .from(ProductMediaEntity)
      .where('product_id = :productId', { productId })
      .andWhere(
        `(
          (url->>'key') ILIKE :legacyImagePrefix
          OR (url->>'key') ILIKE :legacyVideoPrefix
          OR url::text ILIKE :legacyImageTextPattern
          OR url::text ILIKE :legacyVideoTextPattern
        )`,
        {
          legacyImagePrefix: 'images/products/%',
          legacyVideoPrefix: 'videos/products/%',
          legacyImageTextPattern: '%images/products/%',
          legacyVideoTextPattern: '%videos/products/%',
        },
      )
      .execute();
  }

  async findProductFaqByRefId(refId: string): Promise<ProductFaqEntity | null> {
    return this.productFaqRepo.findOne({ where: { refId } });
  }

  async requireProductFaqByRefId(refId: string): Promise<ProductFaqEntity> {
    const productFaq = await this.findProductFaqByRefId(refId);
    if (!productFaq) {
      throw new NotFoundException(`Product FAQ with refId "${refId}" not found`);
    }
    return productFaq;
  }
}
