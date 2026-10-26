import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { CartLineItem, CartResponse } from '../interfaces/cart-pricing.interface';
import {
  CartRecoverySnapshotEntity,
  CartRecoverySnapshotItem,
} from '../entities/cart-recovery-snapshot.entity';
import { CartRecoverySnapshotsRepository } from '../repositories/cart-recovery-snapshots.repository';
import { CartService } from './cart.service';

export const CART_RECOVERY_TTL_MS = 7 * 24 * 60 * 60_000;

export type CartRecoveryResult = {
  cart: CartResponse;
  addedItems: number;
  skippedItems: Array<{
    productId: string;
    variantId: string;
    productName: string;
    reason: string;
  }>;
};

@Injectable()
export class CartRecoveryService {
  constructor(
    private readonly snapshots: CartRecoverySnapshotsRepository,
    private readonly cartService: CartService,
  ) {}

  async createSnapshot(params: {
    cartId: string;
    checkoutId: string;
    items: CartLineItem[];
    createdBy?: string;
  }): Promise<CartRecoverySnapshotEntity> {
    const items: CartRecoverySnapshotItem[] = params.items
      .filter((item) => item.quantity > 0 && item.productId && item.variantId)
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        productName: item.productName,
        sku: item.sku ?? '',
      }));
    if (!items.length) {
      throw new BadRequestException('Cannot create a recovery snapshot for an empty cart');
    }
    return this.snapshots.create({
      token: randomBytes(16).toString('base64url'),
      cartId: params.cartId,
      checkoutId: params.checkoutId,
      items,
      expiresAt: new Date(Date.now() + CART_RECOVERY_TTL_MS),
      createdBy: params.createdBy ?? 'bob-abandoned-cart',
    });
  }

  recoverUrl(storefrontUrl: string, token: string): string {
    const base = storefrontUrl.replace(/\/+$/, '') || 'https://www.cureka.com';
    return `${base}/cart/recover?token=${encodeURIComponent(token)}`;
  }

  async recoverForUser(userId: string, token: string): Promise<CartRecoveryResult> {
    const snapshot = await this.snapshots.findByToken(token.trim());
    if (!snapshot || snapshot.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'This cart recovery link is invalid or has expired. Your cart may be empty.',
      );
    }

    const skippedItems: CartRecoveryResult['skippedItems'] = [];
    let addedItems = 0;
    for (const item of snapshot.items) {
      try {
        await this.cartService.addItem(userId, {
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
        });
        addedItems += 1;
      } catch (error) {
        if (error instanceof BadRequestException) {
          skippedItems.push({
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            reason: error.message,
          });
          continue;
        }
        throw error;
      }
    }

    await this.snapshots.markRestored(snapshot.id);
    const cart = await this.cartService.getCart(userId);
    return { cart, addedItems, skippedItems };
  }
}
