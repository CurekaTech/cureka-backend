import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { AddCartItemDto, ApplyCouponDto, UpdateCartItemDto } from '../dto/cart.dto';
import { CartEntity } from '../entities/cart.entity';
import { CartLineItem, CartResponse } from '../interfaces/cart-pricing.interface';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';
import { CartPricingService } from './cart-pricing.service';
import { CouponCheckoutService } from './coupon-checkout.service';

const EMPTY_CART: CartResponse = {
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
  ) { }

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartResponse> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.getOrCreateActiveCart(userId, manager);
      const variant = await this.getValidVariant(dto.productId, dto.variantId, manager);

      const existing = await this.cartItemsRepository.findByCartAndVariant(cart.id, dto.variantId, manager);
      if (existing) {
        const nextQty = existing.quantity + dto.quantity;
        this.assertStockAvailable(nextQty, variant.stock);
        await this.cartItemsRepository.updateById(existing.id, { quantity: nextQty }, manager);
      } else {
        this.assertStockAvailable(dto.quantity, variant.stock);
        const refId = await generateUniqueRefId('cart-item', (candidate) =>
          this.cartItemsRepository.existsByRefId(candidate),
        );
        await this.cartItemsRepository.create(
          {
            refId,
            cartId: cart.id,
            productId: dto.productId,
            variantId: dto.variantId,
            quantity: dto.quantity,
            createdBy: userId,
            updatedBy: userId,
          },
          manager,
        );
      }

      return this.getCart(userId, manager);
    });
  }

  async getCart(userId: string, manager = this.dataSource.manager): Promise<CartResponse> {
    const cart = await this.cartsRepository.findActiveByUserId(userId, manager);
    if (!cart) {
      return { ...EMPTY_CART };
    }

    return this.toCartResponse(cart, userId, manager, { clearInvalidCoupon: true });
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
        return { ...EMPTY_CART };
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
        return { ...EMPTY_CART };
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

  async mergeGuestCartIntoUser(fromUserId: string, toUserId: string): Promise<void> {
    if (fromUserId === toUserId) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const guestCart = await this.cartsRepository.findActiveByUserId(fromUserId, manager);
      if (!guestCart?.items?.length) {
        return;
      }

      const targetCart = await this.getOrCreateActiveCart(toUserId, manager);

      for (const item of guestCart.items) {
        const variant = await this.getValidVariant(item.productId, item.variantId, manager);
        const existing = await this.cartItemsRepository.findByCartAndVariant(
          targetCart.id,
          item.variantId,
          manager,
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
    });
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
    options?: { clearInvalidCoupon?: boolean },
  ): Promise<CartResponse> {
    const items = await this.buildLineItems(cart);
    const pricing = await this.cartPricingService.calculateCartPricing({
      userId,
      cartId: cart.id,
      couponId: cart.couponId,
      items,
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

  private async buildLineItems(cart: CartEntity): Promise<CartLineItem[]> {
    return Promise.all(
      (cart.items ?? []).map(async (item): Promise<CartLineItem> => {
        const variant = item.variant as ProductVariantEntity | undefined;
        const product = item.product as ProductEntity | undefined;
        const unitPrice = variant ? parseFloat(variant.sellingPrice) : 0;
        const imageRef = this.resolvePrimaryImageRef(product, item.variantId);
        const primaryImageUrl = await this.storageUrlEnricher.toReference(imageRef);

        const isAvailable =
          variant?.status === VariantStatus.ACTIVE &&
          product?.status === ProductStatus.PUBLISHED;

        return {
          id: item.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: product?.name ?? '',
          sku: variant?.sku ?? '',
          variantLabel: this.formatVariantLabel(variant),
          quantity: item.quantity,
          unitPrice,
          totalPrice: unitPrice * item.quantity,
          stock: variant?.stock ?? 0,
          isAvailable,
          primaryImageUrl,
          categoryId: product?.categoryId ?? '',
          subCategoryId: product?.subCategoryId ?? null,
          subSubCategoryId: product?.subSubCategoryId ?? null,
          subSubSubCategoryId: product?.subSubSubCategoryId ?? null,
          brandId: product?.brandId ?? null,
        };
      }),
    );
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
    if (requiredQty > stock) {
      throw new BadRequestException('Requested quantity exceeds available stock');
    }
  }

  private formatVariantLabel(variant?: ProductVariantEntity): string | null {
    const attributeValues = variant?.attributeValues ?? [];
    if (!attributeValues.length) {
      return null;
    }

    const parts = attributeValues
      .map((item) => {
        const value = item.value?.trim();
        if (!value) {
          return null;
        }

        const name = item.attribute?.name?.trim();
        return name ? `${name}: ${value}` : value;
      })
      .filter((part): part is string => Boolean(part));

    return parts.length ? parts.join(' · ') : null;
  }

  private resolvePrimaryImageRef(
    product: ProductEntity | undefined,
    variantId: string,
  ): IStorageFileReference | null {
    const media = (product?.media ?? []).filter(
      (item: ProductMediaEntity) => item.type === ProductMediaType.IMAGE,
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
