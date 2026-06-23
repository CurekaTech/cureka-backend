import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { buildPaginatedResult, generateUniqueRefId } from '@packages/common';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { CartItemsRepository } from '../repositories/cart-items.repository';
import { OrderItemsRepository } from '../repositories/order-items.repository';
import { OrdersRepository } from '../repositories/orders.repository';
import { CheckoutDto } from '../dto/checkout.dto';
import { OrderQueryDto, PlaceOrderDto } from '../dto/order.dto';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderStatus } from '../enums/order-status.enum';
import { CheckoutService } from './checkout.service';
import { CartService } from './cart.service';

@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly orderItemsRepository: OrderItemsRepository,
    private readonly cartItemsRepository: CartItemsRepository,
    private readonly cartService: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly userAddressesService: UserAddressesService,
  ) {}

  checkout(userId: string, dto: CheckoutDto) {
    return this.checkoutService.validateCheckout(userId, dto);
  }

  async placeOrder(userId: string, dto: PlaceOrderDto) {
    const address = await this.userAddressesService.findOne(userId, dto.addressId);
    const summary = await this.checkoutService.validateCheckout(userId, { addressId: dto.addressId });

    if (!summary.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    return this.dataSource.transaction(async (manager) => {
      const cart = await this.cartService.getActiveCartEntity(userId, manager);
      if (!cart) throw new BadRequestException('Cart not found');

      const orderRefId = await generateUniqueRefId('order', (candidate) =>
        this.ordersRepository.existsByRefId(candidate),
      );
      const orderNumber = await this.generateOrderNumber();

      const createdOrder = await this.ordersRepository.create(
        {
          refId: orderRefId,
          orderNumber,
          userId,
          subtotal: summary.subtotal.toFixed(2),
          discountAmount: summary.discountAmount.toFixed(2),
          shippingAmount: summary.shippingAmount.toFixed(2),
          grandTotal: summary.grandTotal.toFixed(2),
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
      await this.cartItemsRepository.clearByCartId(cart.id, manager);

      const order = await this.ordersRepository.findByIdAndUserId(createdOrder.id, userId);
      if (!order) throw new NotFoundException('Order not found after creation');
      return order;
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
    return buildPaginatedResult(data, total, { page, limit, sortOrder: 'DESC' });
  }

  async findOne(userId: string, id: string) {
    const order = await this.ordersRepository.findByIdAndUserId(id, userId);
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
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
