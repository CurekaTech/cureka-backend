import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductHealthConcernEntity } from '../entities/product-health-concern.entity';
import { ProductWellnessGoalEntity } from '../entities/product-wellness-goal.entity';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductTagMappingEntity } from '../entities/product-tag-mapping.entity';
import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';
import { ProductBundleEntity } from '../entities/product-bundle.entity';
import { ProductFaqEntity } from '../entities/product-faq.entity';
import { ProductAttributeMappingEntity } from '../entities/product-attribute-mapping.entity';
import { CreateProductMediaDto } from '../dto/variant.dto';
import { CustomProductFaqDto } from '../dto/product-support.dto';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { generateTagSlug } from '../utils/product-slug.util';
import { generateUniqueRefId } from '@packages/common';
import { StorageService } from '@packages/storage';

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
    private readonly storageService: StorageService,
  ) {}

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
    await mappingRepository.delete({ productId });
    if (!tagNames.length) return;

    const normalizedNames = tagNames.map((name) => name.trim());
    const slugs = normalizedNames.map((name) => generateTagSlug(name));
    const existingTags = await tagRepository.find({ where: { slug: In(slugs) } });
    const tagsBySlug = new Map(existingTags.map((tag) => [tag.slug, tag]));
    const tagIds: string[] = [];

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
              refId: await generateUniqueRefId(name, async (refId) => {
                return (await tagRepository.count({ where: { refId } })) > 0;
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

    for (const slug of slugs) {
      const tag = tagsBySlug.get(slug);
      if (tag) tagIds.push(tag.id);
    }

    await mappingRepository.save(
      tagIds.map((tagId) => mappingRepository.create({ productId, tagId })),
    );
  }

  async createCustomProductFaqs(
    manager: EntityManager,
    customFaqs: CustomProductFaqDto[],
    createdBy: string,
  ): Promise<string[]> {
    const repo = manager.getRepository(ProductFaqEntity);
    const productFaqIds: string[] = [];

    for (const faq of customFaqs) {
      const saved = await repo.save(
        repo.create({
          question: faq.question.trim(),
          answer: faq.answer.trim(),
          status: ProductFaqStatus.ACTIVE,
          refId: await generateUniqueRefId(faq.question.slice(0, 20), async (refId) => {
            return (await repo.count({ where: { refId } })) > 0;
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
    if (!productFaqIds.length) return;
    await repo.save(
      productFaqIds.map((productFaqId) => repo.create({ productId, productFaqId })),
    );
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

  async createMedia(
    manager: EntityManager,
    productId: string,
    media: CreateProductMediaDto[],
    skuToVariantId: Map<string, string>,
  ): Promise<void> {
    if (!media.length) return;
    const repo = manager.getRepository(ProductMediaEntity);
    await repo.save(
      media.map((item) =>
        repo.create({
          productId,
          variantId: item.variantSku ? (skuToVariantId.get(item.variantSku) ?? null) : null,
          type: item.type,
          url: this.storageService.persistFileReference(item.url!)!,
          sortOrder: item.sortOrder ?? 0,
          isPrimary: item.isPrimary ?? false,
        }),
      ),
    );
  }

  async syncMedia(
    manager: EntityManager,
    productId: string,
    media: CreateProductMediaDto[],
    skuToVariantId: Map<string, string>,
  ): Promise<void> {
    const repo = manager.getRepository(ProductMediaEntity);
    await repo.delete({ productId });
    await this.createMedia(manager, productId, media, skuToVariantId);
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
