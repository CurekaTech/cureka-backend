import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { CartService } from '@modules/orders/services/cart.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { UserAddressType } from '@modules/users/enums/user-address-type.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { GokwikCheckOrderExistsDto } from '../dto/gokwik-check-order-exists.dto';
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

@Injectable()
export class GokwikOrderService {
  constructor(
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly userAddressesService: UserAddressesService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    const cartId = dto.cart_id?.trim();
    if (!cartId) {
      throw new BadRequestException('Invalid cart id');
    }

    if (!dto.shipping_address) {
      throw new BadRequestException('shipping_address is required');
    }

    const cart = await this.cartService.findActiveCartById(cartId);
    if (!cart) {
      throw new BadRequestException('Invalid cart id');
    }

    const userId = cart.userId;
    const address = await this.userAddressesService.create(
      userId,
      this.mapShippingAddress(dto.shipping_address),
    );

    const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);
    const notes = this.buildNotes({
      cartId,
      payment: dto.payment_details,
      meta: dto.meta_data,
      customerPhone: dto.customer_phone,
    });

    const order = await this.ordersService.createDraftOrderFromCart(userId, {
      cartId,
      addressId: address.id,
      paymentMethod,
      paymentStatus,
      notes,
      orderSource: OrderSource.WEBSITE,
    });

    return {
      status: 'success',
      order_id: order.orderNumber,
    };
  }

  async placeOrder(dto: GokwikPlaceOrderDto): Promise<GokwikPlaceOrderResponse> {
    const cartId = dto.cart_id?.trim();
    if (!cartId) {
      throw new BadRequestException('Invalid cart id');
    }

    const cart = await this.cartService.findActiveCartById(cartId);
    if (!cart) {
      throw new BadRequestException('Invalid cart id');
    }

    const userId = cart.userId;
    const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);
    const notes = this.buildNotes({
      cartId,
      payment: dto.payment_details,
      meta: dto.meta_data,
      customerPhone: dto.customer_phone,
      orderNote: dto.order_note,
      userAgent: dto.user_agent,
      userDetails: dto.user_details,
      utmDetails: dto.utm_details,
    });

    let orderNumber = dto.order_id?.trim() || '';

    if (!orderNumber) {
      if (!dto.shipping_address) {
        throw new BadRequestException('shipping_address is required when order_id is missing');
      }

      const address = await this.userAddressesService.create(
        userId,
        this.mapShippingAddress(dto.shipping_address),
      );

      const draft = await this.ordersService.createDraftOrderFromCart(userId, {
        cartId,
        addressId: address.id,
        paymentMethod,
        paymentStatus,
        notes,
        orderSource: OrderSource.WEBSITE,
      });
      orderNumber = draft.orderNumber;
    }

    const order = await this.ordersService.confirmDraftOrder(userId, {
      orderNumber,
      cartId,
      paymentMethod,
      paymentStatus,
      notes,
    });

    return {
      status: 'success',
      order_id: order.orderNumber,
      thankyou_redirect_url: this.buildThankYouUrl(order.orderNumber),
    };
  }

  /**
   * Failsafe for GoKwik order-retry / auto-refund: returns whether an order
   * already exists for this merchant checkout session (cart id).
   */
  async checkOrderExists(dto: GokwikCheckOrderExistsDto): Promise<GokwikCheckOrderExistsResponse> {
    const sessionKey = dto.session_key?.trim();
    if (!sessionKey) {
      return { message: 'No order found.' };
    }

    const order = await this.ordersService.findGokwikOrderByCartId(sessionKey);
    if (!order) {
      return { message: 'No order found.' };
    }

    if (dto.customer_phone) {
      const phone = normalizeMobileNumber(dto.customer_phone);
      if (phone && order.phoneNumber !== phone) {
        return { message: 'No order found.' };
      }
    }

    return {
      order_id: order.orderNumber,
      message: 'Order exists.',
    };
  }

  private mapShippingAddress(address: GokwikAddressDto) {
    const recipientName = `${address.first_name} ${address.last_name}`.trim();
    return {
      recipientName,
      phoneNumber: normalizeMobileNumber(address.phone),
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

    // prepaid / pp-cod — WALLET enum workaround + PAID (plan 2B)
    return {
      paymentMethod: OrderPaymentMethod.WALLET,
      paymentStatus: OrderPaymentStatus.PAID,
    };
  }

  private buildNotes(input: {
    cartId: string;
    payment: GokwikPaymentDetailsDto;
    meta?: GokwikCreateOrderMetaDataDto;
    customerPhone: string;
    orderNote?: string;
    userAgent?: string;
    userDetails?: GokwikPlaceOrderDto['user_details'];
    utmDetails?: GokwikPlaceOrderDto['utm_details'];
  }): string {
    return JSON.stringify({
      source: 'gokwik',
      cart_id: input.cartId,
      customer_phone: input.customerPhone,
      order_note: input.orderNote,
      user_agent: input.userAgent,
      user_details: input.userDetails,
      utm_details: input.utmDetails,
      payment_details: {
        payment_method: input.payment.payment_method,
        payment_amount: input.payment.payment_amount,
        payment_id: input.payment.payment_id,
        payment_instrument: input.payment.payment_instrument,
        pg_payment_trnx_id: input.payment.pg_payment_trnx_id,
      },
      meta_data: input.meta
        ? {
            gst_no: input.meta.gst_no,
            gokwik_order_id: input.meta.gokwik_order_id,
            rto_risk_flag: input.meta.rto_risk_flag,
            rewards_info: input.meta.rewards_info,
            discounts: input.meta.discounts,
            other_charges: input.meta.other_charges,
            ppcod: input.meta.ppcod,
          }
        : undefined,
    });
  }

  private buildThankYouUrl(orderNumber: string): string | undefined {
    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '');
    if (!storefrontUrl) {
      return undefined;
    }
    return `${storefrontUrl}/thankyou?order_id=${encodeURIComponent(orderNumber)}`;
  }
}
