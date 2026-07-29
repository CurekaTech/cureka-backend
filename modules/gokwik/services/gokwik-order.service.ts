import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { CartService } from '@modules/orders/services/cart.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { UserAddressEntity } from '@modules/users/entities/user-address.entity';
import { UserAddressType } from '@modules/users/enums/user-address-type.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { DataSource } from 'typeorm';
import { GokwikCheckOrderExistsDto } from '../dto/gokwik-check-order-exists.dto';
import { GokwikOrderEntity } from '../entities/gokwik-order.entity';
import {
  GokwikAddressDto,
  GokwikCreateOrderDto,
  GokwikCreateOrderMetaDataDto,
  GokwikPaymentDetailsDto,
} from '../dto/gokwik-create-order.dto';
import { GokwikPlaceOrderDto } from '../dto/gokwik-place-order.dto';
import {
  GokwikCheckOrderExistsResponse,
  GokwikCreateOrderResponse,
  GokwikPlaceOrderResponse,
} from '../interfaces/gokwik-order.interface';
import { GokwikRepository } from '../repositories/gokwik.repository';

@Injectable()
export class GokwikOrderService {
  private readonly logger = new Logger(GokwikOrderService.name);

  constructor(
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly userAddressesService: UserAddressesService,
    private readonly gokwikRepository: GokwikRepository,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    const cartId = dto.cart_id?.trim();
    if (!cartId) {
      throw new BadRequestException('Invalid cart id');
    }

    return this.withCartLock(cartId, async () => {
      const existing = await this.gokwikRepository.findOrderByCartId(cartId);
      if (existing?.order) {
        return { status: 'success', order_id: existing.order.orderNumber };
      }

      const cart = await this.cartService.findActiveCartById(cartId);
      if (!cart) {
        throw new BadRequestException('Invalid cart id');
      }

      const customerPhone = parseIndianMobileNumber(dto.customer_phone);
      await this.applyGokwikDiscount(cart.userId, cart.coupon?.code ?? null, dto.meta_data);
      const pricedCart = await this.cartService.getCartById(cartId);
      this.assertPaymentTotal(dto.payment_details, dto.meta_data, pricedCart.grandTotal);
      this.assertDiscountTotal(dto.meta_data, pricedCart.discountAmount);
      const shippingAddress = this.mapShippingAddress(dto.shipping_address);
      const address = await this.findOrCreateAddress(cart.userId, shippingAddress);
      const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);

      const order = await this.ordersService.createDraftOrderFromCart(cart.userId, {
        cartId,
        addressId: address.id,
        paymentMethod,
        paymentStatus,
        notes: null,
        orderSource: OrderSource.GOKWIK,
        ignorePaymentMethodPricing: true,
      });

      this.assertPaymentTotal(dto.payment_details, dto.meta_data, Number(order.grandTotal));
      this.assertDiscountTotal(dto.meta_data, Number(order.discountAmount));

      try {
        await this.gokwikRepository.createOrderLink({
          orderId: order.id,
          cartId,
          gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || null,
          paymentId: this.normalizeOptionalIdentifier(dto.payment_details.payment_id),
          gatewayTransactionId: this.normalizeOptionalIdentifier(dto.payment_details.pg_payment_trnx_id),
          paymentMethod: dto.payment_details.payment_method,
          paymentAmount: dto.payment_details.payment_amount.toFixed(2),
          prepaidAmount: (dto.meta_data?.ppcod?.prepaid_amount ?? 0).toFixed(2),
          payableOnDelivery: (dto.meta_data?.ppcod?.payable_on_delivery ?? 0).toFixed(2),
          customerPhone,
          metadata: {
            rto_risk_flag: dto.meta_data?.rto_risk_flag,
          },
          createdBy: 'gokwik',
          updatedBy: 'gokwik',
        });
      } catch (error) {
        const concurrent = await this.gokwikRepository.findOrderByCartId(cartId);
        if (concurrent?.order) {
          return { status: 'success', order_id: concurrent.order.orderNumber };
        }
        throw error;
      }

      return {
        status: 'success',
        order_id: order.orderNumber,
      };
    });
  }

  async placeOrder(dto: GokwikPlaceOrderDto): Promise<GokwikPlaceOrderResponse> {
    const cartId = dto.cart_id?.trim();
    if (!cartId) {
      throw new BadRequestException('Invalid cart id');
    }

    return this.withCartLock(cartId, async () => {
      const cart = await this.cartService.findActiveCartById(cartId);
      if (!cart) {
        const completed = await this.gokwikRepository.findOrderByCartId(cartId);
        const completedOrderId = String(dto.order_id ?? '').trim();
        if (completed?.order && (!completedOrderId || completed.order.orderNumber === completedOrderId)) {
          return {
            status: 'success',
            order_id: completed.order.orderNumber,
            thankyou_redirect_url: this.buildThankYouUrl(completed.order.orderNumber),
          };
        }
        throw new BadRequestException('Invalid cart id');
      }

      const customerPhone = parseIndianMobileNumber(dto.customer_phone);
      const link = await this.gokwikRepository.findOrderByCartId(cartId);
      const requestOrderId = String(dto.order_id ?? '').trim();
      if (
        !link?.order ||
        (requestOrderId && link.order.orderNumber !== requestOrderId)
      ) {
        throw new BadRequestException('Invalid order id for this checkout session');
      }

      this.assertPaymentTotal(dto.payment_details, dto.meta_data, Number(link.order.grandTotal));
      const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);

      await this.gokwikRepository.updateOrderLink(link.id, {
        gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || link.gokwikOrderId,
        paymentId: this.normalizeOptionalIdentifier(dto.payment_details.payment_id),
        gatewayTransactionId: this.normalizeOptionalIdentifier(dto.payment_details.pg_payment_trnx_id),
        paymentMethod: dto.payment_details.payment_method,
        paymentAmount: dto.payment_details.payment_amount.toFixed(2),
        prepaidAmount: (dto.meta_data?.ppcod?.prepaid_amount ?? 0).toFixed(2),
        payableOnDelivery: (dto.meta_data?.ppcod?.payable_on_delivery ?? 0).toFixed(2),
        customerPhone,
        metadata: {
          ...link.metadata,
          rto_risk_flag: dto.meta_data?.rto_risk_flag,
          utm_details: dto.utm_details,
        },
        updatedBy: 'gokwik',
      });

      const order = await this.ordersService.confirmDraftOrder(cart.userId, {
        orderNumber: link.order.orderNumber,
        cartId,
        paymentMethod,
        paymentStatus,
        notes: dto.order_note?.trim() || null,
      });

      return {
        status: 'success',
        order_id: order.orderNumber,
        thankyou_redirect_url: this.buildThankYouUrl(order.orderNumber),
      };
    });
  }

  /**
   * Failsafe for GoKwik order-retry / auto-refund: returns whether an order
   * already exists for this merchant checkout session (cart id).
   * When GoKwik omits session_key it falls back to customer_phone lookup.
   */
  async checkOrderExists(dto: GokwikCheckOrderExistsDto): Promise<GokwikCheckOrderExistsResponse> {
    const sessionKey = String(dto.session_key ?? '').trim();
    const rawPhone = dto.customer_phone ?? dto.user_phone ?? '';
    const customerPhone = parseIndianMobileNumber(rawPhone) ?? '';
    this.logger.log(
      `[checkOrderExists] session_key="${sessionKey}" customer_phone_raw="${rawPhone}" customer_phone_parsed="${customerPhone}" customer_email="${dto.customer_email ?? dto.user_email ?? ''}"`,
    );

    let link: GokwikOrderEntity | null = null;

    if (sessionKey) {
      link = await this.gokwikRepository.findOrderByCartId(sessionKey);
      this.logger.log(
        `[checkOrderExists] lookup=by_session_key result=${link ? `id=${link.id} orderId=${link.orderId}` : 'NOT FOUND'}`,
      );
    } else if (customerPhone) {
      link = await this.gokwikRepository.findLatestOrderByCustomerPhone(customerPhone);
      this.logger.log(
        `[checkOrderExists] lookup=by_phone("${customerPhone}") result=${link ? `id=${link.id} orderId=${link.orderId}` : 'NOT FOUND'}`,
      );
    } else {
      this.logger.warn('[checkOrderExists] Both session_key and customer_phone are empty → No order found');
      return { message: 'No order found.' };
    }

    const order = link?.order;
    this.logger.log(
      `[checkOrderExists] order=${order ? `orderNumber=${order.orderNumber} status=${order.orderStatus}` : 'NOT FOUND'}`,
    );

    if (!order || order.orderStatus === OrderStatus.CANCELLED) {
      this.logger.warn(
        `[checkOrderExists] Returning "No order found." — order=${order?.orderNumber ?? 'null'} status=${order?.orderStatus ?? 'null'}`,
      );
      return { message: 'No order found.' };
    }

    this.logger.log(
      `[checkOrderExists] Returning "Order exists." — orderNumber=${order.orderNumber} status=${order.orderStatus}`,
    );
    return {
      order_id: order.orderNumber,
      message: 'Order exists.',
    };
  }

  private mapShippingAddress(address: GokwikAddressDto) {
    const recipientName = `${address.first_name} ${address.last_name}`.trim();
    return {
      recipientName,
      phoneNumber: parseIndianMobileNumber(address.phone),
      pincode: address.pincode.trim(),
      addressLine1: address.address.trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      addressType: UserAddressType.OTHER,
      isDefault: false,
    };
  }

  private mapPayment(payment: GokwikPaymentDetailsDto): {
    paymentMethod: OrderPaymentMethod;
    paymentStatus: OrderPaymentStatus;
  } {
    if (payment.payment_method === 'cod') {
      return {
        paymentMethod: OrderPaymentMethod.COD,
        paymentStatus: OrderPaymentStatus.PENDING,
      };
    }

    if (payment.payment_method === 'pp-cod') {
      return {
        paymentMethod: OrderPaymentMethod.GOKWIK_PARTIAL_COD,
        paymentStatus: OrderPaymentStatus.PARTIALLY_PAID,
      };
    }

    return {
      paymentMethod: OrderPaymentMethod.GOKWIK_PREPAID,
      paymentStatus: OrderPaymentStatus.PAID,
    };
  }

  private async findOrCreateAddress(
    userId: string,
    address: ReturnType<GokwikOrderService['mapShippingAddress']>,
  ): Promise<{ id: string }> {
    const repository = this.dataSource.getRepository(UserAddressEntity);
    const existing = await repository.findOne({
      where: {
        userId,
        recipientName: address.recipientName,
        phoneNumber: address.phoneNumber,
        pincode: address.pincode,
        addressLine1: address.addressLine1,
        city: address.city,
        state: address.state,
      },
      order: { updatedAt: 'DESC' },
    });
    if (existing) {
      return existing;
    }
    return this.userAddressesService.create(userId, address);
  }

  private assertPaymentTotal(
    payment: GokwikPaymentDetailsDto,
    meta: GokwikCreateOrderMetaDataDto | undefined,
    expectedTotal: number,
  ): void {
    const equalsMoney = (left: number, right: number) =>
      Math.abs(Math.round(left * 100) - Math.round(right * 100)) <= 1;

    if (!equalsMoney(payment.payment_amount, expectedTotal)) {
      throw new BadRequestException('GoKwik payment amount does not match the order total');
    }

    if (payment.payment_method === 'pp-cod') {
      if (!meta?.ppcod) {
        throw new BadRequestException('ppcod split is required for Partial COD');
      }
      const splitTotal = meta.ppcod.prepaid_amount + meta.ppcod.payable_on_delivery;
      if (!equalsMoney(splitTotal, expectedTotal)) {
        throw new BadRequestException('Partial COD split does not match the order total');
      }
    }
  }

  private async applyGokwikDiscount(
    userId: string,
    currentCouponCode: string | null,
    meta: GokwikCreateOrderMetaDataDto | undefined,
  ): Promise<void> {
    const discounts = (meta?.discounts ?? []).filter((discount) => discount.amount > 0);
    if (discounts.length > 1) {
      throw new BadRequestException('Only one cart coupon can be applied to a Cureka order');
    }
    const discount = discounts[0];
    if (!discount) {
      return;
    }
    const code = discount.code?.trim();
    if (!code) {
      throw new BadRequestException('GoKwik discount code is required for hybrid validation');
    }
    if (currentCouponCode !== code) {
      await this.cartService.applyCoupon(userId, { couponCode: code });
    }
  }

  private normalizeOptionalIdentifier(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  private assertDiscountTotal(
    meta: GokwikCreateOrderMetaDataDto | undefined,
    expectedDiscount: number,
  ): void {
    const reported = (meta?.discounts ?? []).reduce((sum, discount) => sum + discount.amount, 0);
    if (Math.abs(Math.round(reported * 100) - Math.round(expectedDiscount * 100)) > 1) {
      throw new BadRequestException('GoKwik discount does not match Cureka coupon calculation');
    }
  }

  private async withCartLock<T>(cartId: string, work: () => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [cartId]);
      return work();
    });
  }

  private buildThankYouUrl(orderNumber: string): string {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      throw new ServiceUnavailableException('STOREFRONT_URL is required for GoKwik checkout');
    }
    return `${storefrontUrl}/order/confirmation?order_id=${encodeURIComponent(orderNumber)}`;
  }
}
