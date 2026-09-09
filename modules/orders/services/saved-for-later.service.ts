import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import {
  CART_ITEM_NOT_FOUND,
  SAVE_FOR_LATER_ITEM_NOT_FOUND,
} from '../constants/saved-for-later.constants';
import { SavedForLaterListQueryDto } from '../dto/saved-for-later.dto';
import { SavedForLaterItemEntity } from '../entities/saved-for-later-item.entity';
import {
  MoveSavedItemToCartResponse,
  SaveForLaterFromCartResponse,
  SavedForLaterListItem,
} from '../interfaces/saved-for-later.interface';
import { mapSavedForLaterListItem, resolveSavedPrimaryImageRef } from '../mappers/saved-for-later.mapper';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { SavedForLaterItemsRepository } from '../repositories/saved-for-later-items.repository';
import { CartService } from './cart.service';
import { buildSavedForLaterIdentityKey } from '../utils/saved-for-later-identity.util';

@Injectable()
export class SavedForLaterService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly repository: SavedForLaterItemsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
    private readonly cartService: CartService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async saveFromCart(userId: string, cartItemId: string): Promise<SaveForLaterFromCartResponse> {
    const { savedId, cart } = await this.dataSource.transaction(async (manager) => {
      const cartItem = await this.cartItemsRepository.lockOwnedById(userId, cartItemId, manager);
      if (!cartItem) {
        throw new NotFoundException({
          code: CART_ITEM_NOT_FOUND,
          message: 'Cart item not found',
        });
      }

      const isSubscription = !!cartItem.isSubscription;
      const frequency = isSubscription ? cartItem.frequency ?? null : null;
      const identityKey = buildSavedForLaterIdentityKey(
        cartItem.variantId,
        isSubscription,
        frequency,
      );

      const existing = await this.repository.lockByUserAndIdentity(userId, identityKey, manager);
      let savedId: string;
      if (existing) {
        await this.repository.updateById(
          existing.id,
          {
            quantity: existing.quantity + cartItem.quantity,
            updatedBy: userId,
          },
          manager,
        );
        savedId = existing.id;
      } else {
        const refId = await generateUniqueRefId('sfl', (candidate) =>
          this.repository.existsByRefId(candidate),
        );
        const created = await this.repository.create(
          {
            refId,
            userId,
            productId: cartItem.productId,
            variantId: cartItem.variantId,
            quantity: cartItem.quantity,
            isSubscription,
            frequency,
            identityKey,
            createdBy: userId,
            updatedBy: userId,
          },
          manager,
        );
        savedId = created.id;
      }

      await this.cartItemsRepository.deleteById(cartItem.id, manager);
      const cart = await this.cartService.getCart(userId, manager);
      return { savedId, cart };
    });

    const saved = await this.repository.findByIdForUser(savedId, userId);
    if (!saved) {
      throw new NotFoundException({
        code: SAVE_FOR_LATER_ITEM_NOT_FOUND,
        message: 'Saved item not found',
      });
    }
    return { savedItem: await this.mapOne(saved), cart };
  }

  async list(
    userId: string,
    query: SavedForLaterListQueryDto,
  ): Promise<PaginatedResult<SavedForLaterListItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.repository.findAllPaginated(userId, pagination);
    const items = await Promise.all(data.map((entity) => this.mapOne(entity)));
    return buildPaginatedResult(items, total, pagination);
  }

  async count(userId: string): Promise<{ count: number }> {
    return { count: await this.repository.countByUserId(userId) };
  }

  async moveToCart(userId: string, savedItemId: string): Promise<MoveSavedItemToCartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const saved = await this.repository.lockByIdForUser(savedItemId, userId, manager);
      if (!saved) {
        throw new NotFoundException({
          code: SAVE_FOR_LATER_ITEM_NOT_FOUND,
          message: 'Saved item not found',
        });
      }

      const cart = await this.cartService.addItemInTransaction(
        userId,
        {
          productId: saved.productId,
          variantId: saved.variantId,
          quantity: saved.quantity,
          isSubscription: saved.isSubscription,
          frequency: saved.frequency,
        },
        manager,
      );

      await this.repository.deleteById(saved.id, manager);
      return { cart };
    });
  }

  async remove(userId: string, savedItemId: string): Promise<{ count: number }> {
    const existing = await this.repository.findByIdForUser(savedItemId, userId);
    if (!existing) {
      throw new NotFoundException({
        code: SAVE_FOR_LATER_ITEM_NOT_FOUND,
        message: 'Saved item not found',
      });
    }
    await this.repository.deleteById(existing.id);
    return this.count(userId);
  }

  private async mapOne(entity: SavedForLaterItemEntity): Promise<SavedForLaterListItem> {
    const image = await this.storageUrlEnricher.toReference(
      resolveSavedPrimaryImageRef(entity.product, entity.variantId),
    );
    return mapSavedForLaterListItem(entity, image);
  }
}
