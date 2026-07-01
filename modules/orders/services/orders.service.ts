import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildPaginatedResult, generateUniqueRefId } from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UserAddressEntity } from '@modules/users/entities/user-address.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';
import { OrderItemsRepository } from '../repositories/order-items.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { CheckoutDto } from '../dto/checkout.dto';
import { OrderQueryDto, PlaceOrderDto } from '../dto/order.dto';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { mapOrderToResponse } from '../mappers/order.mapper';
import { CouponCheckoutService } from './coupon-checkout.service';
import { CheckoutService } from './checkout.service';
import { CartService } from './cart.service';
import { toMoneyString } from '../utils/money.util';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
    private readonly cartsRepository: CartsRepository,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly userAddressesService: UserAddressesService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly couponCheckoutService: CouponCheckoutService,
  ) {}

  checkout(userId: string, dto: CheckoutDto) {
    return this.checkoutService.validateCheckout(userId, dto);
  }

  async placeOrder(userId: string, dto: PlaceOrderDto) {
    if (dto.paymentMethod === OrderPaymentMethod.RAZORPAY) {
      throw new BadRequestException(
        'Online Razorpay checkout must use POST /payment-requests/checkout',
      );
    }

    const address = await this.userAddressesService.findOne(userId, dto.addressId);
    const summary = await this.checkoutService.validateCheckout(userId, { addressId: dto.addressId });

    if (!summary.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartService.getActiveCartEntity(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');

      const appliedCoupon = cart.couponId
        ? await this.couponCheckoutService.findById(cart.couponId)
        : null;

      if (cart.couponId && !appliedCoupon) {
        throw new BadRequestException('Applied coupon is no longer available');
      }

      if (appliedCoupon && !summary.coupon) {
        throw new BadRequestException('Applied coupon is no longer valid for this cart');
      }

      const orderRefId = await generateUniqueRefId('order', (candidate) =>
        this.ordersRepository.existsByRefId(candidate),
      );
      const orderNumber = await this.generateOrderNumber();

      const createdOrder = await this.ordersRepository.create(
        {
          refId: orderRefId,
          orderNumber,
          userId,
          subtotal: toMoneyString(summary.subtotal),
          discountAmount: toMoneyString(summary.discountAmount),
          shippingAmount: toMoneyString(summary.shippingAmount),
          handlingAmount: toMoneyString(summary.handlingAmount),
          grandTotal: toMoneyString(summary.grandTotal),
          couponId: appliedCoupon?.id ?? null,
          couponCode: appliedCoupon?.code ?? null,
          couponTitle: appliedCoupon?.title ?? null,
          couponDiscountType: appliedCoupon?.discountType ?? null,
          paymentMethod: dto.paymentMethod,
          paymentStatus: OrderPaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          pincode: address.pincode,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          notes: dto.notes ?? null,
          placedAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
        },
        manager,
      );

      const orderItemsPayload = [];
      for (const item of summary.items) {
        const variant = await manager.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
        });
        if (!variant) throw new BadRequestException('Variant not found while placing order');
        if (variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
        await manager.getRepository(ProductVariantEntity).update(
          { id: item.variantId },
          { stock: variant.stock - item.quantity },
        );

        const orderItemRefId = await generateUniqueRefId('order-item', (candidate) =>
          this.orderItemsRepository.existsByRefId(candidate),
        );
        orderItemsPayload.push({
          refId: orderItemRefId,
          orderId: createdOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          totalPrice: item.totalPrice.toFixed(2),
          createdBy: userId,
          updatedBy: userId,
        });
      }

      await this.orderItemsRepository.createMany(orderItemsPayload, manager);

      if (appliedCoupon) {
        await this.couponCheckoutService.validateCoupon(appliedCoupon, {
          userId,
          subtotal: summary.subtotal,
          items: summary.items.map((item) => ({
            id: item.cartItemId,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            sku: item.sku,
            variantLabel: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            stock: 0,
            primaryImageUrl: null,
            categoryId: item.categoryId,
            subCategoryId: item.subCategoryId,
            subSubCategoryId: item.subSubCategoryId,
            subSubSubCategoryId: item.subSubSubCategoryId,
            brandId: item.brandId,
          })),
          manager,
        });

        await this.couponCheckoutService.incrementUsage(
          {
            couponId: appliedCoupon.id,
            userId,
            orderId: createdOrder.id,
            discountAmount: summary.discountAmount,
          },
          manager,
        );
      }

      await this.cartItemsRepository.clearByCartId(cart.id, manager);
      if (cart.couponId) {
        await this.cartsRepository.updateById(cart.id, { couponId: null, updatedBy: userId }, manager);
      }

      const order = await this.ordersRepository.findByIdAndUserId(createdOrder.id, userId, manager);
      if (!order) throw new NotFoundException('Order not found after creation');
      return mapOrderToResponse(order, this.storageUrlEnricher);
    });
  }

  async findMyOrders(userId: string, query: OrderQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.ordersRepository.findByUserPaginated({
      userId,
      status: query.status,
      page,
      limit,
    });
    const mapped = await Promise.all(
      data.map((order) => mapOrderToResponse(order, this.storageUrlEnricher)),
    );
    return buildPaginatedResult(mapped, total, { page, limit, sortOrder: 'DESC' });
  }

  async findOne(userId: string, id: string) {
    const order = await this.ordersRepository.findByIdAndUserId(id, userId);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return mapOrderToResponse(order, this.storageUrlEnricher);
  }

  async cancel(userId: string, id: string) {
    const order = await this.ordersRepository.findByIdAndUserId(id, userId);
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(order.orderStatus)) {
      throw new BadRequestException('Only pending/confirmed orders can be cancelled');
    }

    await this.ordersRepository.updateById(id, {
      orderStatus: OrderStatus.CANCELLED,
      updatedBy: userId,
    });
    return this.findOne(userId, id);
  }

  async createOrderFromPaymentRequest(params: {
    customerId: string;
    paymentRequestId: string;
    paymentRequestRefId: string;
    subtotal: string;
    discountAmount: string;
    shippingAmount: string;
    grandTotal: string;
    notes: string | null;
    paymentMethod?: OrderPaymentMethod;
    createdBy?: string;
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
    }>;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const address = await manager.getRepository(UserAddressEntity).findOne({
        where: { userId: params.customerId, isDefault: true },
        order: { updatedAt: 'DESC' },
      });

      const orderRefId = await generateUniqueRefId('order', (candidate) =>
        this.ordersRepository.existsByRefId(candidate),
      );
      const orderNumber = await this.generateOrderNumber();

      const createdOrder = await this.ordersRepository.create(
        {
          refId: orderRefId,
          orderNumber,
          userId: params.customerId,
          subtotal: params.subtotal,
          discountAmount: params.discountAmount,
          shippingAmount: params.shippingAmount,
          handlingAmount: '0',
          grandTotal: params.grandTotal,
          paymentMethod: params.paymentMethod ?? OrderPaymentMethod.RAZORPAY,
          paymentStatus: OrderPaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          recipientName: address?.recipientName ?? 'Customer',
          phoneNumber: address?.phoneNumber ?? '0000000000',
          pincode: address?.pincode ?? '000000',
          addressLine1: address?.addressLine1 ?? 'Address not provided',
          addressLine2: address?.addressLine2 ?? null,
          landmark: address?.landmark ?? null,
          city: address?.city ?? 'NA',
          state: address?.state ?? 'NA',
          notes: params.notes ?? `Generated from payment request ${params.paymentRequestRefId}`,
          placedAt: new Date(),
          createdBy: params.createdBy ?? 'razorpay-webhook',
          updatedBy: params.createdBy ?? 'razorpay-webhook',
        },
        manager,
      );


      const orderItemsPayload = [];
      for (const item of params.items) {
        const variant = await manager.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
          relations: { product: true, attributeValues: true },
        });
        if (!variant) throw new BadRequestException('Variant not found while creating order');
        if (variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
        await manager.getRepository(ProductVariantEntity).update(
          { id: item.variantId },
          { stock: variant.stock - item.quantity },
        );
        const orderItemRefId = await generateUniqueRefId('order-item', (candidate) =>
          this.orderItemsRepository.existsByRefId(candidate),
        );
        orderItemsPayload.push({
          refId: orderItemRefId,
          orderId: createdOrder.id,
          productId: item.productId,
          variantId: item.variantId,
          sku: variant.sku,
          productName: variant.product?.name ?? '',
          variantName: variant.attributeValues?.length
            ? variant.attributeValues.map((value) => value.value).join(' / ')
            : null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          createdBy: 'razorpay-webhook',
          updatedBy: 'razorpay-webhook',
        });
      }

      await this.orderItemsRepository.createMany(orderItemsPayload, manager);
      const order = await this.ordersRepository.findByIdAndUserId(
        createdOrder.id,
        params.customerId,
        manager,
      );
      if (!order) throw new NotFoundException('Order not found after creation');
      return order;
    });
  }

  private async generateOrderNumber(): Promise<string> {
    for (let i = 0; i < 20; i += 1) {
      const stamp = Date.now().toString().slice(-8);
      const rand = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const orderNumber = `ORD${stamp}${rand}`;
      if (!(await this.ordersRepository.existsByOrderNumber(orderNumber))) {
        return orderNumber;
      }
    }
    throw new Error('Failed to generate order number');
  }
}
