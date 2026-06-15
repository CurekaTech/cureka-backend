import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ProductMediaEntity } from '../entities/product-media.entity';
import { ProductHealthConcernEntity } from '../entities/product-health-concern.entity';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductTagMappingEntity } from '../entities/product-tag-mapping.entity';
import { ProductFaqMappingEntity } from '../entities/product-faq-mapping.entity';
import { ProductBundleEntity } from '../entities/product-bundle.entity';
import { ProductFaqEntity } from '../entities/product-faq.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import { CreateProductMediaDto } from '../dto/variant.dto';
import { generateTagSlug } from '../utils/product-slug.util';
import { generateUniqueRefId } from '@packages/common';

@Injectable()
export class ProductRelationsRepository {
  constructor(
    @InjectRepository(ProductMediaEntity)
    private readonly mediaRepo: Repository<ProductMediaEntity>,
    @InjectRepository(ProductHealthConcernEntity)
    private readonly healthConcernRepo: Repository<ProductHealthConcernEntity>,
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

    const tagIds: string[] = [];
    for (const name of tagNames) {
      const slug = generateTagSlug(name);
      let tag = await tagRepository.findOne({ where: { slug } });
      if (!tag) {
        tag = await tagRepository.save(
          tagRepository.create({
            name: name.trim(),
            slug,
            refId: await generateUniqueRefId(name, async (refId) => {
              return (await tagRepository.count({ where: { refId } })) > 0;
            }),
            createdBy,
          }),
        );
      }
      tagIds.push(tag.id);
    }

    await mappingRepository.save(
      tagIds.map((tagId) => mappingRepository.create({ productId, tagId })),
    );
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
          url: item.url,
          sortOrder: item.sortOrder ?? 0,
          isPrimary: item.isPrimary ?? false,
        }),
      ),
    );
  }

  async replaceMedia(
    manager: EntityManager,
    productId: string,
    media: CreateProductMediaDto[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductMediaEntity);
    await repo.delete({ productId });
    if (!media.length) return;

    const variants = await manager.getRepository(ProductVariantEntity).find({
      where: { productId },
    });
    const skuToVariantId = new Map(variants.map((variant) => [variant.sku, variant.id]));
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
