import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CheckoutDto } from '../dto/checkout.dto';
import { CartService } from './cart.service';

export type CheckoutItem = {
  cartItemId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type CheckoutSummary = {
  items: CheckoutItem[];
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  grandTotal: number;
};

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cartService: CartService,
    private readonly userAddressesService: UserAddressesService,
  ) {}

  async validateCheckout(userId: string, dto: CheckoutDto): Promise<CheckoutSummary> {
    await this.userAddressesService.findOne(userId, dto.addressId);

    const cart = await this.cartService.getActiveCartEntity(userId);
    if (!cart) throw new BadRequestException('Cart not found');
    if (!cart.items?.length) throw new BadRequestException('Cart is empty');

    const items = await Promise.all(
      cart.items.map(async (item) => {
        const variant = await this.dataSource
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
        } as CheckoutItem;
      }),
    );

    const subtotal = items.reduce((sum, x) => sum + x.totalPrice, 0);
    const discountAmount = 0;
    const shippingAmount = 0;
    return {
      items,
      subtotal,
      discountAmount,
      shippingAmount,
      grandTotal: subtotal - discountAmount + shippingAmount,
    };
  }
}
