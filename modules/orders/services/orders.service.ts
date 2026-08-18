import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  STOCK_VALIDATION_ENABLED,
} from '@packages/common';
import { EVENTS, OrderCancelledEvent } from '@packages/events';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UserAddressEntity } from '@modules/users/entities/user-address.entity';
import { PaymentRequestEntity } from '@modules/payment-requests/entities/payment-request.entity';
import { PaymentRequestItemEntity } from '@modules/payment-requests/entities/payment-request-item.entity';
import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { ShippingService } from '@modules/shipping/services/shipping.service';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { CartsRepository } from '../repositories/carts.repository';
import { OrderItemsRepository } from '../repositories/order-items.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { CheckoutDto } from '../dto/checkout.dto';
import { CancelOrderDto, OrderQueryDto, PlaceOrderDto, AdminOrderQueryDto } from '../dto/order.dto';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';
import { CouponUsageEntity } from '../entities/coupon-usage.entity';
import { OrderEntity } from '../entities/order.entity';
import { OrderItemEntity } from '../entities/order-item.entity';
import { mapOrderToResponse, mapOrderToAdminResponse } from '../mappers/order.mapper';
import {
  mapDefaultShipmentResponse,
  mapShipmentToResponse,
} from '@modules/shipping/mappers/shipment.mapper';
import { CouponCheckoutService } from './coupon-checkout.service';
import { CheckoutService } from './checkout.service';
import { CartService } from './cart.service';
import { CheckoutResolverService } from '@modules/checkout/services/checkout-resolver.service';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import { UnicommerceOrderQueueService } from '@modules/unicommerce/services/unicommerce-order-queue.service';
import { OrderNotificationsService } from '@modules/notifications/services/order-notifications.service';
import { roundMoney, toMoneyString } from '../utils/money.util';
import { isOrderCancellable } from '../constants/cancellable-order-statuses.constant';
import { CheckoutSummary } from '../interfaces/cart-pricing.interface';
import { isPrepaidPaymentMethod } from '../utils/payment-method.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
    private readonly cartsRepository: CartsRepository,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly checkoutResolver: CheckoutResolverService,
    private readonly userAddressesService: UserAddressesService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly shippingService: ShippingService,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly unicommerceOrderQueueService: UnicommerceOrderQueueService,
    private readonly orderNotificationsService: OrderNotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async checkout(userId: string, dto: CheckoutDto) {
    const checkoutProvider = await this.checkoutResolver.resolveProvider();
    const isAddressOptionalPath =
      checkoutProvider === 'gokwik' || isPrepaidPaymentMethod(dto.paymentMethod);
    if (!dto.addressId && !isAddressOptionalPath) {
      throw new BadRequestException('addressId is required for this checkout path');
    }

    const summary = await this.checkoutService.validateCheckout(userId, dto);
    return { ...summary, checkoutProvider };
  }

  async placeOrder(userId: string, dto: PlaceOrderDto) {
    if (
      dto.paymentMethod === OrderPaymentMethod.RAZORPAY ||
      dto.paymentMethod === OrderPaymentMethod.CASHFREE
    ) {
      throw new BadRequestException(
        `Online ${dto.paymentMethod} checkout must use POST /payment-requests/checkout`,
      );
    }

    if (
      dto.paymentMethod === OrderPaymentMethod.GOKWIK_PREPAID ||
      dto.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
    ) {
      throw new BadRequestException(
        'GoKwik checkout must use POST /payment-requests/checkout (opens GoKwik SDK). Orders are created via GoKwik merchant callbacks.',
      );
    }

    const address = await this.userAddressesService.findOne(userId, dto.addressId);
    const summary = await this.checkoutService.validateCheckout(userId, {
      addressId: dto.addressId,
      paymentMethod: dto.paymentMethod,
    });

    if (!summary.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.dataSource.transaction(async (manager) => {
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
          platformFee: toMoneyString(summary.platformFee),
          codCharge: toMoneyString(summary.codCharge),
          prepaidDiscount: toMoneyString(summary.prepaidDiscount),
          grandTotal: toMoneyString(summary.grandTotal),
          couponId: appliedCoupon?.id ?? null,
          couponCode: appliedCoupon?.code ?? null,
          couponTitle: appliedCoupon?.title ?? null,
          couponDiscountType: appliedCoupon?.discountType ?? null,
          paymentMethod: dto.paymentMethod,
          paymentStatus: OrderPaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          orderSource: dto.orderSource ?? OrderSource.WEBSITE,
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
        if (STOCK_VALIDATION_ENABLED && variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
        await manager
          .getRepository(ProductVariantEntity)
          .update({ id: item.variantId }, { stock: variant.stock - item.quantity });

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
          isSubscription: item.isSubscription,
          frequency: item.frequency ?? null,
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
            mrp: null,
            totalPrice: item.totalPrice,
            stock: 0,
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
            lineType: item.isSubscription ? 'SUBSCRIPTION' : 'ONE_TIME',
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
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: null, updatedBy: userId },
          manager,
        );
      }

      if (dto.paymentMethod === OrderPaymentMethod.COD) {
        await this.createCodPaymentRequestForAdminList(
          {
            userId,
            addressId: dto.addressId,
            order: createdOrder,
            summary,
            orderSource: dto.orderSource ?? OrderSource.WEBSITE,
            couponCode: appliedCoupon?.code ?? null,
          },
          manager,
        );
      }

      const order = await this.ordersRepository.findByIdAndUserId(createdOrder.id, userId, manager);
      if (!order) throw new NotFoundException('Order not found after creation');
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId,
          paymentMethod: order.paymentMethod,
        },
        'Order created successfully',
      );
      return order;
    });

    await this.notifyOrderPlacedSafely(order, 'place-order');
    await this.kickoffFulfillment(order.id, order.orderNumber, 'place-order');
    return this.findOne(userId, order.id);
  }

  /**
   * Create a PENDING draft order from the user's active cart without clearing the cart,
   * decrementing stock, incrementing coupon usage, or pushing fulfillment.
   */
  async createDraftOrderFromCart(
    userId: string,
    params: {
      cartId: string;
      addressId: string;
      paymentMethod: OrderPaymentMethod;
      paymentStatus: OrderPaymentStatus;
      notes?: string | null;
      orderSource?: OrderSource;
      ignorePaymentMethodPricing?: boolean;
    },
  ) {
    const address = await this.userAddressesService.findOne(userId, params.addressId);
    const summary = await this.checkoutService.validateCheckout(userId, {
      addressId: params.addressId,
      paymentMethod: params.ignorePaymentMethodPricing ? undefined : params.paymentMethod,
    });

    if (!summary.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const cart = await this.cartService.getActiveCartEntity(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');
      if (cart.id !== params.cartId) {
        throw new BadRequestException('Invalid cart id');
      }

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
          platformFee: toMoneyString(summary.platformFee),
          codCharge: toMoneyString(summary.codCharge),
          prepaidDiscount: toMoneyString(summary.prepaidDiscount),
          grandTotal: toMoneyString(summary.grandTotal),
          couponId: appliedCoupon?.id ?? null,
          couponCode: appliedCoupon?.code ?? null,
          couponTitle: appliedCoupon?.title ?? null,
          couponDiscountType: appliedCoupon?.discountType ?? null,
          paymentMethod: params.paymentMethod,
          paymentStatus: params.paymentStatus,
          orderStatus: OrderStatus.PENDING,
          orderSource: params.orderSource ?? OrderSource.WEBSITE,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          pincode: address.pincode,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          landmark: address.landmark,
          city: address.city,
          state: address.state,
          notes: params.notes ?? null,
          placedAt: null,
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
        if (!variant) throw new BadRequestException('Variant not found while creating draft order');
        if (STOCK_VALIDATION_ENABLED && variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }

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
          isSubscription: item.isSubscription,
          frequency: item.frequency ?? null,
          createdBy: userId,
          updatedBy: userId,
        });
      }

      await this.orderItemsRepository.createMany(orderItemsPayload, manager);

      const draft = await this.ordersRepository.findByIdAndUserId(createdOrder.id, userId, manager);
      if (!draft) throw new NotFoundException('Order not found after creation');
      this.logger.log(
        {
          orderId: draft.id,
          orderNumber: draft.orderNumber,
          userId,
          paymentMethod: draft.paymentMethod,
          paymentStatus: draft.paymentStatus,
        },
        'Draft order created successfully',
      );
      return draft;
    });

    return order;
  }

  /**
   * Finalize a GoKwik (or other) draft order: decrement stock, apply coupon usage,
   * clear cart, update payment fields, then push Shipway / UniCommerce.
   * Idempotent when the order is already CONFIRMED.
   */
  async confirmDraftOrder(
    userId: string,
    params: {
      orderNumber: string;
      cartId: string;
      paymentMethod: OrderPaymentMethod;
      paymentStatus: OrderPaymentStatus;
      notes?: string | null;
    },
  ) {
    let shouldPushFulfillment = true;

    const order = await this.dataSource.transaction(async (manager) => {
      const existing = await this.ordersRepository.findByOrderNumberAndUserIdForUpdate(
        params.orderNumber,
        userId,
        manager,
      );
      if (!existing) {
        throw new BadRequestException('Invalid order id');
      }

      if (existing.orderStatus === OrderStatus.CANCELLED) {
        throw new BadRequestException('Order is cancelled');
      }

      if (existing.orderStatus === OrderStatus.CONFIRMED) {
        shouldPushFulfillment = false;
        return existing;
      }

      if (existing.orderStatus !== OrderStatus.PENDING) {
        throw new BadRequestException('Order cannot be placed in its current state');
      }

      const cart = await this.cartService.getActiveCartEntity(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');
      if (cart.id !== params.cartId) {
        throw new BadRequestException('Invalid cart id');
      }

      const items = existing.items ?? [];
      if (!items.length) {
        throw new BadRequestException('Order has no items');
      }

      for (const item of items) {
        const variant = await manager.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
        });
        if (!variant) {
          throw new BadRequestException(`Variant not found for SKU ${item.sku}`);
        }
        const decrementQb = manager
          .getRepository(ProductVariantEntity)
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ stock: () => `"stock" - ${item.quantity}` })
          .where('id = :id', { id: item.variantId });

        if (STOCK_VALIDATION_ENABLED) {
          decrementQb.andWhere('stock >= :quantity', { quantity: item.quantity });
        }

        const decrement = await decrementQb.execute();
        if (STOCK_VALIDATION_ENABLED && decrement.affected !== 1) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
      }

      if (existing.couponId) {
        const appliedCoupon = await this.couponCheckoutService.findById(existing.couponId);
        if (!appliedCoupon) {
          throw new BadRequestException('Applied coupon is no longer available');
        }

        await this.couponCheckoutService.validateCoupon(appliedCoupon, {
          userId,
          subtotal: parseFloat(existing.subtotal),
          items: items.map((item) => ({
            id: item.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            sku: item.sku,
            variantLabel: item.variantName,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            mrp: null,
            totalPrice: parseFloat(item.totalPrice),
            stock: 0,
            inStock: true,
            isAvailable: true,
            primaryImageUrl: null,
            productDetails: [],
            categoryId: item.product?.categoryId ?? '',
            subCategoryId: item.product?.subCategoryId ?? null,
            subSubCategoryId: item.product?.subSubCategoryId ?? null,
            subSubSubCategoryId: item.product?.subSubSubCategoryId ?? null,
            brandId: item.product?.brandId ?? null,
            isSubscription: item.isSubscription,
            frequency: item.frequency ?? null,
            lineType: item.isSubscription ? 'SUBSCRIPTION' : 'ONE_TIME',
          })),
          manager,
        });

        await this.couponCheckoutService.incrementUsage(
          {
            couponId: appliedCoupon.id,
            userId,
            orderId: existing.id,
            discountAmount: parseFloat(existing.discountAmount),
          },
          manager,
        );
      }

      await this.cartItemsRepository.clearByCartId(cart.id, manager);
      if (cart.couponId) {
        await this.cartsRepository.updateById(
          cart.id,
          { couponId: null, updatedBy: userId },
          manager,
        );
      }

      await this.ordersRepository.updateById(
        existing.id,
        {
          paymentMethod: params.paymentMethod,
          paymentStatus: params.paymentStatus,
          orderStatus: OrderStatus.CONFIRMED,
          notes: params.notes ?? existing.notes,
          placedAt: new Date(),
          updatedBy: userId,
        },
        manager,
      );

      const confirmed = await this.ordersRepository.findByIdAndUserId(existing.id, userId, manager);
      if (!confirmed) throw new NotFoundException('Order not found after confirmation');

      if (params.paymentMethod === OrderPaymentMethod.COD) {
        await this.createCodPaymentRequestForAdminList(
          {
            userId,
            addressId: null,
            order: confirmed,
            items: confirmed.items ?? [],
            orderSource: confirmed.orderSource,
            couponCode: confirmed.couponCode,
          },
          manager,
        );
      }

      this.logger.log(
        {
          orderId: confirmed.id,
          orderNumber: confirmed.orderNumber,
          userId,
          paymentMethod: confirmed.paymentMethod,
          paymentStatus: confirmed.paymentStatus,
          orderStatus: confirmed.orderStatus,
        },
        'Draft order confirmed successfully',
      );
      return confirmed;
    });

    if (shouldPushFulfillment) {
      await this.notifyOrderPlacedSafely(order, 'gokwik-place-order');
      await this.kickoffFulfillment(order.id, order.orderNumber, 'gokwik-place-order');
    }

    return order;
  }

  /**
   * BOB / BusinessOnBot draft: PENDING order that is not treated as a real order.
   * No stock decrement, cart clear, or fulfillment.
   */
  async createBobDraftOrder(params: {
    userId: string;
    address: {
      recipientName: string;
      phoneNumber: string;
      pincode: string;
      addressLine1: string;
      addressLine2?: string | null;
      city: string;
      state: string;
    };
    items: Array<{
      productId: string;
      variantId: string;
      sku: string;
      productName: string;
      variantName: string | null;
      quantity: number;
      unitPrice: number;
    }>;
    notes?: string | null;
    shippingAmount?: number;
    taxAmount?: number;
    discountAmount?: number;
    grandTotal?: number;
  }): Promise<OrderEntity> {
    if (!params.items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const subtotal = roundMoney(
      params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    );
    const shippingAmount = roundMoney(params.shippingAmount ?? 0);
    const discountAmount = roundMoney(params.discountAmount ?? 0);
    const taxAmount = roundMoney(params.taxAmount ?? 0);
    const grandTotal = roundMoney(
      params.grandTotal ?? Math.max(0, subtotal + shippingAmount + taxAmount - discountAmount),
    );

    return this.dataSource.transaction(async (manager) => {
      const orderRefId = await generateUniqueRefId('order', (candidate) =>
        this.ordersRepository.existsByRefId(candidate),
      );
      const orderNumber = await this.generateOrderNumber();
      const address = params.address;

      const createdOrder = await this.ordersRepository.create(
        {
          refId: orderRefId,
          orderNumber,
          userId: params.userId,
          subtotal: toMoneyString(subtotal),
          discountAmount: toMoneyString(discountAmount),
          shippingAmount: toMoneyString(shippingAmount),
          handlingAmount: '0.00',
          platformFee: '0.00',
          codCharge: '0.00',
          prepaidDiscount: '0.00',
          grandTotal: toMoneyString(grandTotal),
          paymentMethod: OrderPaymentMethod.COD,
          paymentStatus: OrderPaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING,
          orderSource: OrderSource.BOB,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          pincode: address.pincode,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? null,
          landmark: null,
          city: address.city,
          state: address.state,
          notes: params.notes ?? null,
          placedAt: null,
          createdBy: params.userId,
          updatedBy: params.userId,
        },
        manager,
      );

      const orderItemsPayload: Partial<OrderItemEntity>[] = [];
      for (const item of params.items) {
        const variant = await manager.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
        });
        if (!variant) {
          throw new BadRequestException(`Variant not found for SKU ${item.sku}`);
        }
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
          unitPrice: toMoneyString(item.unitPrice),
          totalPrice: toMoneyString(item.unitPrice * item.quantity),
        });
      }
      await this.orderItemsRepository.createMany(orderItemsPayload, manager);
      const saved = await this.ordersRepository.findByOrderNumber(createdOrder.orderNumber, manager);
      if (!saved) throw new NotFoundException('Draft order not found after create');
      return saved;
    });
  }

  /**
   * BOB / BusinessOnBot place-order: PENDING → PROCESSING.
   * COD: no paymentId. Prepaid: paymentId stored as paid.
   */
  async placeBobOrder(params: {
    orderId: string;
    paymentId?: string | null;
  }): Promise<OrderEntity> {
    let shouldPushFulfillment = true;
    const isPrepaid = Boolean(params.paymentId?.trim());

    const order = await this.dataSource.transaction(async (manager) => {
      const existing =
        (await this.ordersRepository.findByOrderNumber(params.orderId, manager)) ??
        (await this.ordersRepository.findByIdOrRefId(params.orderId));
      if (!existing) {
        throw new BadRequestException('Invalid order id');
      }

      if (
        existing.orderStatus === OrderStatus.PROCESSING ||
        existing.orderStatus === OrderStatus.CONFIRMED
      ) {
        shouldPushFulfillment = false;
        return existing;
      }

      if (existing.orderStatus !== OrderStatus.PENDING) {
        throw new BadRequestException('Order cannot be placed in its current state');
      }

      const items = existing.items ?? [];
      if (!items.length) {
        throw new BadRequestException('Order has no items');
      }

      for (const item of items) {
        const variant = await manager.getRepository(ProductVariantEntity).findOne({
          where: { id: item.variantId },
        });
        if (!variant) {
          throw new BadRequestException(`Variant not found for SKU ${item.sku}`);
        }
        const decrementQb = manager
          .getRepository(ProductVariantEntity)
          .createQueryBuilder()
          .update(ProductVariantEntity)
          .set({ stock: () => `"stock" - ${item.quantity}` })
          .where('id = :id', { id: item.variantId });
        if (STOCK_VALIDATION_ENABLED) {
          decrementQb.andWhere('stock >= :quantity', { quantity: item.quantity });
        }
        const decrement = await decrementQb.execute();
        if (STOCK_VALIDATION_ENABLED && decrement.affected !== 1) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
      }

      const paymentMethod = isPrepaid ? OrderPaymentMethod.RAZORPAY : OrderPaymentMethod.COD;
      const paymentStatus = isPrepaid ? OrderPaymentStatus.PAID : OrderPaymentStatus.PENDING;

      await this.ordersRepository.updateById(
        existing.id,
        {
          paymentMethod,
          paymentStatus,
          orderStatus: OrderStatus.PROCESSING,
          notes: isPrepaid
            ? [existing.notes, `paymentId=${params.paymentId}`].filter(Boolean).join(' | ')
            : existing.notes,
          placedAt: new Date(),
          updatedBy: existing.userId,
        },
        manager,
      );

      const placed = await this.ordersRepository.findByOrderNumber(existing.orderNumber, manager);
      if (!placed) throw new NotFoundException('Order not found after place');

      if (!isPrepaid) {
        await this.createCodPaymentRequestForAdminList(
          {
            userId: placed.userId,
            addressId: null,
            order: placed,
            items: placed.items ?? [],
            orderSource: OrderSource.BOB,
            couponCode: placed.couponCode,
          },
          manager,
        );
      }

      return placed;
    });

    if (shouldPushFulfillment) {
      await this.notifyOrderPlacedSafely(order, 'bob-place-order');
      await this.kickoffFulfillment(order.id, order.orderNumber, 'bob-place-order');
    }

    return (await this.ordersRepository.findByOrderNumber(order.orderNumber)) ?? order;
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
    const shipments = await this.shipmentsRepository.findByOrderIds(data.map((order) => order.id));
    const shipmentByOrderId = new Map(shipments.map((shipment) => [shipment.orderId, shipment]));
    const mapped = await Promise.all(
      data.map((order) => {
        const shipment = shipmentByOrderId.get(order.id) ?? null;
        return mapOrderToResponse(
          {
            ...order,
            shipment,
            shipwayStatus: Boolean(shipment?.shipwayRawStatus || shipment?.awbNumber),
          },
          this.storageUrlEnricher,
        );
      }),
    );
    return buildPaginatedResult(mapped, total, { page, limit, sortOrder: 'DESC' });
  }

  /** Whether the user has purchased the given product (non-cancelled order). */
  userHasOrderedProduct(userId: string, productId: string): Promise<boolean> {
    return this.ordersRepository.userHasOrderedProduct(userId, productId);
  }

  async findAllForAdmin(query: AdminOrderQueryDto) {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.ordersRepository.findAllPaginated({
      page: paginationOptions.page,
      limit: paginationOptions.limit,
      search: paginationOptions.search,
      orderStatus: query.orderStatus,
      paymentStatus: query.paymentStatus,
      paymentMethod: query.paymentMethod,
      orderSource: query.orderSource,
      userId: query.customerId,
      fromDate: query.fromDate,
      toDate: query.toDate,
      sortBy: query.sortBy,
      sortOrder: paginationOptions.sortOrder,
    });

    const mapped = await Promise.all(
      data.map((order) => mapOrderToAdminResponse(order, this.storageUrlEnricher)),
    );
    return buildPaginatedResult(mapped, total, paginationOptions);
  }

  async findOneForAdmin(idOrRefId: string) {
    const order = await this.ordersRepository.findByIdOrRefId(idOrRefId);
    if (!order) {
      throw new NotFoundException(`Order ${idOrRefId} not found`);
    }

    const { shipment, shipwayStatus } = await this.shippingService.resolveShipmentForOrder(
      order.id,
      order.orderNumber,
    );
    const shipmentResponse = shipment
      ? mapShipmentToResponse(shipment, {
          shipwayStatus,
          orderStatus: order.orderStatus,
        })
      : mapDefaultShipmentResponse(order);

    return mapOrderToAdminResponse(
      { ...order, shipment, shipmentResponse, shipwayStatus },
      this.storageUrlEnricher,
    );
  }

  async findOne(userId: string, id: string) {
    const order = await this.ordersRepository.findByIdAndUserId(id, userId);
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    const { shipment, shipwayStatus } = await this.shippingService.resolveShipmentForOrder(
      id,
      order.orderNumber,
    );
    const shipmentResponse = shipment
      ? mapShipmentToResponse(shipment, {
          shipwayStatus,
          orderStatus: order.orderStatus,
        })
      : mapDefaultShipmentResponse(order);

    return mapOrderToResponse(
      { ...order, shipment, shipmentResponse, shipwayStatus },
      this.storageUrlEnricher,
    );
  }

  /**
   * Re-add items from a past order into the user's active cart (current prices/stock).
   */
  async reorder(userId: string, orderId: string) {
    const order = await this.ordersRepository.findByIdAndUserId(orderId, userId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    if (!order.items?.length) {
      throw new BadRequestException('Order has no items to reorder');
    }

    return this.cartService.addItems(
      userId,
      order.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        productName: item.productName,
      })),
    );
  }

  async cancel(userId: string, id: string, dto: CancelOrderDto) {
    const reason = this.requireCancelReason(dto);
    await this.executeCancel({ orderId: id, reason, updatedBy: userId, ownerUserId: userId });

    const order = await this.findOne(userId, id);
    await this.eventEmitter.emitAsync(
      EVENTS.ORDER_CANCELLED,
      new OrderCancelledEvent(id, order.orderNumber, reason),
    );
    await this.notifyOrderCancelledSafely(order, reason, 'website-cancel');
    return order;
  }

  /**
   * Admin cancel — same pre-shipping rules as customer cancel.
   * Accepts order UUID or business `refId`. Emits ORDER_CANCELLED for GoKwik notify.
   */
  async cancelForAdmin(idOrRefId: string, dto: CancelOrderDto, adminUserId: string) {
    const reason = this.requireCancelReason(dto);
    const existing = await this.ordersRepository.findByIdOrRefId(idOrRefId);
    if (!existing) {
      throw new NotFoundException(`Order ${idOrRefId} not found`);
    }

    await this.executeCancel({
      orderId: existing.id,
      reason,
      updatedBy: adminUserId,
    });

    const order = await this.findOneForAdmin(existing.id);
    await this.eventEmitter.emitAsync(
      EVENTS.ORDER_CANCELLED,
      new OrderCancelledEvent(existing.id, order.orderNumber, reason),
    );
    await this.notifyOrderCancelledSafely(order, reason, 'admin-cancel');
    return order;
  }

  private requireCancelReason(dto: CancelOrderDto): string {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required');
    }
    return reason;
  }

  private async executeCancel(params: {
    orderId: string;
    reason: string;
    updatedBy: string;
    /** When set, order must belong to this customer (website cancel). */
    ownerUserId?: string;
  }): Promise<void> {
    const { orderId, reason, updatedBy, ownerUserId } = params;

    await this.dataSource.transaction(async (manager) => {
      const qb = manager
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id: orderId });
      if (ownerUserId) {
        qb.andWhere('order.userId = :userId', { userId: ownerUserId });
      }

      const locked = await qb.getOne();
      if (!locked) throw new NotFoundException(`Order ${orderId} not found`);
      if (!isOrderCancellable(locked.orderStatus)) {
        throw new BadRequestException('Orders can only be cancelled before shipping');
      }

      if (
        locked.orderStatus === OrderStatus.CONFIRMED ||
        locked.orderStatus === OrderStatus.PROCESSING
      ) {
        const items = await manager.getRepository(OrderItemEntity).find({
          where: { orderId },
        });
        for (const item of items) {
          await manager
            .getRepository(ProductVariantEntity)
            .createQueryBuilder()
            .update(ProductVariantEntity)
            .set({ stock: () => `"stock" + ${item.quantity}` })
            .where('id = :variantId', { variantId: item.variantId })
            .execute();
        }
        await manager.getRepository(CouponUsageEntity).delete({ orderId });
      }

      await this.ordersRepository.updateById(
        orderId,
        {
      orderStatus: OrderStatus.CANCELLED,
          cancelReason: reason,
          updatedBy,
        },
        manager,
      );
    });
  }

  async createOrderFromSubscription(params: {
    customerId: string;
    addressId: string;
    subscriptionId: string;
    subscriptionRefId: string;
    subtotal: string;
    discountAmount: string;
    shippingAmount: string;
    handlingAmount?: string;
    prepaidDiscount?: string;
    grandTotal: string;
    notes: string | null;
    paymentMethod?: OrderPaymentMethod;
    orderSource?: OrderSource;
    createdBy?: string;
    platformFee?: string;
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    }>;
  }) {
    const order = await this.dataSource.transaction(async (manager) => {
      const addressRepository = manager.getRepository(UserAddressEntity);
      const address = await addressRepository.findOne({
        where: { id: params.addressId, userId: params.customerId },
      });
      if (!address) {
        throw new BadRequestException('Selected subscription address was not found');
      }

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
          handlingAmount: params.handlingAmount ?? '0.00',
          platformFee: params.platformFee ?? '0.00',
          codCharge: '0.00',
          prepaidDiscount: params.prepaidDiscount ?? '0.00',
          grandTotal: params.grandTotal,
          paymentMethod: params.paymentMethod ?? OrderPaymentMethod.RAZORPAY,
          paymentStatus: OrderPaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          orderSource: params.orderSource ?? OrderSource.WEBSITE,
          subscriptionId: params.subscriptionId,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          pincode: address.pincode,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? null,
          landmark: address.landmark ?? null,
          city: address.city,
          state: address.state,
          notes:
            params.notes ??
            `Generated from product subscription ${params.subscriptionRefId}`,
          placedAt: new Date(),
          createdBy: params.createdBy ?? 'subscription-webhook',
          updatedBy: params.createdBy ?? 'subscription-webhook',
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
        if (STOCK_VALIDATION_ENABLED && variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
        await manager
          .getRepository(ProductVariantEntity)
          .update({ id: item.variantId }, { stock: variant.stock - item.quantity });
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
          isSubscription: !!item.isSubscription,
          frequency: item.isSubscription ? item.frequency ?? null : null,
          subscriptionId: params.subscriptionId,
          createdBy: params.createdBy ?? 'subscription-webhook',
          updatedBy: params.createdBy ?? 'subscription-webhook',
        });
      }

      await this.orderItemsRepository.createMany(orderItemsPayload, manager);

      const order = await this.ordersRepository.findByIdAndUserId(
        createdOrder.id,
        params.customerId,
        manager,
      );
      if (!order) throw new NotFoundException('Order not found after creation');
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          subscriptionId: params.subscriptionId,
          customerId: params.customerId,
        },
        'Subscription order creation transaction completed',
      );
      return order;
    });

    await this.notifyOrderPlacedSafely(order, 'subscription-order');
    await this.kickoffFulfillment(order.id, order.orderNumber, 'subscription-order');

    return (await this.ordersRepository.findByIdAndUserId(order.id, params.customerId)) ?? order;
  }

  async createOrderFromPaymentRequest(params: {
    customerId: string;
    addressId?: string | null;
    paymentRequestId: string;
    paymentRequestRefId: string;
    subtotal: string;
    discountAmount: string;
    shippingAmount: string;
    handlingAmount?: string;
    prepaidDiscount?: string;
    grandTotal: string;
    notes: string | null;
    paymentMethod?: OrderPaymentMethod;
    orderSource?: OrderSource;
    createdBy?: string;
    couponId?: string | null;
    couponCode?: string | null;
    couponTitle?: string | null;
    couponDiscountType?: string | null;
    platformFee?: string;
    codCharge?: string;
    items: Array<{
      productId: string;
      variantId: string;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      isSubscription?: boolean;
      frequency?: ProductSubscriptionFrequency | null;
    }>;
  }) {
    const order = await this.dataSource.transaction(async (manager) => {
      const addressRepository = manager.getRepository(UserAddressEntity);
      const address = params.addressId
        ? await addressRepository.findOne({
            where: { id: params.addressId, userId: params.customerId },
          })
        : await addressRepository.findOne({
        where: { userId: params.customerId, isDefault: true },
        order: { updatedAt: 'DESC' },
      });
      if (!address) {
        throw new BadRequestException(
          params.addressId
            ? 'Selected checkout address was not found'
            : 'A default delivery address is required for this legacy payment request',
        );
      }

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
          handlingAmount: params.handlingAmount ?? '0.00',
          platformFee: params.platformFee ?? '0.00',
          codCharge: params.codCharge ?? '0.00',
          prepaidDiscount: params.prepaidDiscount ?? '0.00',
          grandTotal: params.grandTotal,
          couponId: params.couponId ?? null,
          couponCode: params.couponCode ?? null,
          couponTitle: params.couponTitle ?? null,
          couponDiscountType: params.couponDiscountType ?? null,
          paymentMethod: params.paymentMethod ?? OrderPaymentMethod.RAZORPAY,
          paymentStatus: OrderPaymentStatus.PAID,
          orderStatus: OrderStatus.CONFIRMED,
          orderSource: params.orderSource ?? OrderSource.WEBSITE,
          recipientName: address.recipientName,
          phoneNumber: address.phoneNumber,
          pincode: address.pincode,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? null,
          landmark: address.landmark ?? null,
          city: address.city,
          state: address.state,
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
        if (STOCK_VALIDATION_ENABLED && variant.stock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for SKU ${variant.sku}`);
        }
        await manager
          .getRepository(ProductVariantEntity)
          .update({ id: item.variantId }, { stock: variant.stock - item.quantity });
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
          isSubscription: !!item.isSubscription,
          frequency: item.isSubscription ? item.frequency ?? null : null,
          createdBy: 'razorpay-webhook',
          updatedBy: 'razorpay-webhook',
        });
      }

      await this.orderItemsRepository.createMany(orderItemsPayload, manager);

      if (params.couponId && params.couponCode) {
        await this.couponCheckoutService.incrementUsage(
          {
            couponId: params.couponId,
            userId: params.customerId,
            orderId: createdOrder.id,
            discountAmount: parseFloat(params.discountAmount),
          },
          manager,
        );
      }

      const order = await this.ordersRepository.findByIdAndUserId(
        createdOrder.id,
        params.customerId,
        manager,
      );
      if (!order) throw new NotFoundException('Order not found after creation');
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, customerId: params.customerId },
        'Payment request order creation transaction completed',
      );
      return order;
    });

    await this.notifyOrderPlacedSafely(order, 'payment-request-order');
    await this.kickoffFulfillment(order.id, order.orderNumber, 'payment-request-order');

    return (await this.ordersRepository.findByIdAndUserId(order.id, params.customerId)) ?? order;
  }

  /**
   * Mirror COD orders into payment_requests so they appear on GET /admin/payment-requests
   * (same admin "order list" used for prepaid payment requests).
   */
  private async createCodPaymentRequestForAdminList(
    params: {
      userId: string;
      addressId: string | null;
      order: Pick<
        OrderEntity,
        | 'id'
        | 'orderNumber'
        | 'subtotal'
        | 'discountAmount'
        | 'shippingAmount'
        | 'handlingAmount'
        | 'platformFee'
        | 'codCharge'
        | 'grandTotal'
        | 'notes'
      >;
      summary?: CheckoutSummary;
      items?: OrderItemEntity[];
      orderSource: OrderSource;
      couponCode: string | null;
    },
    manager: EntityManager,
  ): Promise<void> {
    const paymentRequestRepo = manager.getRepository(PaymentRequestEntity);
    const paymentRequestItemRepo = manager.getRepository(PaymentRequestItemEntity);

    const alreadyMirrored = await paymentRequestRepo.exists({
      where: {
        paymentProvider: 'COD',
        paymentReference: params.order.orderNumber,
      },
    });
    if (alreadyMirrored) {
      return;
    }

    const lineItems =
      params.summary?.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: toMoneyString(item.unitPrice),
        total: toMoneyString(item.totalPrice),
      })) ??
      (params.items ?? []).map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.totalPrice,
      }));

    if (!lineItems.length) {
      this.logger.warn(
        { orderId: params.order.id, orderNumber: params.order.orderNumber },
        'Skipped COD payment-request mirror — order has no items',
      );
      return;
    }

    const refId = await generateUniqueRefId('pay-request', (candidate) =>
      paymentRequestRepo.exists({ where: { refId: candidate } }),
    );

    const created = await paymentRequestRepo.save(
      paymentRequestRepo.create({
        refId,
        customerId: params.userId,
        addressId: params.addressId,
        status: PaymentRequestStatus.PAYMENT_PENDING,
        subtotal: params.order.subtotal,
        discount: params.order.discountAmount,
        tax: '0.00',
        shipping: params.order.shippingAmount,
        handling: params.order.handlingAmount,
        platformFee: params.order.platformFee,
        codCharge: params.order.codCharge,
        totalAmount: params.order.grandTotal,
        couponCode: params.couponCode,
        couponDiscount: params.order.discountAmount,
        currency: 'INR',
        notes: params.order.notes ?? `COD order ${params.order.orderNumber}`,
        orderSource: params.orderSource,
        paymentProvider: 'COD',
        paymentLink: null,
        providerReferenceId: params.order.orderNumber,
        paymentReference: params.order.orderNumber,
        expiresAt: null,
        paidAt: null,
        createdBy: params.userId,
        updatedBy: params.userId,
      }),
    );

    const itemRows = [];
    for (const item of lineItems) {
      const itemRefId = await generateUniqueRefId('pay-item', (candidate) =>
        paymentRequestItemRepo.exists({ where: { refId: candidate } }),
      );
      itemRows.push(
        paymentRequestItemRepo.create({
          refId: itemRefId,
          paymentRequestId: created.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: '0.00',
          tax: '0.00',
          total: item.total,
          createdBy: params.userId,
          updatedBy: params.userId,
        }),
      );
    }
    await paymentRequestItemRepo.save(itemRows);

    this.logger.log(
      {
        orderId: params.order.id,
        orderNumber: params.order.orderNumber,
        paymentRequestId: created.id,
        paymentRequestRefId: created.refId,
      },
      'COD order mirrored to payment_requests for admin list',
    );
  }

  /**
   * Post-payment / post-place fulfillment:
   * 1) Enqueue UniCommerce sale-order push (async BullMQ)
   * 2) Push order to Shipway (sync) for AWB / tracking
   *
   * These are independent Cureka integrations — Shipway is NOT connected through UniCommerce.
   * UC job may still be running after Shipway returns (queue worker).
   */
  private async kickoffFulfillment(
    orderId: string,
    orderNumber: string,
    source: string,
  ): Promise<void> {
    this.logger.log(
      {
        orderId,
        orderNumber,
        source,
        sequence: ['unicommerce-enqueue', 'shipway-push'],
        note: 'Shipway and UniCommerce are independent; Cureka talks to both separately',
      },
      '[FULFILLMENT] Kickoff after order confirm — UniCommerce enqueue then Shipway push',
    );

    await this.enqueueUnicommercePush(orderId, orderNumber, source);
    await this.pushOrderToShipwaySafely(orderId, orderNumber, source);

    this.logger.log(
      { orderId, orderNumber, source },
      '[FULFILLMENT] Kickoff finished (UC queued; Shipway sync attempt done)',
    );
  }

  private async enqueueUnicommercePush(
    orderId: string,
    orderNumber: string,
    source: string,
  ): Promise<void> {
    try {
      const job = await this.unicommerceOrderQueueService.enqueuePushOrder(orderId);
      if (job) {
        this.logger.log(
          { orderId, orderNumber, source, jobId: job.id, step: 'unicommerce-enqueue' },
          '[FULFILLMENT] UniCommerce push job enqueued',
        );
      } else {
        this.logger.warn(
          { orderId, orderNumber, source, step: 'unicommerce-enqueue' },
          '[FULFILLMENT] UniCommerce enqueue returned no job (disabled or duplicate)',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { orderId, orderNumber, source, step: 'unicommerce-enqueue', error: message },
        '[FULFILLMENT] Failed to enqueue UniCommerce push — check Redis (REDIS_HOST, REDIS_TLS)',
      );
    }
  }

  private async notifyOrderPlacedSafely(order: OrderEntity, source: string): Promise<void> {
    const phone = String(order.phoneNumber ?? '').trim();
    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        source,
        hasPhone: Boolean(phone),
        phone: phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : null,
        paymentMethod: order.paymentMethod,
        orderStatus: order.orderStatus,
        grandTotal: order.grandTotal,
      },
      '[OrderNotify] Dispatching order-placed notifications (WhatsApp + MSG91 SMS)',
    );

    try {
      await this.orderNotificationsService.notifyOrderPlacedSafely({
        phoneNumber: order.phoneNumber,
        customerName: order.recipientName,
        orderNumber: order.orderNumber,
        grandTotal: String(order.grandTotal ?? ''),
        paymentMethod: String(order.paymentMethod ?? ''),
        orderStatus: String(order.orderStatus ?? ''),
        source,
      });
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, source },
        '[OrderNotify] Order-placed notification dispatch finished',
      );
    } catch (error) {
      this.logger.error(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        '[OrderNotify] Order-placed notification dispatch crashed (non-blocking)',
      );
    }
  }

  private async notifyOrderCancelledSafely(
    order: {
      id: string;
      orderNumber: string;
      phoneNumber: string;
      recipientName: string;
      grandTotal: string;
      paymentMethod: string;
      orderStatus: string;
    },
    cancelReason: string,
    source: string,
  ): Promise<void> {
    const phone = String(order.phoneNumber ?? '').trim();
    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        source,
        hasPhone: Boolean(phone),
        phone: phone ? `${phone.slice(0, 2)}******${phone.slice(-2)}` : null,
        cancelReason,
      },
      '[OrderNotify] Dispatching order-cancelled notifications (WhatsApp + MSG91 SMS)',
    );

    try {
      await this.orderNotificationsService.notifyOrderCancelledSafely({
        phoneNumber: order.phoneNumber,
        customerName: order.recipientName,
        orderNumber: order.orderNumber,
        grandTotal: String(order.grandTotal ?? ''),
        paymentMethod: String(order.paymentMethod ?? ''),
        orderStatus: String(order.orderStatus ?? OrderStatus.CANCELLED),
        cancelReason,
        source,
      });
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, source },
        '[OrderNotify] Order-cancelled notification dispatch finished',
      );
    } catch (error) {
      this.logger.error(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          source,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        '[OrderNotify] Order-cancelled notification dispatch crashed (non-blocking)',
      );
    }
  }

  private async pushOrderToShipwaySafely(
    orderId: string,
    orderNumber: string,
    source: string,
  ): Promise<void> {
    this.logger.log(
      { orderId, orderNumber, source, step: 'shipway-push' },
      '[FULFILLMENT] Calling Shipway synchronously (independent of UniCommerce)',
    );

    try {
      const shipment = await this.shippingService.pushOrderToShipway(orderId);
      this.logger.log(
        {
          orderId,
          orderNumber,
          source,
          step: 'shipway-push',
          shipmentId: shipment?.id ?? null,
          awbNumber: shipment?.awbNumber ?? null,
          trackingUrl: shipment?.trackingUrl ?? null,
          shipmentStatus: shipment?.shipmentStatus ?? null,
          shipwayRawStatus: shipment?.shipwayRawStatus ?? null,
        },
        '[FULFILLMENT] Shipway synchronous push finished',
      );
    } catch (error) {
      this.logger.error(
        {
          orderId,
          orderNumber,
          source,
          step: 'shipway-push',
          error: this.serializeError(error),
        },
        '[FULFILLMENT] Failed to push order to Shipway after order creation',
      );
    }
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }

  findPaidOrderForSubscriptionAttach(params: {
    userId: string;
    productId: string;
    productVariantId: string;
    orderRef?: string;
  }): Promise<OrderEntity | null> {
    return this.ordersRepository.findPaidForSubscriptionAttach(params);
  }

  async attachSubscriptionIdToOrder(
    orderId: string,
    subscriptionId: string,
    actor: string,
  ): Promise<void> {
    await this.ordersRepository.updateById(orderId, {
      subscriptionId,
      updatedBy: actor,
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
