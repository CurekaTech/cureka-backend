import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { CartService } from '@modules/orders/services/cart.service';
import { OrdersService } from '@modules/orders/services/orders.service';
import { roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { UserAddressEntity } from '@modules/users/entities/user-address.entity';
import { UserAddressType } from '@modules/users/enums/user-address-type.enum';
import { UserAddressesService } from '@modules/users/services/user-addresses.service';
import { UsersService } from '@modules/users/services/users.service';
import { DataSource } from 'typeorm';
import { addressLogMeta, maskMobile } from '@packages/logger';
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
import { GokwikQueueService } from './gokwik-queue.service';
import { GokwikComplimentaryOrderItemsService } from './gokwik-complimentary-order-items.service';
import { GokwikRepository } from '../repositories/gokwik.repository';
import {
  buildGokwikFinancialSnapshot,
  GokwikFinancialSnapshot,
} from '../utils/gokwik-financial-snapshot.util';
import { GokwikLineItemDto } from '../dto/gokwik-line-item.dto';

@Injectable()
export class GokwikOrderService {
  private readonly logger = new Logger(GokwikOrderService.name);

  constructor(
    private readonly cartService: CartService,
    private readonly ordersService: OrdersService,
    private readonly userAddressesService: UserAddressesService,
    private readonly usersService: UsersService,
    private readonly gokwikRepository: GokwikRepository,
    private readonly gokwikQueueService: GokwikQueueService,
    private readonly gokwikComplimentaryOrderItemsService: GokwikComplimentaryOrderItemsService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    const cartId = dto.cart_id?.trim();
    if (!cartId) {
      throw new BadRequestException('Invalid cart id');
    }

    return this.withCartLock(cartId, async () => {
      const cart = await this.cartService.findActiveCartById(cartId);
      if (!cart) {
        throw new BadRequestException('Invalid cart id');
      }

      this.logger.log(
        {
          cartId,
          ...addressLogMeta(dto.shipping_address),
        },
        'create-order received shipping_address',
      );

      const customerPhone = parseIndianMobileNumber(dto.customer_phone);
      await this.applyGokwikDiscount(cart.userId, cart.coupon?.code ?? null, dto.meta_data);
      const isCodPayment = dto.payment_details.payment_method === 'cod';
      const pricedCart = await this.cartService.getCartById(
        cartId,
        undefined,
        isCodPayment ? { paymentMethod: OrderPaymentMethod.COD } : undefined,
      );
      const existing = await this.gokwikRepository.findOrderByCartId(cartId);
      if (existing?.order) {
        const existingOrderTotal = Number(existing.order.grandTotal);
        const gokwikPayable = Number(dto.payment_details.payment_amount);
        const hasStaleOrderAmount =
          Math.abs(Math.round(existingOrderTotal * 100) - Math.round(pricedCart.grandTotal * 100)) >
            1 ||
          Math.abs(Math.round(existingOrderTotal * 100) - Math.round(gokwikPayable * 100)) > 1;
        if (hasStaleOrderAmount) {
          this.logger.warn(
            {
              cartId,
              existingOrderNumber: existing.order.orderNumber,
              existingOrderTotal,
              currentCartTotal: pricedCart.grandTotal,
              paymentMethod: dto.payment_details.payment_method,
            },
            'Refreshing stale GoKwik order link for cart',
          );
          const shippingAddress = this.mapShippingAddress(dto.shipping_address);
          const address = await this.findOrCreateAddress(cart.userId, shippingAddress);
          const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);
          const refreshedOrder = await this.ordersService.createDraftOrderFromCart(cart.userId, {
            cartId,
            addressId: address.id,
            paymentMethod,
            paymentStatus,
            notes: null,
            orderSource: OrderSource.GOKWIK,
            // COD must include COD fee; prepaid discounts are owned by GoKwik totals.
            ignorePaymentMethodPricing: !isCodPayment,
          });
          const orderWithComplimentary = await this.withComplimentaryItems(
            cart.userId,
            refreshedOrder,
            dto.line_items,
          );
          const { order: snapshotOrder, snapshot: refreshedSnapshot } =
            await this.applyGokwikFinancialSnapshot(
              orderWithComplimentary,
              dto.payment_details,
              dto.meta_data,
            );
          this.assertPaymentTotal(dto.payment_details, dto.meta_data, Number(snapshotOrder.grandTotal));
          this.assertDiscountTotal(
            dto.meta_data,
            roundMoney(
              Number(snapshotOrder.discountAmount) + Number(snapshotOrder.prepaidDiscount),
            ),
          );
          await this.gokwikRepository.updateOrderLink(existing.id, {
            orderId: snapshotOrder.id,
            gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || null,
            paymentId: this.resolveStoredPaymentId(dto.payment_details, cartId),
            gatewayTransactionId: this.normalizeOptionalIdentifier(
              dto.payment_details.pg_payment_trnx_id,
            ),
            paymentMethod: dto.payment_details.payment_method,
            paymentAmount: dto.payment_details.payment_amount.toFixed(2),
            prepaidAmount: (dto.meta_data?.ppcod?.prepaid_amount ?? 0).toFixed(2),
            payableOnDelivery: (dto.meta_data?.ppcod?.payable_on_delivery ?? 0).toFixed(2),
            customerPhone,
            metadata: {
              ...(existing.metadata ?? {}),
              rto_risk_flag: dto.meta_data?.rto_risk_flag,
              ...this.codPaymentMetadata(dto.payment_details),
              financial_snapshot: this.toFinancialSnapshotMetadata(
                refreshedSnapshot,
                dto.payment_details,
                dto.meta_data,
              ),
            },
            updatedBy: 'gokwik',
          });
          await this.syncUnregisteredUserAfterSuccessfulOrder(cart.userId, {
            shippingAddress: dto.shipping_address,
            order: snapshotOrder,
          });
          return { status: 'success', order_id: snapshotOrder.orderNumber };
        }
        const syncedExistingOrder = await this.withComplimentaryItems(
          cart.userId,
          existing.order,
          dto.line_items,
        );
        const { order: snapshotOrder, snapshot: existingSnapshot } =
          await this.applyGokwikFinancialSnapshot(
            syncedExistingOrder,
            dto.payment_details,
            dto.meta_data,
          );
        this.assertPaymentTotal(dto.payment_details, dto.meta_data, Number(snapshotOrder.grandTotal));
        await this.gokwikRepository.updateOrderLink(existing.id, {
          gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || existing.gokwikOrderId,
          paymentId: this.resolveStoredPaymentId(dto.payment_details, cartId),
          gatewayTransactionId: this.normalizeOptionalIdentifier(
            dto.payment_details.pg_payment_trnx_id,
          ),
          paymentMethod: dto.payment_details.payment_method,
          paymentAmount: dto.payment_details.payment_amount.toFixed(2),
          prepaidAmount: (dto.meta_data?.ppcod?.prepaid_amount ?? 0).toFixed(2),
          payableOnDelivery: (dto.meta_data?.ppcod?.payable_on_delivery ?? 0).toFixed(2),
          customerPhone,
          metadata: {
            ...(existing.metadata ?? {}),
            rto_risk_flag: dto.meta_data?.rto_risk_flag,
            ...this.codPaymentMetadata(dto.payment_details),
            financial_snapshot: this.toFinancialSnapshotMetadata(
              existingSnapshot,
              dto.payment_details,
              dto.meta_data,
            ),
          },
          updatedBy: 'gokwik',
        });
        await this.syncUnregisteredUserAfterSuccessfulOrder(cart.userId, {
          shippingAddress: dto.shipping_address,
          order: snapshotOrder,
        });
        return { status: 'success', order_id: snapshotOrder.orderNumber };
      }

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
        // COD must include COD fee; prepaid discounts are owned by GoKwik totals.
        ignorePaymentMethodPricing: !isCodPayment,
      });
      const orderWithComplimentary = await this.withComplimentaryItems(
        cart.userId,
        order,
        dto.line_items,
      );

      const { order: snapshotOrder, snapshot: createdSnapshot } =
        await this.applyGokwikFinancialSnapshot(
          orderWithComplimentary,
          dto.payment_details,
          dto.meta_data,
        );
      this.assertPaymentTotal(dto.payment_details, dto.meta_data, Number(snapshotOrder.grandTotal));
      this.assertDiscountTotal(
        dto.meta_data,
        roundMoney(Number(snapshotOrder.discountAmount) + Number(snapshotOrder.prepaidDiscount)),
      );

      try {
        await this.gokwikRepository.createOrderLink({
          orderId: snapshotOrder.id,
          cartId,
          gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || null,
          paymentId: this.resolveStoredPaymentId(dto.payment_details, cartId),
          gatewayTransactionId: this.normalizeOptionalIdentifier(dto.payment_details.pg_payment_trnx_id),
          paymentMethod: dto.payment_details.payment_method,
          paymentAmount: dto.payment_details.payment_amount.toFixed(2),
          prepaidAmount: (dto.meta_data?.ppcod?.prepaid_amount ?? 0).toFixed(2),
          payableOnDelivery: (dto.meta_data?.ppcod?.payable_on_delivery ?? 0).toFixed(2),
          customerPhone,
          metadata: {
            rto_risk_flag: dto.meta_data?.rto_risk_flag,
            ...this.codPaymentMetadata(dto.payment_details),
            financial_snapshot: this.toFinancialSnapshotMetadata(
              createdSnapshot,
              dto.payment_details,
              dto.meta_data,
            ),
          },
          createdBy: 'gokwik',
          updatedBy: 'gokwik',
        });
      } catch (error) {
        const concurrent = await this.gokwikRepository.findOrderByCartId(cartId);
        if (concurrent?.order) {
          const { order: concurrentSnapshot } = await this.applyGokwikFinancialSnapshot(
            concurrent.order,
            dto.payment_details,
            dto.meta_data,
          );
          await this.syncUnregisteredUserAfterSuccessfulOrder(cart.userId, {
            shippingAddress: dto.shipping_address,
            order: concurrentSnapshot,
          });
          return { status: 'success', order_id: concurrentSnapshot.orderNumber };
        }
        throw error;
      }

      await this.syncUnregisteredUserAfterSuccessfulOrder(cart.userId, {
        shippingAddress: dto.shipping_address,
        order: snapshotOrder,
      });
      return {
        status: 'success',
        order_id: snapshotOrder.orderNumber,
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
          await this.syncUnregisteredUserAfterSuccessfulOrder(completed.order.userId, {
            shippingAddress: dto.shipping_address ?? dto.billing_address,
            userDetails: dto.user_details,
            order: completed.order,
          });
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

      const pricedCart = await this.cartService.getCartById(cartId);
      const orderTotal = Number(link.order.grandTotal);
      const hasStaleOrderAmount =
        Math.abs(Math.round(orderTotal * 100) - Math.round(pricedCart.grandTotal * 100)) > 1;
      if (hasStaleOrderAmount) {
        this.logger.warn(
          {
            cartId,
            orderNumber: link.order.orderNumber,
            orderTotal,
            currentCartTotal: pricedCart.grandTotal,
          },
          '[GoKwik] Place-order amount drift (ignored — not blocking)',
        );
      }

      // Lock GoKwik payable totals onto the draft before confirm → Shipway/UC.
      const { order: snapshotOrder, snapshot: placeSnapshot } =
        await this.applyGokwikFinancialSnapshot(
          link.order,
          dto.payment_details,
          dto.meta_data,
        );
      const orderReadyForConfirm = await this.withComplimentaryItems(
        cart.userId,
        snapshotOrder,
        dto.line_items,
      );
      this.assertPaymentTotal(
        dto.payment_details,
        dto.meta_data,
        Number(orderReadyForConfirm.grandTotal),
      );
      const { paymentMethod, paymentStatus } = this.mapPayment(dto.payment_details);

      await this.gokwikRepository.updateOrderLink(link.id, {
        gokwikOrderId: dto.meta_data?.gokwik_order_id?.trim() || link.gokwikOrderId,
        paymentId: this.resolveStoredPaymentId(dto.payment_details, cartId),
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
          ...this.codPaymentMetadata(dto.payment_details),
          financial_snapshot: this.toFinancialSnapshotMetadata(
            placeSnapshot,
            dto.payment_details,
            dto.meta_data,
          ),
        },
        updatedBy: 'gokwik',
      });

      const order = await this.ordersService.confirmDraftOrder(cart.userId, {
        orderNumber: orderReadyForConfirm.orderNumber,
        cartId,
        paymentMethod,
        paymentStatus,
        notes: dto.order_note?.trim() || null,
      });

      this.logger.log(
        {
          cartId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentMethod,
          paymentStatus,
          grandTotal: order.grandTotal,
          orderStatus: order.orderStatus,
          stage: 'draft_confirmed',
        },
        '[GoKwik] place-order confirmDraftOrder returned — see OrdersService logs for BOB notify vs idempotent skip',
      );

      if (dto.shipping_address || dto.billing_address) {
        this.logger.log(
          {
            ...addressLogMeta(dto.shipping_address ?? dto.billing_address),
            hasBillingAddress: Boolean(dto.billing_address),
          },
          'place-order received shipping_address',
        );
      }

      await this.syncUnregisteredUserAfterSuccessfulOrder(cart.userId, {
        shippingAddress: dto.shipping_address ?? dto.billing_address,
        userDetails: dto.user_details,
        order,
      });

      // GoKwik stores merchant_order_id only after this place-order response.
      // Push Confirmed on a short delay so Platform Order Status actually updates.
      await this.gokwikQueueService.enqueueOrderStatus(order.id, 'Confirmed');

      this.logger.log(
        {
          cartId,
          orderId: order.id,
          orderNumber: order.orderNumber,
          thankyouRedirectHost: this.hostOfThankYou(order.orderNumber),
          enqueuedGoKwikStatus: 'Confirmed',
        },
        '[GoKwik] place-order success — returning thankyou_redirect_url',
      );

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
      {
        hasSessionKey: Boolean(sessionKey),
        hasCustomerPhone: Boolean(customerPhone),
        phoneMasked: maskMobile(customerPhone || rawPhone),
        hasEmail: Boolean((dto.customer_email ?? dto.user_email ?? '').trim()),
      },
      '[checkOrderExists] lookup started',
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
        {
          lookup: 'by_phone',
          phoneMasked: maskMobile(customerPhone),
          found: Boolean(link),
          linkId: link?.id,
          orderId: link?.orderId,
        },
        '[checkOrderExists] lookup result',
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

  /**
   * After a successful GoKwik create-order / place-order:
   * mark UNREGISTERED users as registered and upsert HOME/default address.
   * Non-blocking — never fails the order callback.
   */
  private async syncUnregisteredUserAfterSuccessfulOrder(
    userId: string,
    params: {
      shippingAddress?: GokwikAddressDto;
      userDetails?: { first_name?: string; last_name?: string; email?: string; phone?: string };
      order?: {
        recipientName: string;
        phoneNumber: string;
        pincode: string;
        addressLine1: string;
        city: string;
        state: string;
      };
    },
  ): Promise<void> {
    try {
      const fromDto = params.shippingAddress;
      let firstName = fromDto?.first_name?.trim() || params.userDetails?.first_name?.trim() || '';
      let lastName = fromDto?.last_name?.trim() || params.userDetails?.last_name?.trim() || '';
      const email = fromDto?.email?.trim() || params.userDetails?.email?.trim() || null;

      let phoneNumber: string | undefined;
      let pincode: string | undefined;
      let addressLine1: string | undefined;
      let city: string | undefined;
      let state: string | undefined;

      if (fromDto) {
        phoneNumber = parseIndianMobileNumber(fromDto.phone);
        pincode = fromDto.pincode.trim();
        addressLine1 = fromDto.address.trim();
        city = fromDto.city.trim();
        state = fromDto.state.trim();
      } else if (params.order) {
        const parts = params.order.recipientName.trim().split(/\s+/);
        if (!firstName) {
          firstName = parts[0] ?? 'Customer';
        }
        if (!lastName) {
          lastName = parts.slice(1).join(' ') || firstName;
        }
        phoneNumber = parseIndianMobileNumber(
          params.userDetails?.phone || params.order.phoneNumber,
        );
        pincode = params.order.pincode;
        addressLine1 = params.order.addressLine1;
        city = params.order.city;
        state = params.order.state;
      }

      if (!firstName || !lastName || !phoneNumber || !pincode || !addressLine1 || !city || !state) {
        this.logger.warn(
          `[GoKwik] skip profile sync — incomplete shipping data for userId=${userId}`,
        );
        return;
      }

      const result = await this.usersService.syncUnregisteredProfileFromGokwik(userId, {
        firstName,
        lastName,
        email,
        phoneNumber,
        pincode,
        addressLine1,
        city,
        state,
      });

      if (result.synced) {
        this.logger.log(
          `[GoKwik] profile/address sync userId=${userId} reason=${result.reason}`,
        );
      } else {
        this.logger.warn(
          `[GoKwik] profile sync skipped userId=${userId} reason=${result.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          userId,
          err: error instanceof Error ? error.message : String(error),
        },
        '[GoKwik] profile sync failed (non-blocking)',
      );
    }
  }

  /**
   * Overwrite draft order money with GoKwik's payable snapshot (coupons / fees /
   * payment_amount). Line-item catalog prices stay from the cart; commercial
   * totals must match what GoKwik charged so UniCommerce/Shipway see the same.
   */
  private async applyGokwikFinancialSnapshot(
    order: OrderEntity,
    payment: GokwikPaymentDetailsDto,
    meta: GokwikCreateOrderMetaDataDto | undefined,
  ): Promise<{ order: OrderEntity; snapshot: GokwikFinancialSnapshot }> {
    const snapshot = buildGokwikFinancialSnapshot({ order, payment, meta });
    const previous = {
      discountAmount: order.discountAmount,
      prepaidDiscount: order.prepaidDiscount,
      shippingAmount: order.shippingAmount,
      handlingAmount: order.handlingAmount,
      platformFee: order.platformFee,
      codCharge: order.codCharge,
      grandTotal: order.grandTotal,
      couponCode: order.couponCode,
    };

    await this.dataSource.getRepository(OrderEntity).update(
      { id: order.id },
      {
        discountAmount: toMoneyString(snapshot.discountAmount),
        prepaidDiscount: toMoneyString(snapshot.prepaidDiscount),
        shippingAmount: toMoneyString(snapshot.shippingAmount),
        handlingAmount: toMoneyString(snapshot.handlingAmount),
        platformFee: toMoneyString(snapshot.platformFee),
        codCharge: toMoneyString(snapshot.codCharge),
        grandTotal: toMoneyString(snapshot.grandTotal),
        couponCode: snapshot.couponCode,
        couponTitle: snapshot.couponTitle,
        updatedBy: 'gokwik',
      },
    );

    order.discountAmount = toMoneyString(snapshot.discountAmount);
    order.prepaidDiscount = toMoneyString(snapshot.prepaidDiscount);
    order.shippingAmount = toMoneyString(snapshot.shippingAmount);
    order.handlingAmount = toMoneyString(snapshot.handlingAmount);
    order.platformFee = toMoneyString(snapshot.platformFee);
    order.codCharge = toMoneyString(snapshot.codCharge);
    order.grandTotal = toMoneyString(snapshot.grandTotal);
    order.couponCode = snapshot.couponCode;
    order.couponTitle = snapshot.couponTitle;

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentAmount: payment.payment_amount,
        paymentMethod: payment.payment_method,
        previous,
        snapshot,
        discounts: meta?.discounts ?? [],
        otherCharges: meta?.other_charges ?? [],
        rewardsAmount: snapshot.rewardsAmount,
      },
      '[GoKwik] Applied financial snapshot from GoKwik payload onto order',
    );

    return { order, snapshot };
  }

  private toFinancialSnapshotMetadata(
    snapshot: GokwikFinancialSnapshot,
    payment: GokwikPaymentDetailsDto,
    meta: GokwikCreateOrderMetaDataDto | undefined,
  ): Record<string, unknown> {
    return {
      ...snapshot,
      payment_amount: payment.payment_amount,
      discounts: meta?.discounts ?? [],
      other_charges: meta?.other_charges ?? [],
      rewards_info: meta?.rewards_info ?? null,
      ppcod: meta?.ppcod ?? null,
      applied_at: new Date().toISOString(),
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
    const rewardsAmount = this.resolveRewardsAmount(meta);
    // Cureka grandTotal already includes handling/platform/COD fees.
    // GoKwik may also echo those as meta_data.other_charges — do not add them again.
    const payableTotal = roundMoney(Math.max(expectedTotal - rewardsAmount, 0));

    // GoKwik owns checkout display totals (fees/COD presentation). Soft-validate only —
    // do not block create-order / place-order on amount drift.
    if (!equalsMoney(payment.payment_amount, payableTotal)) {
      this.logger.warn(
        {
          paymentAmount: payment.payment_amount,
          expectedTotal,
          otherChargesTotal: this.sumOtherCharges(meta),
          rewardsAmount,
          payableTotal,
          paymentMethod: payment.payment_method,
        },
        'GoKwik payment mismatch (ignored — amount check disabled per GoKwik)',
      );
    }

    if (payment.payment_method === 'pp-cod') {
      const prepaid = meta?.ppcod?.prepaid_amount;
      const payable = meta?.ppcod?.payable_on_delivery;
      if (prepaid == null || payable == null) {
        this.logger.warn(
          {
            paymentMethod: payment.payment_method,
            prepaid,
            payable,
          },
          '[GoKwik] ppcod split missing (ignored — not blocking create/place-order)',
        );
        return;
      }
      const splitTotal = prepaid + payable;
      if (!equalsMoney(splitTotal, payableTotal)) {
        this.logger.warn(
          {
            prepaid,
            payable,
            splitTotal,
            payableTotal,
            expectedTotal,
          },
          'Partial COD split mismatch (ignored — amount check disabled per GoKwik)',
        );
      }
    }
  }

  private sumOtherCharges(meta: GokwikCreateOrderMetaDataDto | undefined): number {
    return roundMoney(
      (meta?.other_charges ?? []).reduce((sum, charge) => {
        const amount = Number(charge?.amount ?? 0);
        if (!Number.isFinite(amount) || amount < 0) {
          return sum;
        }
        return sum + amount;
      }, 0),
    );
  }

  private resolveRewardsAmount(meta: GokwikCreateOrderMetaDataDto | undefined): number {
    const amount = Number(meta?.rewards_info?.reward_amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      return 0;
    }
    return roundMoney(amount);
  }

  private async applyGokwikDiscount(
    userId: string,
    currentCouponCode: string | null,
    meta: GokwikCreateOrderMetaDataDto | undefined,
  ): Promise<void> {
    const discounts = (meta?.discounts ?? []).filter((discount) => discount.amount > 0);
    if (!discounts.length) {
      return;
    }

    // GoKwik may send prepaid/promo + cart coupon together — never block create-order.
    if (discounts.length > 1) {
      this.logger.warn(
        {
          discountCount: discounts.length,
          discounts: discounts.map((discount) => ({
            code: discount.code ?? null,
            type: discount.type,
            amount: discount.amount,
          })),
        },
        '[GoKwik] Multiple discounts reported — applying first coded coupon only (not blocking)',
      );
    }

    const discountWithCode =
      discounts.find((discount) => Boolean(discount.code?.trim())) ?? discounts[0];
    const code = discountWithCode?.code?.trim();
    if (!code) {
      this.logger.warn(
        {
          discounts: discounts.map((discount) => ({
            type: discount.type,
            amount: discount.amount,
          })),
        },
        '[GoKwik] Discount without coupon code — skipping cart coupon sync (not blocking)',
      );
      return;
    }

    if (currentCouponCode === code) {
      return;
    }

    try {
      await this.cartService.applyCoupon(userId, { couponCode: code });
    } catch (error) {
      this.logger.warn(
        {
          code,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : { message: String(error) },
        },
        '[GoKwik] Coupon apply failed — continuing create-order without blocking',
      );
    }
  }

  private normalizeOptionalIdentifier(value?: string | null): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  /**
   * GoKwik reuses `KWIKDUMMYTRANSACTIONID` (and similar) for every COD order.
   * `gokwik_orders.payment_id` is UNIQUE — store null for COD dummies and keep
   * the raw value in metadata so create-order / place-order can accept them.
   */
  private resolveStoredPaymentId(
    payment: GokwikPaymentDetailsDto,
    cartId: string,
  ): string | null {
    const normalized = this.normalizeOptionalIdentifier(payment.payment_id);
    if (!normalized) {
      return null;
    }

    if (payment.payment_method === 'cod' && this.isCodDummyPaymentId(normalized)) {
      this.logger.log(
        {
          cartId,
          paymentMethod: payment.payment_method,
          paymentId: normalized,
          storedPaymentId: null,
        },
        '[GoKwik] COD dummy payment_id accepted (not stored under unique payment_id)',
      );
      return null;
    }

    return normalized;
  }

  private isCodDummyPaymentId(value: string): boolean {
    const upper = value.trim().toUpperCase();
    return (
      upper === 'KWIKDUMMYTRANSACTIONID' ||
      upper === 'KWIKDUMMYPAYMENTID' ||
      upper.startsWith('KWIKDUMMY')
    );
  }

  private codPaymentMetadata(
    payment: GokwikPaymentDetailsDto,
  ): Record<string, string> {
    if (payment.payment_method !== 'cod') {
      return {};
    }
    const rawPaymentId = this.normalizeOptionalIdentifier(payment.payment_id);
    if (!rawPaymentId || !this.isCodDummyPaymentId(rawPaymentId)) {
      return {};
    }
    return { gokwik_cod_payment_id: rawPaymentId };
  }

  private assertDiscountTotal(
    meta: GokwikCreateOrderMetaDataDto | undefined,
    expectedDiscount: number,
  ): void {
    const reportedDiscounts = (meta?.discounts ?? []).reduce(
      (sum, discount) => sum + discount.amount,
      0,
    );
    const reported = roundMoney(reportedDiscounts + this.resolveRewardsAmount(meta));
    if (Math.abs(Math.round(reported * 100) - Math.round(expectedDiscount * 100)) > 1) {
      this.logger.warn(
        {
          reportedDiscount: reported,
          expectedDiscount,
          discounts: meta?.discounts ?? [],
          rewardsAmount: this.resolveRewardsAmount(meta),
        },
        '[GoKwik] Discount mismatch (ignored — not blocking create/place-order)',
      );
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
    return `${storefrontUrl}/thankyou?order_id=${encodeURIComponent(orderNumber)}`;
  }

  private hostOfThankYou(orderNumber: string): string | null {
    try {
      return new URL(this.buildThankYouUrl(orderNumber)).host;
    } catch {
      return null;
    }
  }

  private async withComplimentaryItems(
    userId: string,
    order: OrderEntity,
    lineItems: GokwikLineItemDto[] | undefined,
  ): Promise<OrderEntity> {
    const result = await this.gokwikComplimentaryOrderItemsService.syncComplimentaryItems(
      userId,
      order,
      lineItems,
    );
    return result.order;
  }
}
