import { BadRequestException, Injectable } from '@nestjs/common';
import { STOCK_VALIDATION_ENABLED, getSalableStockQuantity } from '@packages/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { MembershipBenefitsApplicationService } from '@modules/subscription/services/membership-benefits-application.service';
import { ProductSubscriptionConfigService } from '@modules/subscription/services/product-subscription-config.service';
import { ProductSubscriptionPricingService } from '@modules/subscription/services/product-subscription-pricing.service';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CheckoutDto } from '../dto/checkout.dto';
import { CartItemEntity } from '../entities/cart-item.entity';
import { CheckoutLineItem, CheckoutSummary } from '../interfaces/cart-pricing.interface';
import { roundMoney } from '../utils/money.util';
import { isCodPaymentMethod } from '../utils/payment-method.util';
import {
  assertCurrentProductPrices,
  ProductPriceLine,
} from '../utils/product-price-validation.util';
import { CartCheckoutAdminSettingsService } from './cart-checkout-admin-settings.service';
import { CartPricingService } from './cart-pricing.service';
import { CartService } from './cart.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly userAddressesService: UserAddressesService,
    private readonly cartPricingService: CartPricingService,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
    private readonly productSubscriptionConfigService: ProductSubscriptionConfigService,
    private readonly productSubscriptionPricingService: ProductSubscriptionPricingService,
    private readonly membershipBenefits: MembershipBenefitsApplicationService,
  ) {}

  async validateCheckout(userId: string, dto: CheckoutDto): Promise<CheckoutSummary> {
    if (dto.addressId) {
      await this.userAddressesService.findOne(userId, dto.addressId);
    }

    const cart = await this.cartService.getActiveCartEntity(userId);
    if (!cart) throw new BadRequestException('Cart not found');
    if (!cart.items?.length) throw new BadRequestException('Cart is empty');

    const items = await this.buildCheckoutItems(cart.items, userId, this.dataSource.manager);
    const lineItems = items.map((item) => ({
      id: item.cartItemId,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      variantLabel: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: null,
      totalPrice: item.totalPrice,
      stock: getSalableStockQuantity(0, item.quantity),
      inStock: true,
      isAvailable: true,
      primaryImageUrl: null,
      productDetails: [],
      categoryId: item.categoryId,
      subCategoryId: item.subCategoryId,
      subSubCategoryId: item.subSubCategoryId,
      subSubSubCategoryId: item.subSubSubCategoryId,
      brandId: item.brandId,
      isSubscription: item.isSubscription,
      frequency: item.frequency,
      lineType: item.isSubscription ? ('SUBSCRIPTION' as const) : ('ONE_TIME' as const),
    }));

    const pricing = await this.cartPricingService.calculateCartPricing({
      userId,
      cartId: cart.id,
      couponId: cart.couponId,
      items: lineItems,
      paymentMethod: dto.paymentMethod,
      strict: true,
    });

    if (isCodPaymentMethod(dto.paymentMethod)) {
      const payable = roundMoney(pricing.subtotal - pricing.discountAmount);
      const amounts = await this.cartCheckoutAdminSettingsService.resolveAmounts();
      this.cartCheckoutAdminSettingsService.assertCodOrderEligible(payable, amounts);
    }

    return {
      items,
      ...pricing,
    };
  }

  /** Enforces COD min/max on backend-calculated merchandise payable (subtotal − coupon). */
  async assertCodPaymentEligible(payableMerchandise: number): Promise<void> {
    const amounts = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    this.cartCheckoutAdminSettingsService.assertCodOrderEligible(
      roundMoney(payableMerchandise),
      amounts,
    );
  }

  /**
   * Revalidate catalog product unit/line prices only (not coupons/fees/GoKwik totals).
   */
  async assertProductPricesCurrent(
    userId: string | undefined,
    lines: ProductPriceLine[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await assertCurrentProductPrices(lines, manager, {
      userId,
      subscriptionConfigService: this.productSubscriptionConfigService,
      subscriptionPricingService: this.productSubscriptionPricingService,
      membershipBenefits: this.membershipBenefits,
    });
  }

  private async buildCheckoutItems(
    cartItems: CartItemEntity[],
    userId: string,
    manager: EntityManager,
  ): Promise<CheckoutLineItem[]> {
    const memberDiscount = await this.membershipBenefits.getMemberDiscount(userId);

    return Promise.all(
      cartItems.map(async (item) => {
        const variant = await manager
          .getRepository(ProductVariantEntity)
          .createQueryBuilder('variant')
          .innerJoinAndSelect('variant.product', 'product')
          .leftJoinAndSelect('variant.attributeValues', 'attributeValues')
          .where('variant.id = :variantId', { variantId: item.variantId })
          .andWhere('variant.productId = :productId', { productId: item.productId })
          .andWhere('variant.deletedAt IS NULL')
          .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
          .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
          .getOne();

        if (!variant) {
          throw new BadRequestException('Cart contains inactive product/variant');
        }
        if (STOCK_VALIDATION_ENABLED && variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }

        const isSubscription = !!item.isSubscription;
        const frequency = (item.frequency as ProductSubscriptionFrequency | null) ?? null;
        let unitPrice = parseFloat(variant.sellingPrice);
        let totalPrice = unitPrice * item.quantity;

        if (isSubscription) {
          if (!frequency) {
            throw new BadRequestException('Subscription cart item is missing frequency');
          }
          const config = await this.productSubscriptionConfigService.findEntityForProductVariant(
            item.productId,
            item.variantId,
          );
          if (!config?.enabled) {
            throw new BadRequestException('Subscription is not enabled for a cart item');
          }
          if (!config.frequencies.includes(frequency)) {
            throw new BadRequestException('Selected frequency is not allowed for a cart item');
          }
          const pricing = this.productSubscriptionPricingService.calculate(
            variant.sellingPrice,
            item.quantity,
            config.discountType,
            config.discountValue,
            memberDiscount,
          );
          totalPrice = Number(pricing.finalAmount);
          unitPrice = totalPrice / Math.max(1, item.quantity);
        }

        const variantName = variant.attributeValues?.length
          ? variant.attributeValues.map((x) => x.value).join(' / ')
          : null;

        return {
          cartItemId: item.id,
          productId: item.productId,
          variantId: item.variantId,
          sku: variant.sku,
          productName: variant.product?.name ?? '',
          variantName,
          quantity: item.quantity,
          unitPrice,
          totalPrice,
          categoryId: variant.product?.categoryId ?? '',
          subCategoryId: variant.product?.subCategoryId ?? null,
          subSubCategoryId: variant.product?.subSubCategoryId ?? null,
          subSubSubCategoryId: variant.product?.subSubSubCategoryId ?? null,
          brandId: variant.product?.brandId ?? null,
          isSubscription,
          frequency,
        };
      }),
    );
  }
}
