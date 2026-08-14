import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { resolvePrimaryProductImageRef } from '@modules/orders/utils/resolve-primary-product-image.util';
import {
  ISubscriptionProductSummary,
  ISubscriptionUserSummary,
  ISubscriptionVariantSummary,
} from '../interfaces/product-subscription.interface';
import { mapSubscriptionUserSummary } from '../mappers/subscription-relation.mapper';

@Injectable()
export class SubscriptionRelationLoaderService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepo: Repository<ProductVariantEntity>,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async loadUsersByIds(userIds: string[]): Promise<Map<string, ISubscriptionUserSummary>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, ISubscriptionUserSummary>();
    if (!unique.length) return map;
    const users = await this.usersRepository.findByIds(unique);
    for (const user of users) {
      map.set(user.id, mapSubscriptionUserSummary(user));
    }
    return map;
  }

  async loadProductEntitiesByIds(productIds: string[]): Promise<Map<string, ProductEntity>> {
    const unique = [...new Set(productIds.filter(Boolean))];
    const map = new Map<string, ProductEntity>();
    if (!unique.length) return map;
    const products = await this.productsRepo.find({
      where: { id: In(unique) },
      relations: { media: true },
    });
    for (const product of products) {
      map.set(product.id, product);
    }
    return map;
  }

  async resolveProductImageUrl(
    product: ProductEntity | undefined,
    variantId?: string | null,
  ): Promise<string | null> {
    const imageRef = resolvePrimaryProductImageRef(product, variantId ?? '');
    if (!imageRef) return null;
    const primary = await this.storageUrlEnricher.toReference(imageRef);
    return primary?.url ?? null;
  }

  async mapProductSummary(
    product: ProductEntity | undefined,
    variantId?: string | null,
  ): Promise<ISubscriptionProductSummary | null> {
    if (!product) return null;
    const imageUrl = await this.resolveProductImageUrl(product, variantId);
    return {
      id: product.id,
      refId: product.refId,
      name: product.name,
      slug: product.slug,
      status: product.status,
      imageUrl,
      thumbnailUrl: imageUrl,
    };
  }

  async loadProductsByIds(productIds: string[]): Promise<Map<string, ISubscriptionProductSummary>> {
    const entities = await this.loadProductEntitiesByIds(productIds);
    const map = new Map<string, ISubscriptionProductSummary>();
    for (const product of entities.values()) {
      const summary = await this.mapProductSummary(product);
      if (summary) map.set(product.id, summary);
    }
    return map;
  }

  async loadVariantsByIds(variantIds: string[]): Promise<Map<string, ISubscriptionVariantSummary>> {
    const unique = [...new Set(variantIds.filter(Boolean))];
    const map = new Map<string, ISubscriptionVariantSummary>();
    if (!unique.length) return map;
    const variants = await this.variantsRepo.find({
      where: { id: In(unique) },
      select: ['id', 'sku', 'slug', 'displayName', 'sellingPrice', 'mrp', 'status', 'productId'],
    });
    for (const variant of variants) {
      map.set(variant.id, {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        slug: variant.slug,
        displayName: variant.displayName ?? null,
        sellingPrice: String(variant.sellingPrice),
        mrp: String(variant.mrp),
        status: variant.status,
      });
    }
    return map;
  }
}
