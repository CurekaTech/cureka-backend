import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UsersRepository } from '@modules/users/repositories/users.repository';
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

  async loadProductsByIds(productIds: string[]): Promise<Map<string, ISubscriptionProductSummary>> {
    const unique = [...new Set(productIds.filter(Boolean))];
    const map = new Map<string, ISubscriptionProductSummary>();
    if (!unique.length) return map;
    const products = await this.productsRepo.find({
      where: { id: In(unique) },
      select: ['id', 'refId', 'name', 'slug', 'status'],
    });
    for (const product of products) {
      map.set(product.id, {
        id: product.id,
        refId: product.refId,
        name: product.name,
        slug: product.slug,
        status: product.status,
      });
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
