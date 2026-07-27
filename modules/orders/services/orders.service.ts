import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  STOCK_VALIDATION_ENABLED,
} from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UserAddressEntity } from '@modules/users/entities/user-address.entity';
import { ShippingService } from '@modules/shipping/services/shipping.service';
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
import { CouponCheckoutService } from './coupon-checkout.service';
import { CheckoutService } from './checkout.service';
import { CartService } from './cart.service';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import { UnicommerceOrderQueueService } from '@modules/unicommerce/services/unicommerce-order-queue.service';
import { toMoneyString } from '../utils/money.util';
import { isOrderCancellable } from '../constants/cancellable-order-statuses.constant';

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
    private readonly userAddressesService: UserAddressesService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly shippingService: ShippingService,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly unicommerceOrderQueueService: UnicommerceOrderQueueService,
  ) {}

  checkout(userId: string, dto: CheckoutDto) {
    return this.checkoutService.validateCheckout(userId, dto);
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

    await this.pushOrderToShipwaySafely(order.id, order.orderNumber, 'place-order');
    await this.enqueueUnicommercePush(order.id);
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
      await this.pushOrderToShipwaySafely(order.id, order.orderNumber, 'gokwik-place-order');
      await this.enqueueUnicommercePush(order.id);
    }

    return order;
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
    return mapOrderToAdminResponse(order, this.storageUrlEnricher);
  }

  async findOne(userId: string, id: string) {
    const order = await this.ordersRepository.findByIdAndUserId(id, userId);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    const shipment = await this.shippingService.getShipmentByOrderId(id);
    return mapOrderToResponse({ ...order, shipment }, this.storageUrlEnricher);
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
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Cancellation reason is required');
    }

    await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .andWhere('order.userId = :userId', { userId })
        .getOne();
      if (!locked) throw new NotFoundException(`Order ${id} not found`);
      if (!isOrderCancellable(locked.orderStatus)) {
        throw new BadRequestException('Orders can only be cancelled before shipping');
      }

      if (locked.orderStatus === OrderStatus.CONFIRMED || locked.orderStatus === OrderStatus.PROCESSING) {
        const items = await manager.getRepository(OrderItemEntity).find({ where: { orderId: id } });
        for (const item of items) {
          await manager
            .getRepository(ProductVariantEntity)
            .createQueryBuilder()
            .update(ProductVariantEntity)
            .set({ stock: () => `"stock" + ${item.quantity}` })
            .where('id = :variantId', { variantId: item.variantId })
            .execute();
        }
        await manager.getRepository(CouponUsageEntity).delete({ orderId: id });
      }

      await this.ordersRepository.updateById(
        id,
        {
          orderStatus: OrderStatus.CANCELLED,
          cancelReason: reason,
          updatedBy: userId,
        },
        manager,
      );
    });
    return this.findOne(userId, id);
  }

  async createOrderFromPaymentRequest(params: {
    customerId: string;
    addressId?: string | null;
    paymentRequestId: string;
    paymentRequestRefId: string;
    subtotal: string;
    discountAmount: string;
    shippingAmount: string;
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
          handlingAmount: '0',
          platformFee: params.platformFee ?? '0.00',
          codCharge: params.codCharge ?? '0.00',
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

    await this.pushOrderToShipwaySafely(order.id, order.orderNumber, 'payment-request-order');
    await this.enqueueUnicommercePush(order.id);

    return (await this.ordersRepository.findByIdAndUserId(order.id, params.customerId)) ?? order;
  }

  private async enqueueUnicommercePush(orderId: string): Promise<void> {
    try {
      const job = await this.unicommerceOrderQueueService.enqueuePushOrder(orderId);
      if (job) {
        this.logger.log(
          { orderId, jobId: job.id },
          'UniCommerce push job enqueued after order creation',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { orderId, error: message },
        'Failed to enqueue UniCommerce push — check Redis connection (REDIS_HOST, REDIS_TLS, etc.)',
      );
    }
  }

  private async pushOrderToShipwaySafely(
    orderId: string,
    orderNumber: string,
    source: string,
  ): Promise<void> {
    this.logger.log(
      { orderId, orderNumber, source },
      'Calling Shipway synchronously after order creation',
    );

    try {
      const shipment = await this.shippingService.pushOrderToShipway(orderId);
      this.logger.log(
        {
          orderId,
          orderNumber,
          source,
          shipmentId: shipment?.id ?? null,
          awbNumber: shipment?.awbNumber ?? null,
          trackingUrl: shipment?.trackingUrl ?? null,
          shipmentStatus: shipment?.shipmentStatus ?? null,
        },
        'Shipway synchronous push finished',
      );
    } catch (error) {
      this.logger.error(
        {
          orderId,
          orderNumber,
          source,
          error: this.serializeError(error),
        },
        'Failed to push order to Shipway after order creation',
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
