import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { mapProductEntitiesToPublicCards } from '@modules/public/mappers/public-product.mapper';
import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { AddWishlistItemDto } from '../dto/wishlist.dto';
import {
  IWishlistIdsResponse,
  IWishlistResponse,
} from '../interfaces/wishlist.interface';
import { WishlistItemsRepository } from '../repositories/wishlist-items.repository';

@Injectable()
export class WishlistService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly wishlistItemsRepository: WishlistItemsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async findAll(userId: string): Promise<IWishlistResponse> {
    const items = await this.wishlistItemsRepository.findAllByUserId(userId);
    const productIds = items.map((item) => item.productId);

    if (!productIds.length) {
      return { items: [] };
    }

    const products = await this.productsRepository.findPublishedByIds(productIds);
    const cards = mapProductEntitiesToPublicCards(products);
    const enriched = await Promise.all(cards.map((card) => this.enrichCard(card)));

    const cardByProductId = new Map(enriched.map((card) => [card.id, card]));
    const orderedItems = productIds
      .map((productId) => cardByProductId.get(productId))
      .filter((card): card is IPublicProductCard => Boolean(card));

    return { items: orderedItems };
  }

  async findProductIds(userId: string): Promise<IWishlistIdsResponse> {
    const productIds = await this.wishlistItemsRepository.findProductIdsByUserId(userId);
    return { productIds };
  }

  async add(userId: string, dto: AddWishlistItemDto): Promise<IWishlistIdsResponse> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.productsRepository.findPublishedById(dto.productId);
      if (!product) {
        throw new NotFoundException(`Product with id "${dto.productId}" not found`);
      }

      const existing = await this.wishlistItemsRepository.findByUserAndProduct(
        userId,
        dto.productId,
        manager,
      );

      if (!existing) {
        const refId = await generateUniqueRefId('wishlist', (candidate) =>
          this.wishlistItemsRepository.existsByRefId(candidate),
        );

        await this.wishlistItemsRepository.create(
          {
            refId,
            userId,
            productId: dto.productId,
            createdBy: userId,
            updatedBy: userId,
          },
          manager,
        );
      }

      const productIds = await this.wishlistItemsRepository.findProductIdsByUserId(userId);
      return { productIds };
    });
  }

  async remove(userId: string, productId: string): Promise<IWishlistIdsResponse> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.wishlistItemsRepository.findByUserAndProduct(
        userId,
        productId,
        manager,
      );

      if (!existing) {
        throw new NotFoundException(`Product with id "${productId}" is not in your wishlist`);
      }

      await this.wishlistItemsRepository.softDeleteByUserAndProduct(userId, productId, manager);

      const productIds = await this.wishlistItemsRepository.findProductIdsByUserId(userId);
      return { productIds };
    });
  }

  private async enrichCard(card: IPublicProductCard): Promise<IPublicProductCard> {
    if (!card.primaryImageUrl) {
      return card;
    }

    return {
      ...card,
      primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
    };
  }
}
