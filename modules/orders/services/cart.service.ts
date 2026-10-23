import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, In } from 'typeorm';
import { generateUniqueRefId, getSalableStockQuantity, isVariantInStock, STOCK_VALIDATION_ENABLED } from '@packages/common';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductBundleEntity } from '@modules/product/entities/product-bundle.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { deriveBundleCodAvailable } from '@modules/product/utils/bundle-cod.util';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductSubscriptionConfigService } from '@modules/subscription/services/product-subscription-config.service';
import { isSubscriptionsModuleEnabled } from '@modules/subscription/utils/subscriptions-module.util';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { CheckoutResolverService } from '@modules/checkout/services/checkout-resolver.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { buildProductLocPath } from '@modules/sitemap/services/sitemap-url.builder';
import { AddCartItemDto, ApplyCouponDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartEntity } from '../entities/cart.entity';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';
import { CartLineItem, CartResponse } from '../interfaces/cart-pricing.interface';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';
import { SavedForLaterItemsRepository } from '../repositories/saved-for-later-items.repository';
import { CartCheckoutAdminSettingsService } from './cart-checkout-admin-settings.service';
import { PromotionalOfferEvaluationService } from '@modules/promotional-offers/services/promotional-offer-evaluation.service';
import { isPromotionalOffersEnabled } from '@modules/promotional-offers/utils/promotional-offers-enabled.util';
import { normalizeCheckoutCode } from '@modules/promotional-offers/utils/checkout-code-namespace.util';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { CartPricingService } from './cart-pricing.service';
import { CouponCheckoutService } from './coupon-checkout.service';
import { CodBlocklistService } from '@modules/cod-blocklist/services/cod-blocklist.service';

const EMPTY_CART_BASE = {
  cartId: '',
  items: [],
  totalItems: 0,
  subtotal: 0,
  coupon: null,
  discountAmount: 0,
  shippingAmount: 0,
  handlingAmount: 0,
  platformFee: 0,
  codCharge: 0,
  prepaidDiscount: 0,
  grandTotal: 0,
  promotionDiscount: 0,
  bmsmDiscount: 0,
  rewardCharged: 0,
  promotions: [],
  promotionWarnings: [],
  rewardLines: [],
  lineAllocations: [],
};

@Injectable()
export class CartService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartsRepository: CartsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly cartPricingService: CartPricingService,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
    private readonly productSubscriptionConfigService: ProductSubscriptionConfigService,
    private readonly codBlocklistService: CodBlocklistService,
    private readonly savedForLaterItemsRepository: SavedForLaterItemsRepository,
    private readonly configService: ConfigService,
    private readonly checkoutResolver: CheckoutResolverService,
    private readonly promotionalOffers: PromotionalOfferEvaluationService,
    private readonly couponsRepository: CouponsRepository,
  ) { }

  async nativePromotionalOffersEnabled(): Promise<boolean> {
    return (await this.checkoutResolver.resolveProvider()) === 'legacy';
  }

  private async buildEmptyCartResponse(userId?: string): Promise<CartResponse> {
    const amounts = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    const checkoutRules = {
      prepaidDiscountPercent:
        this.cartCheckoutAdminSettingsService.getPrepaidDiscountPercent(amounts),
      codMinOrderAmount:
        this.cartCheckoutAdminSettingsService.getCodMinOrderAmount(amounts),
      codMaxOrderAmount:
        this.cartCheckoutAdminSettingsService.getCodMaxOrderAmount(amounts),
    };
    return {
      ...EMPTY_CART_BASE,
      checkoutRules,
      cod: await this.codBlocklistService.overlayNativeCodEligibility(
        this.cartCheckoutAdminSettingsService.resolveCodEligibility(0, amounts),
        { customerId: userId },
      ),
    };
  }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      return this.addItemInTransaction(userId, dto, manager);
    });
  }

  /**
   * Same validation/merge as add-to-cart, for callers that already hold a transaction
   * (Save for Later move-to-cart).
   */
  async addItemInTransaction(
    userId: string,
    dto: {
      productId: string;
      variantId: string;
      quantity: number;
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    },
    manager: EntityManager,
  ): Promise<CartResponse> {
    const cart = await this.getOrCreateActiveCart(userId, manager);
    await this.addOrIncrementItem(userId, cart.id, dto, manager);
    return this.getCart(userId, manager);
  }

  /**
   * Add multiple lines to the active cart in one transaction (used by reorder).
   * Unavailable / out-of-stock items are skipped rather than failing the whole request.
   */
  async addItems(
    userId: string,
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      productName?: string;
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    }>,
  ): Promise<{
    cart: CartResponse;
    addedItems: number;
    skippedItems: Array<{
      productId: string;
      variantId: string;
      productName: string;
      reason: string;
    }>;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateActiveCart(userId, manager);
      const skippedItems: Array<{
        productId: string;
        variantId: string;
        productName: string;
        reason: string;
      }> = [];
      let addedItems = 0;

      for (const item of items) {
        try {
          await this.addOrIncrementItem(userId, cart.id, item, manager);
          addedItems += 1;
        } catch (error) {
          if (error instanceof BadRequestException) {
            skippedItems.push({
              productId: item.productId,
              variantId: item.variantId,
              productName: item.productName ?? '',
              reason: error.message,
            });
            continue;
          }
          throw error;
        }
      }

      if (addedItems === 0) {
        throw new BadRequestException(
          'None of the items from this order are available to reorder',
        );
      }

      const cartResponse = await this.getCart(userId, manager);
      return { cart: cartResponse, addedItems, skippedItems };
    });
  }

  async getCart(
    userId: string,
    manager = this.dataSource.manager,
    options?: { paymentMethod?: OrderPaymentMethod },
  ): Promise<CartResponse> {
    const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
    if (!cart) {
      return this.buildEmptyCartResponse(userId);
    }

    return this.toCartResponse(cart, userId, manager, {
      clearInvalidCoupon: true,
      paymentMethod: options?.paymentMethod,
      applyPromotionalOffers: await this.nativePromotionalOffersEnabled(),
    });
  }

  /**
   * Load an active cart by primary key (used by GoKwik merchantCheckoutId / cart_id).
   */
  async getCartById(
    cartId: string,
    manager = this.dataSource.manager,
    options?: { paymentMethod?: OrderPaymentMethod },
  ): Promise<CartResponse> {
    const cart = await this.cartsRepository.findActiveById(cartId, manager);
    if (!cart) {
      throw new BadRequestException('Invalid cart id');
    }

    return this.toCartResponse(cart, cart.userId, manager, {
      clearInvalidCoupon: true,
      paymentMethod: options?.paymentMethod,
    });
  }

  /** Cart snapshot for admin views — does not clear an invalid coupon. */
  async getCartResponseSnapshot(cart: CartEntity): Promise<CartResponse> {
    return this.toCartResponse(cart, cart.userId, this.dataSource.manager, {
      clearInvalidCoupon: false,
    });
  }

  /** Same pricing as checkout/detail (grand total), without signing product images. */
  async getCartGrandTotal(cart: CartEntity): Promise<number> {
    const items = await this.buildLineItems(cart, { skipImages: true });
    const pricing = await this.cartPricingService.calculateCartPricing({
      userId: cart.userId,
      cartId: cart.id,
      couponId: cart.couponId,
      promotionalOfferId: cart.promotionalOfferId,
      selectedCode: cart.selectedCode,
      items,
      manager: this.dataSource.manager,
      clearInvalidCoupon: false,
    });
    return pricing.grandTotal;
  }

  /**
   * Remove unavailable / zero-stock lines and clamp quantities to salable stock.
   * Used by GoKwik remove-out-of-stock-items.
   */
  async removeOutOfStockItemsByCartId(cartId: string): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveById(cartId, manager);
      if (!cart) {
        throw new BadRequestException('Invalid cart id');
      }

      if (!STOCK_VALIDATION_ENABLED()) {
        // Still drop OOS-flagged / inactive lines even when qty validation is off.
        const lineItems = await this.buildLineItems(cart);
        for (const item of lineItems) {
          if (!item.isAvailable || !item.inStock) {
            await this.cartItemsRepository.deleteById(item.id, manager);
          }
        }
        const refreshed = await this.cartsRepository.findActiveById(cartId, manager);
        if (!refreshed) {
          throw new BadRequestException('Invalid cart id');
        }
        return this.toCartResponse(refreshed, refreshed.userId, manager, {
          clearInvalidCoupon: true,
        });
      }

      const lineItems = await this.buildLineItems(cart);

      for (const item of lineItems) {
        const outOfStock = !item.isAvailable || !item.inStock;
        if (outOfStock) {
          await this.cartItemsRepository.deleteById(item.id, manager);
          continue;
        }

        if (item.quantity > item.stock) {
          await this.cartItemsRepository.updateById(
            item.id,
            { quantity: item.stock, updatedBy: cart.userId },
            manager,
          );
        }
      }

      const refreshed = await this.cartsRepository.findActiveById(cartId, manager);
      if (!refreshed) {
        throw new BadRequestException('Invalid cart id');
      }

      return this.toCartResponse(refreshed, cart.userId, manager, { clearInvalidCoupon: true });
    });
  }

  async applyCoupon(
    userId: string,
    dto: ApplyCouponDto,
    options?: { applyPromotionalOffers?: boolean },
  ): Promise<CartResponse> {
    return this.applyCode(userId, dto.couponCode, options);
  }

  async applyCode(
    userId: string,
    rawCode: string,
    options?: { applyPromotionalOffers?: boolean },
  ): Promise<CartResponse> {
    const code = normalizeCheckoutCode(rawCode);
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');
      if (!cart.items?.length) throw new BadRequestException('Cart is empty');
      if (cart.selectedCode && normalizeCheckoutCode(cart.selectedCode) === code) {
        return this.toCartResponse(cart, userId, manager, {
          applyPromotionalOffers: options?.applyPromotionalOffers === true,
          clearInvalidCoupon: true,
        });
      }

      const [coupon, offer] = await Promise.all([
        this.couponCheckoutService.findByCode(code),
        this.promotionalOffers.findOfferByCode(code),
      ]);
      if (coupon && offer) {
        throw new ConflictException(`Code "${code}" is ambiguous`);
      }
      if (!coupon && !offer) {
        throw new NotFoundException(`Code "${code}" was not found`);
      }

      const lineItems = await this.buildLineItems(cart);
      const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const native = options?.applyPromotionalOffers === true;

      if (offer) {
        if (!isPromotionalOffersEnabled(this.configService)) {
          throw new BadRequestException('Promotional offers are turned off');
        }
        if (!native) {
          throw new BadRequestException('Promotional offers apply on native checkout only');
        }
        const preview = await this.promotionalOffers.evaluateForCart({
          userId,
          customerSubtotal: subtotal,
          offerId: offer.id,
          lines: lineItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            sku: item.sku,
            productName: item.productName,
            variantLabel: item.variantLabel,
            isSubscription: item.isSubscription,
            productType: null,
          })),
        });
        const applied = preview.promotions.length > 0 || preview.rewardLines.length > 0 || preview.bmsmDiscount > 0;
        if (!applied) {
          throw new BadRequestException(preview.warnings[0]?.message ?? 'This offer is not eligible for the cart');
        }
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: null, promotionalOfferId: offer.id, selectedCode: code, updatedBy: userId },
          manager,
        );
      } else if (coupon) {
        await this.couponCheckoutService.validateCoupon(coupon, {
          userId,
          subtotal,
          items: lineItems,
          manager,
        });
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: coupon.id, promotionalOfferId: null, selectedCode: code, updatedBy: userId },
          manager,
        );
      }

      const refreshed = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!refreshed) throw new BadRequestException('Cart not found');
      return this.toCartResponse(refreshed, userId, manager, {
        applyPromotionalOffers: native,
        clearInvalidCoupon: true,
      });
    });
  }

  async listOffers(userId: string): Promise<{
    offers: Array<{
      code: string;
      sourceType: 'coupon' | 'promotional_offer';
      id: string;
      title: string;
      description: string;
      estimatedBenefit: number;
      conditions: string;
      expiresAt: Date | null;
      selected: boolean;
      applicable: boolean;
    }>;
  }> {
    const cart = await this.cartsRepository.findActiveByUserId(userId);
    if (!cart) return { offers: [] };
    const lineItems = await this.buildLineItems(cart, { skipImages: true });
    const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const rows: Array<{
      code: string;
      sourceType: 'coupon' | 'promotional_offer';
      id: string;
      title: string;
      description: string;
      estimatedBenefit: number;
      conditions: string;
      expiresAt: Date | null;
      selected: boolean;
      applicable: boolean;
    }> = [];
    const coupons = await this.couponsRepository.findAllActiveValid();
    for (const coupon of coupons) {
      try {
        await this.couponCheckoutService.validateCoupon(coupon, { userId, subtotal, items: lineItems });
        const eligible = this.couponCheckoutService.getDiscountSubtotal(coupon, { userId, subtotal, items: lineItems });
        rows.push({
          code: coupon.code,
          sourceType: 'coupon',
          id: coupon.id,
          title: coupon.title,
          description: coupon.title,
          estimatedBenefit: this.couponCheckoutService.calculateDiscount(coupon, eligible),
          conditions: `Minimum purchase ${Number(coupon.minPurchase).toFixed(2)}`,
          expiresAt: coupon.expiryDate,
          selected: cart.couponId === coupon.id,
          applicable: true,
        });
      } catch {
        continue;
      }
    }
    if (isPromotionalOffersEnabled(this.configService)) {
      const offers = await this.promotionalOffers.listLiveOffers();
      for (const offer of offers) {
        if (!offer.code) continue;
        const preview = await this.promotionalOffers.evaluateForCart({
          userId,
          customerSubtotal: subtotal,
          offerId: offer.id,
          lines: lineItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            sku: item.sku,
            productName: item.productName,
            variantLabel: item.variantLabel,
            isSubscription: item.isSubscription,
            productType: null,
          })),
        });
        const benefit = preview.promotionDiscount || preview.bmsmDiscount || preview.promotions[0]?.discountAmount || 0;
        const applied = preview.promotions.length > 0 || preview.rewardLines.length > 0 || preview.bmsmDiscount > 0;
        const cartHasTarget = (offer.targets ?? []).some((target) =>
          lineItems.some((item) => item.variantId === target.variantId && !item.isSubscription),
        );
        const selected =
          cart.promotionalOfferId === offer.id ||
          (!!cart.selectedCode &&
            !!offer.code &&
            normalizeCheckoutCode(cart.selectedCode) === normalizeCheckoutCode(offer.code));
        const warning = preview.warnings[0];
        if (!applied && !cartHasTarget && !selected) continue;
        rows.push({
          code: offer.code,
          sourceType: 'promotional_offer',
          id: offer.id,
          title: offer.name,
          description: offer.customerMessage,
          estimatedBenefit: applied ? benefit : 0,
          conditions: applied
            ? offer.customerMessage
            : warning?.message ?? 'This offer cannot be applied to the cart right now.',
          expiresAt: offer.expiryDate,
          selected,
          applicable: applied,
        });
      }
    }
    return { offers: rows };
  }

  async removeCoupon(userId: string, options?: { applyPromotionalOffers?: boolean }): Promise<CartResponse> {
    return this.removeCode(userId, options);
  }

  async removeCode(userId: string, options?: { applyPromotionalOffers?: boolean }): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) {
        return this.buildEmptyCartResponse(userId);
      }

      if (cart.couponId || cart.promotionalOfferId || cart.selectedCode) {
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: null, promotionalOfferId: null, selectedCode: null, updatedBy: userId },
          manager,
        );
      }

      const refreshed = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!refreshed) {
        return this.buildEmptyCartResponse(userId);
      }
      return this.toCartResponse(refreshed, userId, manager, {
        applyPromotionalOffers: options?.applyPromotionalOffers === true,
        clearInvalidCoupon: true,
      });
    });
  }

  async updateQuantity(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new NotFoundException('Active cart not found');
      const item = cart.items.find((x) => x.id === itemId);
      if (!item) throw new NotFoundException(`Cart item ${itemId} not found`);

      const variant = await this.getValidVariant(item.productId, item.variantId, manager);
      this.assertStockAvailable(dto.quantity, variant);

      await this.cartItemsRepository.updateById(itemId, { quantity: dto.quantity }, manager);
      await this.cartsRepository.touchCustomerActivity(cart.id, userId, manager);
      return this.getCart(userId, manager);
    });
  }

  async removeItem(userId: string, itemId: string): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new NotFoundException('Active cart not found');
      const item = cart.items.find((x) => x.id === itemId);
      if (!item) throw new NotFoundException(`Cart item ${itemId} not found`);

      await this.cartItemsRepository.deleteById(itemId, manager);
      await this.cartsRepository.touchCustomerActivity(cart.id, userId, manager);
      return this.getCart(userId, manager);
    });
  }

  async clear(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) return;
      await this.cartItemsRepository.clearByCartId(cart.id, manager);
      await this.cartsRepository.touchCustomerActivity(cart.id, userId, manager);
      await this.cartsRepository.updateById(
        cart.id,
        {
          couponId: null,
          promotionalOfferId: null,
          selectedCode: null,
          orderSource: null,
          updatedBy: userId,
        },
        manager,
      );
    });
  }

  /**
   * Remember App/Website from validate so place-order / payment checkout can omit it.
   */
  async setPreferredOrderSource(userId: string, orderSource: OrderSource): Promise<void> {
    const cart = await this.cartsRepository.findActiveByUserId(userId);
    if (!cart) return;
    if (cart.orderSource === orderSource) return;
    await this.cartsRepository.updateById(cart.id, {
      orderSource,
      updatedBy: userId,
    });
  }

  async getActiveCartEntity(userId: string, manager = this.dataSource.manager): Promise<CartEntity | null> {
    return this.cartsRepository.findActiveByUserId(userId, manager);
  }

  async touchCustomerActivity(
    cartId: string,
    userId: string,
    manager = this.dataSource.manager,
  ): Promise<void> {
    await this.cartsRepository.touchCustomerActivity(cartId, userId, manager);
  }

  /**
   * Resolve an active cart by id for merchant callbacks (e.g. GoKwik).
   * Returns null when the cart is missing or inactive.
   */
  async findActiveCartById(cartId: string, manager = this.dataSource.manager): Promise<CartEntity | null> {
    return this.cartsRepository.findActiveById(cartId, manager);
  }

  async findCartById(cartId: string, manager = this.dataSource.manager): Promise<CartEntity | null> {
    return this.cartsRepository.findById(cartId, manager);
  }

  async mergeGuestCartIntoUser(fromUserId: string, toUserId: string): Promise<void> {
    if (fromUserId === toUserId) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const guestCart = await this.cartsRepository.findActiveByUserId(fromUserId, manager);

      if (guestCart?.items?.length) {
        const targetCart = await this.getOrCreateActiveCart(toUserId, manager);

        for (const item of guestCart.items) {
          const variant = await this.getValidVariant(item.productId, item.variantId, manager);
          const isSubscription = !!item.isSubscription;
          const frequency = isSubscription ? item.frequency ?? null : null;
          const existingLines = await this.cartItemsRepository.findAllByCartAndVariant(
            targetCart.id,
            item.variantId,
            manager,
          );
          const existing = existingLines.find(
            (line) =>
              line.isSubscription === isSubscription && (line.frequency ?? null) === frequency,
          );

          if (existing) {
            const nextQty = existing.quantity + item.quantity;
            this.assertStockAvailable(nextQty, variant);
            await this.cartItemsRepository.updateById(
              existing.id,
              { quantity: nextQty, updatedBy: toUserId },
              manager,
            );
          } else if (existingLines[0]) {
            // One row per variant. A one-time guest line must clear isSubscription
            // or the later GoKwik checkout rejects the whole cart.
            const opposite = existingLines[0];
            const nextQty = opposite.quantity + item.quantity;
            this.assertStockAvailable(nextQty, variant);
            await this.cartItemsRepository.updateById(
              opposite.id,
              {
                quantity: nextQty,
                isSubscription,
                frequency,
                updatedBy: toUserId,
              },
              manager,
            );
          } else {
            const refId = await generateUniqueRefId('cart-item', (candidate) =>
              this.cartItemsRepository.existsByRefId(candidate),
            );
            await this.cartItemsRepository.create(
              {
                refId,
                cartId: targetCart.id,
                productId: item.productId,
                variantId: item.variantId,
                quantity: item.quantity,
                isSubscription,
                frequency,
                createdBy: toUserId,
                updatedBy: toUserId,
              },
              manager,
            );
          }
        }

        await this.cartsRepository.touchCustomerActivity(targetCart.id, toUserId, manager);

        if (!targetCart.couponId && !targetCart.promotionalOfferId && (guestCart.couponId || guestCart.promotionalOfferId)) {
          await this.cartsRepository.updateById(
            targetCart.id,
            {
              couponId: guestCart.couponId,
              promotionalOfferId: guestCart.promotionalOfferId,
              selectedCode: guestCart.selectedCode,
              updatedBy: toUserId,
            },
            manager,
          );
        }

        await this.cartItemsRepository.clearByCartId(guestCart.id, manager);
        await this.cartsRepository.updateById(
          guestCart.id,
          { isActive: false, couponId: null, promotionalOfferId: null, selectedCode: null, updatedBy: toUserId },
          manager,
        );
      }

      await this.mergeGuestSavedForLater(fromUserId, toUserId, manager);
    });
  }

  private async mergeGuestSavedForLater(
    fromUserId: string,
    toUserId: string,
    manager: EntityManager,
  ): Promise<void> {
    const guestItems = await this.savedForLaterItemsRepository.findAllByUserId(fromUserId, manager);
    for (const item of guestItems) {
      const existing = await this.savedForLaterItemsRepository.lockByUserAndIdentity(
        toUserId,
        item.identityKey,
        manager,
      );
      if (existing) {
        await this.savedForLaterItemsRepository.updateById(
          existing.id,
          { quantity: existing.quantity + item.quantity, updatedBy: toUserId },
          manager,
        );
        await this.savedForLaterItemsRepository.deleteById(item.id, manager);
      } else {
        await this.savedForLaterItemsRepository.updateById(
          item.id,
          { userId: toUserId, updatedBy: toUserId },
          manager,
        );
      }
    }
  }

  async getOrCreateActiveCart(userId: string, manager = this.dataSource.manager): Promise<CartEntity> {
    const existing = await this.cartsRepository.findActiveByUserId(userId, manager);
    if (existing) return existing;

    const refId = await generateUniqueRefId('cart', (candidate) => this.cartsRepository.existsByRefId(candidate));
    return this.cartsRepository.create(
      {
        refId,
        userId,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
      manager,
    );
  }

  private async toCartResponse(
    cart: CartEntity,
    userId: string,
    manager = this.dataSource.manager,
    options?: { clearInvalidCoupon?: boolean; paymentMethod?: OrderPaymentMethod; applyPromotionalOffers?: boolean },
  ): Promise<CartResponse> {
    const items = await this.buildLineItems(cart);
    const pricing = await this.cartPricingService.calculateCartPricing({
      userId,
      cartId: cart.id,
      couponId: cart.couponId,
      promotionalOfferId: cart.promotionalOfferId,
      selectedCode: cart.selectedCode,
      items,
      paymentMethod: options?.paymentMethod,
      manager,
      clearInvalidCoupon: options?.clearInvalidCoupon ?? false,
      applyPromotionalOffers: options?.applyPromotionalOffers === true,
    });

    const allocationByLine = new Map((pricing.lineAllocations ?? []).map((row) => [row.lineId, row]));
    const pricedItems = items.map((item) => {
      const allocation = allocationByLine.get(item.id);
      return {
        ...item,
        promotionDiscount: allocation?.promotionDiscount ?? 0,
        promotionOfferId: allocation?.promotionOfferId ?? null,
      };
    });
    const pricedItemsWithMessages = pricedItems.map((item) => ({
      ...item,
      promotionalMessages: [] as string[],
    }));
    const rewardLines = await this.enrichRewardLines(pricing.rewardLines ?? []);

    return {
      cartId: cart.id,
      items: pricedItemsWithMessages,
      totalItems:
        pricedItemsWithMessages.reduce((sum, item) => sum + item.quantity, 0) +
        rewardLines.reduce((sum, item) => sum + item.quantity, 0),
      ...pricing,
      rewardLines,
      promotionNotices: [],
    };
  }

  private async buildLineItems(
    cart: CartEntity,
    options?: { skipImages?: boolean },
  ): Promise<CartLineItem[]> {
    const lines = await Promise.all(
      (cart.items ?? []).map(async (item): Promise<CartLineItem> => {
        const variant = item.variant ?? undefined;
        const product = item.product as ProductEntity | undefined;
        const unitPrice = variant ? parseFloat(variant.sellingPrice) : 0;
        const mrpRaw = variant?.mrp != null ? parseFloat(String(variant.mrp)) : NaN;
        const mrp = Number.isFinite(mrpRaw) ? mrpRaw : null;
        const imageRef = this.resolvePrimaryImageRef(product, item.variantId);
        const primaryImageUrl = options?.skipImages
          ? null
          : await this.storageUrlEnricher.toReference(imageRef);

        const isAvailable =
          variant?.status === VariantStatus.ACTIVE &&
          product?.status === ProductStatus.PUBLISHED &&
          !(variant?.outOfStock === true);
        const rawStock = variant?.stock ?? 0;
        const stock = getSalableStockQuantity(rawStock, item.quantity, variant);

        const variantSlug = variant?.slug?.trim() ?? '';
        const productSlug = product?.slug?.trim() ?? '';
        const productPageUrl = variant?.productPageUrl?.trim() || null;

        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productSlug: product?.slug?.trim() || null,
          // Prefer configured storefront URLs. Category-tree permalinks can be stale
          // (308 to a different path); /shop/{slug} is a safe fallback BOB already accepted.
          productPagePath:
            buildProductLocPath({
              slug: product?.slug,
              productPageUrl: variant?.productPageUrl,
              singleProductUrl: product?.singleProductUrl,
              categorySlugPath: [],
            }) ?? null,
          productName: this.resolveCartProductName(product, variant),
          slug: variantSlug || productSlug,
          productPageUrl,
          sku: variant?.sku ?? '',
          variantLabel: this.formatVariantLabel(variant),
          quantity: item.quantity,
          unitPrice,
          mrp,
          totalPrice: unitPrice * item.quantity,
          stock,
          inStock: isAvailable && isVariantInStock(rawStock, variant),
          isAvailable,
          codAvailable: !!variant?.codAvailable,
          primaryImageUrl,
          productDetails: this.buildProductDetails(variant),
          categoryId: product?.categoryId ?? '',
          subCategoryId: product?.subCategoryId ?? null,
          subSubCategoryId: product?.subSubCategoryId ?? null,
          subSubSubCategoryId: product?.subSubSubCategoryId ?? null,
          brandId: product?.brandId ?? null,
          isSubscription: !!item.isSubscription,
          frequency: item.frequency ?? null,
          lineType: item.isSubscription ? 'SUBSCRIPTION' : 'ONE_TIME',
        };
      }),
    );
    return this.applyBundleCod(cart, lines);
  }

  /** Bundle cart lines use every child variant. Simple lines keep variant.codAvailable. */
  private async applyBundleCod(cart: CartEntity, lines: CartLineItem[]): Promise<CartLineItem[]> {
    const bundleProductIds = [
      ...new Set(
        (cart.items ?? [])
          .filter((item) => item.product?.productType === ProductType.BUNDLE)
          .map((item) => item.productId),
      ),
    ];
    if (bundleProductIds.length === 0) {
      return lines;
    }
    const rows = await this.dataSource.getRepository(ProductBundleEntity).find({
      where: { parentProductId: In(bundleProductIds) },
      relations: { childVariant: true },
    });
    const byParent = new Map<string, ProductBundleEntity[]>();
    for (const row of rows) {
      const list = byParent.get(row.parentProductId) ?? [];
      list.push(row);
      byParent.set(row.parentProductId, list);
    }
    return lines.map((line) => {
      if (!bundleProductIds.includes(line.productId)) {
        return line;
      }
      const children = byParent.get(line.productId) ?? [];
      return {
        ...line,
        codAvailable: deriveBundleCodAvailable(
          children.map((row) => row.childVariant ?? { codAvailable: false }),
        ),
      };
    });
  }

  private async addOrIncrementItem(
    userId: string,
    cartId: string,
    dto: {
      productId: string;
      variantId: string;
      quantity: number;
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    },
    manager = this.dataSource.manager,
  ): Promise<void> {
    const variant = await this.getValidVariant(dto.productId, dto.variantId, manager);
    const isSubscription = !!dto.isSubscription;
    const frequency = isSubscription ? dto.frequency ?? null : null;

    if (isSubscription) {
      if (!frequency) {
        throw new BadRequestException('frequency is required for subscription cart items');
      }
      await this.assertSubscriptionAllowed(dto.productId, dto.variantId, frequency);
    }

    const existingLines = await this.cartItemsRepository.findAllByCartAndVariant(
      cartId,
      dto.variantId,
      manager,
    );
    const existing = existingLines.find(
      (line) =>
        line.isSubscription === isSubscription && (line.frequency ?? null) === frequency,
    );

    if (existing) {
      const nextQty = existing.quantity + dto.quantity;
      this.assertStockAvailable(nextQty, variant);
      await this.cartItemsRepository.updateById(
        existing.id,
        { quantity: nextQty, updatedBy: userId },
        manager,
      );
      await this.cartsRepository.touchCustomerActivity(cartId, userId, manager);
      return;
    }

    const sameType = existingLines.find((line) => line.isSubscription === isSubscription);
    if (sameType) {
      await this.cartItemsRepository.updateById(
        sameType.id,
        { frequency, updatedBy: userId },
        manager,
      );
      await this.cartsRepository.touchCustomerActivity(cartId, userId, manager);
      return;
    }

    // Unique (cart, variant) — a subscribe line and a one-time line cannot both exist.
    // Switching to a normal purchase must clear isSubscription so GoKwik can take the cart.
    const opposite = existingLines[0];
    if (opposite) {
      const nextQty = opposite.quantity + dto.quantity;
      this.assertStockAvailable(nextQty, variant);
      await this.cartItemsRepository.updateById(
        opposite.id,
        {
          quantity: nextQty,
          isSubscription,
          frequency,
          updatedBy: userId,
        },
        manager,
      );
      await this.cartsRepository.touchCustomerActivity(cartId, userId, manager);
      return;
    }

    this.assertStockAvailable(dto.quantity, variant);
    const refId = await generateUniqueRefId('cart-item', (candidate) =>
      this.cartItemsRepository.existsByRefId(candidate),
    );
    await this.cartItemsRepository.create(
      {
        refId,
        cartId,
        productId: dto.productId,
        variantId: dto.variantId,
        quantity: dto.quantity,
        isSubscription,
        frequency,
        createdBy: userId,
        updatedBy: userId,
      },
      manager,
    );
    await this.cartsRepository.touchCustomerActivity(cartId, userId, manager);
  }

  private async assertSubscriptionAllowed(
    productId: string,
    variantId: string,
    frequency: ProductSubscriptionFrequency,
  ): Promise<void> {
    if (!isSubscriptionsModuleEnabled(this.configService)) {
      throw new BadRequestException('Subscriptions are not available');
    }

    const config = await this.productSubscriptionConfigService.findEntityForProductVariant(
      productId,
      variantId,
    );

    if (!config?.enabled) {
      throw new BadRequestException('Subscription is not enabled for this product');
    }

    if (!config.frequencies.includes(frequency)) {
      throw new BadRequestException('Selected frequency is not allowed for this product');
    }
  }

  private async getValidVariant(
    productId: string,
    variantId: string,
    manager = this.dataSource.manager,
  ): Promise<ProductVariantEntity> {
    const repo = manager.getRepository(ProductVariantEntity);
    const variant = await repo
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.product', 'product')
      .where('variant.id = :variantId', { variantId })
      .andWhere('variant.productId = :productId', { productId })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
      .getOne();

    if (!variant) {
      throw new BadRequestException('Product/variant not found or inactive');
    }
    return variant;
  }

  private assertStockAvailable(
    requiredQty: number,
    variant: Pick<ProductVariantEntity, 'stock' | 'outOfStock' | 'inCurekaInventory' | 'sku'>,
  ): void {
    if (variant.outOfStock) {
      throw new BadRequestException(`SKU ${variant.sku} is out of stock`);
    }
    if (!STOCK_VALIDATION_ENABLED(variant)) {
      return;
    }
    if (requiredQty > variant.stock) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private buildProductDetails(variant?: ProductVariantEntity): Array<{ label: string; value: string }> {
    if (!variant) {
      return [];
    }

    const details: Array<{ label: string; value: string }> = [];
    for (const item of variant.attributeValues ?? []) {
      const value = item.value?.trim();
      if (!value) {
        continue;
      }
      const label = item.attribute?.name?.trim() || 'Attribute';
      details.push({ label, value });
    }
    return details;
  }

  private formatVariantLabel(variant?: ProductVariantEntity): string | null {
    if (!variant) {
      return null;
    }

    const parts: string[] = [];

    for (const item of variant.attributeValues ?? []) {
      const value = item.value?.trim();
      if (!value) {
        continue;
      }

      const name = item.attribute?.name?.trim();
      parts.push(name ? `${name}: ${value}` : value);
    }

    const weightLabel = this.formatVariantWeight(variant);
    if (weightLabel && !this.hasDetailPart(parts, 'weight')) {
      parts.push(`Weight: ${weightLabel}`);
    }

    const dimensionsLabel = this.formatVariantDimensions(variant);
    if (dimensionsLabel && !this.hasDetailPart(parts, 'dimension')) {
      parts.push(`Dimensions: ${dimensionsLabel}`);
    }

    return parts.length ? parts.join(' · ') : null;
  }

  private resolveCartProductName(
    product: ProductEntity | undefined,
    variant: ProductVariantEntity | undefined,
  ): string {
    const productName = product?.name?.trim() ?? '';
    if (product?.productType !== ProductType.VARIABLE) {
      return productName;
    }
    return variant?.displayName?.trim() || productName;
  }

  private formatVariantWeight(variant: ProductVariantEntity): string | null {
    const weight = variant.weight?.toString().trim();
    if (!weight) {
      return null;
    }

    const unit = variant.weightUnit?.trim();
    return unit ? `${weight} ${unit}` : weight;
  }

  private formatVariantDimensions(variant: ProductVariantEntity): string | null {
    const values = [variant.length, variant.width, variant.height];
    if (values.every((value) => value == null || `${value}`.trim() === '')) {
      return null;
    }

    const unit =
      variant.lengthUnit?.trim() ??
      variant.widthUnit?.trim() ??
      variant.heightUnit?.trim() ??
      '';
    const dimensions = values
      .map((value) => (value == null || `${value}`.trim() === '' ? '-' : `${value}`.trim()))
      .join(' x ');

    return unit ? `${dimensions} ${unit}` : dimensions;
  }

  private hasDetailPart(parts: string[], keyword: 'weight' | 'dimension'): boolean {
    return parts.some((part) => part.toLowerCase().includes(keyword));
  }

  private async enrichRewardLines(rewards: CartResponse['rewardLines']): Promise<NonNullable<CartResponse['rewardLines']>> {
    const lines = rewards ?? [];
    if (!lines.length) return [];
    const variants = await this.dataSource.getRepository(ProductVariantEntity).find({
      where: { id: In(lines.map((line) => line.variantId)) },
      relations: { product: { media: true }, attributeValues: { attribute: true } },
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    return Promise.all(
      lines.map(async (line) => {
        const variant = byId.get(line.variantId);
        const imageRef = this.resolvePrimaryImageRef(variant?.product, line.variantId);
        return {
          ...line,
          productName: variant ? this.resolveCartProductName(variant.product, variant) : line.productName,
          variantLabel: this.formatVariantLabel(variant) || line.variantLabel,
          primaryImageUrl: imageRef ? await this.storageUrlEnricher.toReference(imageRef) : null,
        };
      }),
    );
  }

  private resolvePrimaryImageRef(
    product: ProductEntity | undefined,
    variantId: string,
  ): IStorageFileReference | null {
    const media = (product?.media ?? []).filter(
      (item: ProductMediaEntity) =>
        item.type === ProductMediaType.IMAGE || item.type === ProductMediaType.COMMON,
    );
    if (!media.length) {
      return null;
    }

    const variantMedia = media.filter((item) => item.variantId === variantId);
    const variantPrimary = variantMedia.find((item) => item.isPrimary) ?? variantMedia[0];
    if (variantPrimary?.url) {
      return variantPrimary.url;
    }

    const productMedia = media.filter((item) => !item.variantId);
    const productPrimary =
      productMedia.find((item) => item.isPrimary) ?? productMedia[0] ?? media[0];
    return productPrimary?.url ?? null;
  }
}
