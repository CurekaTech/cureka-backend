import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { generateUniqueRefId, getSalableStockQuantity, isVariantInStock, STOCK_VALIDATION_ENABLED } from '@packages/common';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductSubscriptionConfigService } from '@modules/subscription/services/product-subscription-config.service';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { AddCartItemDto, ApplyCouponDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartEntity } from '../entities/cart.entity';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { CartLineItem, CartResponse } from '../interfaces/cart-pricing.interface';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';
import { SavedForLaterItemsRepository } from '../repositories/saved-for-later-items.repository';
import { CartCheckoutAdminSettingsService } from './cart-checkout-admin-settings.service';
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
  ) { }

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

      if (!STOCK_VALIDATION_ENABLED) {
        return this.toCartResponse(cart, cart.userId, manager, { clearInvalidCoupon: true });
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

  async applyCoupon(userId: string, dto: ApplyCouponDto): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');
      if (!cart.items?.length) throw new BadRequestException('Cart is empty');

      const coupon = await this.couponCheckoutService.findByCode(dto.couponCode);
      if (!coupon) {
        throw new NotFoundException(`Coupon code "${dto.couponCode}" not found`);
      }

      const lineItems = await this.buildLineItems(cart);
      const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

      await this.couponCheckoutService.validateCoupon(coupon, {
        userId,
        subtotal,
        items: lineItems,
        manager,
      });

      await this.cartsRepository.updateById(
        cart.id,
        { couponId: coupon.id, updatedBy: userId },
        manager,
      );

      const refreshed = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!refreshed) throw new BadRequestException('Cart not found');
      return this.toCartResponse(refreshed, userId, manager);
    });
  }

  async removeCoupon(userId: string): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) {
        return this.buildEmptyCartResponse(userId);
      }

      if (cart.couponId) {
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: null, updatedBy: userId },
          manager,
        );
      }

      const refreshed = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!refreshed) {
        return this.buildEmptyCartResponse(userId);
      }
      return this.toCartResponse(refreshed, userId, manager);
    });
  }

  async updateQuantity(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) throw new NotFoundException('Active cart not found');
      const item = cart.items.find((x) => x.id === itemId);
      if (!item) throw new NotFoundException(`Cart item ${itemId} not found`);

      const variant = await this.getValidVariant(item.productId, item.variantId, manager);
      this.assertStockAvailable(dto.quantity, variant.stock);

      await this.cartItemsRepository.updateById(itemId, { quantity: dto.quantity }, manager);
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
      return this.getCart(userId, manager);
    });
  }

  async clear(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
      if (!cart) return;
      await this.cartItemsRepository.clearByCartId(cart.id, manager);
      if (cart.couponId) {
        await this.cartsRepository.updateById(cart.id, { couponId: null, updatedBy: userId }, manager);
      }
    });
  }

  async getActiveCartEntity(userId: string, manager = this.dataSource.manager): Promise<CartEntity | null> {
    return this.cartsRepository.findActiveByUserId(userId, manager);
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
          const existing = await this.cartItemsRepository.findByCartAndVariant(
            targetCart.id,
            item.variantId,
            manager,
            {
              isSubscription: item.isSubscription,
              frequency: item.isSubscription ? item.frequency ?? null : null,
            },
          );

          if (existing) {
            const nextQty = existing.quantity + item.quantity;
            this.assertStockAvailable(nextQty, variant.stock);
            await this.cartItemsRepository.updateById(
              existing.id,
              { quantity: nextQty, updatedBy: toUserId },
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
                isSubscription: !!item.isSubscription,
                frequency: item.isSubscription ? item.frequency ?? null : null,
                createdBy: toUserId,
                updatedBy: toUserId,
              },
              manager,
            );
          }
        }

        if (guestCart.couponId && !targetCart.couponId) {
          await this.cartsRepository.updateById(
            targetCart.id,
            { couponId: guestCart.couponId, updatedBy: toUserId },
            manager,
          );
        }

        await this.cartItemsRepository.clearByCartId(guestCart.id, manager);
        await this.cartsRepository.updateById(
          guestCart.id,
          { isActive: false, couponId: null, updatedBy: toUserId },
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
    options?: { clearInvalidCoupon?: boolean; paymentMethod?: OrderPaymentMethod },
  ): Promise<CartResponse> {
    const items = await this.buildLineItems(cart);
    const pricing = await this.cartPricingService.calculateCartPricing({
      userId,
      cartId: cart.id,
      couponId: cart.couponId,
      items,
      paymentMethod: options?.paymentMethod,
      manager,
      clearInvalidCoupon: options?.clearInvalidCoupon ?? false,
    });

    return {
      cartId: cart.id,
      items,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      ...pricing,
    };
  }

  private async buildLineItems(
    cart: CartEntity,
    options?: { skipImages?: boolean },
  ): Promise<CartLineItem[]> {
    return Promise.all(
      (cart.items ?? []).map(async (item): Promise<CartLineItem> => {
        const variant = item.variant as ProductVariantEntity | undefined;
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
          product?.status === ProductStatus.PUBLISHED;
        const rawStock = variant?.stock ?? 0;
        const stock = getSalableStockQuantity(rawStock, item.quantity);

        const variantSlug = variant?.slug?.trim() ?? '';
        const productSlug = product?.slug?.trim() ?? '';
        const productPageUrl = variant?.productPageUrl?.trim() || null;

        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: product?.name ?? '',
          slug: variantSlug || productSlug,
          productPageUrl,
          sku: variant?.sku ?? '',
          variantLabel: this.formatVariantLabel(variant),
          quantity: item.quantity,
          unitPrice,
          mrp,
          totalPrice: unitPrice * item.quantity,
          stock,
          inStock: isAvailable && isVariantInStock(rawStock),
          isAvailable,
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

    const existing = await this.cartItemsRepository.findByCartAndVariant(
      cartId,
      dto.variantId,
      manager,
      { isSubscription, frequency },
    );

    if (existing) {
      const nextQty = existing.quantity + dto.quantity;
      this.assertStockAvailable(nextQty, variant.stock);
      await this.cartItemsRepository.updateById(
        existing.id,
        { quantity: nextQty, updatedBy: userId },
        manager,
      );
      return;
    }

    this.assertStockAvailable(dto.quantity, variant.stock);
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
  }

  private async assertSubscriptionAllowed(
    productId: string,
    variantId: string,
    frequency: ProductSubscriptionFrequency,
  ): Promise<void> {
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

  private assertStockAvailable(requiredQty: number, stock: number): void {
    if (!STOCK_VALIDATION_ENABLED) {
      return;
    }
    if (requiredQty > stock) {
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
