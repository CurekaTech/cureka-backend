import { BadRequestException, Injectable } from '@nestjs/common';
import { STOCK_VALIDATION_ENABLED, getSalableStockQuantity } from '@packages/common';
import { DataSource, EntityManager, In } from 'typeorm';
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
import { CodBlocklistService } from '@modules/cod-blocklist/services/cod-blocklist.service';
import { EvaluateCodBlockParams } from '@modules/cod-blocklist/interfaces/cod-blocklist.interface';
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
    private readonly codBlocklistService: CodBlocklistService,
  ) {}

  async validateCheckout(
    userId: string,
    dto: CheckoutDto,
    options?: { skipCodVariantEligibility?: boolean },
  ): Promise<CheckoutSummary> {
    let deliveryPincode: string | undefined;
    let checkoutMobile: string | undefined;
    if (dto.addressId) {
      const address = await this.userAddressesService.findOne(userId, dto.addressId);
      deliveryPincode = address.pincode;
      checkoutMobile = address.phoneNumber;
    }

    const cart = await this.cartService.getActiveCartEntity(userId);
    if (!cart) throw new BadRequestException('Cart not found');
    if (!cart.items?.length) throw new BadRequestException('Cart is empty');

    const items = await this.buildCheckoutItems(cart.items, userId, this.dataSource.manager);
    const lineItems = items.map((item) => ({
      id: item.cartItemId,
      productId: item.productId,
      variantId: item.variantId,
      productSlug: null,
      productPagePath: null,
      productName: item.productName,
      slug: '',
      productPageUrl: null,
      sku: item.sku,
      variantLabel: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      mrp: null,
      totalPrice: item.totalPrice,
      stock: getSalableStockQuantity(0, item.quantity),
      inStock: true,
      isAvailable: true,
      codAvailable: true,
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
      deliveryPincode,
      checkoutMobile,
    });

    if (isCodPaymentMethod(dto.paymentMethod)) {
      // Product-level COD restriction is for native/website checkout only.
      // GoKwik owns COD UX and must not be blocked by variant.codAvailable.
      if (!options?.skipCodVariantEligibility) {
        await this.assertCodVariantsEligible(items, this.dataSource.manager);
      }
      const payable = roundMoney(pricing.subtotal - pricing.discountAmount);
      const amounts = await this.cartCheckoutAdminSettingsService.resolveAmounts();
      this.cartCheckoutAdminSettingsService.assertCodOrderEligible(payable, amounts);
    }

    return {
      items,
      ...pricing,
    };
  }

  /**
   * Enforces COD min/max, then the native COD blocklist (customer / pincode).
   * GoKwik-active checkouts skip the custom blocklist inside CodBlocklistService.
   */
  async assertCodPaymentEligible(
    payableMerchandise: number,
    context?: EvaluateCodBlockParams,
  ): Promise<void> {
    const amounts = await this.cartCheckoutAdminSettingsService.resolveAmounts();
    this.cartCheckoutAdminSettingsService.assertCodOrderEligible(
      roundMoney(payableMerchandise),
      amounts,
    );
    await this.codBlocklistService.assertNativeCodAllowed({
      customerId: context?.customerId,
      mobileNumber: context?.mobileNumber,
      pincode: context?.pincode,
    });
  }

  async assertCodVariantsEligible(
    lines: Array<{
      productId: string;
      variantId: string;
      productName: string;
      variantName?: string | null;
      sku?: string | null;
    }>,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    const variantIds = [...new Set(lines.map((line) => line.variantId).filter(Boolean))];
    if (!variantIds.length) {
      return;
    }

    const variants = await manager.getRepository(ProductVariantEntity).find({
      where: { id: In(variantIds) },
      relations: {
        product: true,
        attributeValues: true,
      },
    });
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const restrictedNames: string[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const variant = variantById.get(line.variantId);
      if (!variant || variant.productId !== line.productId) {
        continue;
      }
      if (variant.codAvailable) {
        continue;
      }

      const label = this.buildCodRestrictedProductLabel(variant, line);
      const key = label.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      restrictedNames.push(label);
    }

    if (!restrictedNames.length) {
      return;
    }

    throw new BadRequestException(
      `Cash on Delivery is not available for the following products:\n\n` +
        restrictedNames.map((name) => `- ${name}`).join('\n') +
        `\n\nYou can place a prepaid order for all products, remove the above products and continue with COD, or place separate orders.`,
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

  private buildCodRestrictedProductLabel(
    variant: ProductVariantEntity,
    line: {
      productName: string;
      variantName?: string | null;
      sku?: string | null;
    },
  ): string {
    const displayName = variant.displayName?.trim();
    if (displayName) {
      return displayName;
    }

    const productName = variant.product?.name?.trim() || line.productName?.trim() || 'Product';
    const attributeLabel = (variant.attributeValues ?? [])
      .map((item) => item.value?.trim())
      .filter(Boolean)
      .join(' / ');
    if (attributeLabel) {
      return `${productName} - ${attributeLabel}`;
    }

    const variantName = line.variantName?.trim();
    if (variantName) {
      return `${productName} - ${variantName}`;
    }

    return productName || variant.sku || line.sku || 'Product';
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
        if (variant.outOfStock) {
          throw new BadRequestException(`SKU ${variant.sku} is out of stock`);
        }
        if (STOCK_VALIDATION_ENABLED(variant) && variant.stock < item.quantity) {
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
