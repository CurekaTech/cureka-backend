import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CheckoutDto } from '../dto/checkout.dto';
import { CheckoutLineItem, CheckoutSummary } from '../interfaces/cart-pricing.interface';
import { CartPricingService } from './cart-pricing.service';
import { CartService } from './cart.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly userAddressesService: UserAddressesService,
    private readonly cartPricingService: CartPricingService,
  ) {}

  async validateCheckout(userId: string, dto: CheckoutDto): Promise<CheckoutSummary> {
    await this.userAddressesService.findOne(userId, dto.addressId);

    const cart = await this.cartService.getActiveCartEntity(userId);
    if (!cart) throw new BadRequestException('Cart not found');
    if (!cart.items?.length) throw new BadRequestException('Cart is empty');

    const items = await this.buildCheckoutItems(cart.items, this.dataSource.manager);
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
      stock: 0,
      isAvailable: true,
      primaryImageUrl: null,
      productDetails: [],
      categoryId: item.categoryId,
      subCategoryId: item.subCategoryId,
      subSubCategoryId: item.subSubCategoryId,
      subSubSubCategoryId: item.subSubSubCategoryId,
      brandId: item.brandId,
    }));

    const pricing = await this.cartPricingService.calculateCartPricing({
      userId,
      cartId: cart.id,
      couponId: cart.couponId,
      items: lineItems,
      paymentMethod: dto.paymentMethod,
      strict: true,
    });

    return {
      items,
      ...pricing,
    };
  }

  private async buildCheckoutItems(
    cartItems: Array<{
      id: string;
      productId: string;
      variantId: string;
      quantity: number;
    }>,
    manager: EntityManager,
  ): Promise<CheckoutLineItem[]> {
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
        if (variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }

        const unitPrice = parseFloat(variant.sellingPrice);
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
          totalPrice: unitPrice * item.quantity,
          categoryId: variant.product?.categoryId ?? '',
          subCategoryId: variant.product?.subCategoryId ?? null,
          subSubCategoryId: variant.product?.subSubCategoryId ?? null,
          subSubSubCategoryId: variant.product?.subSubSubCategoryId ?? null,
          brandId: variant.product?.brandId ?? null,
        };
      }),
    );
  }
}
