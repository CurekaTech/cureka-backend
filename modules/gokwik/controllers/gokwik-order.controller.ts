import { Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikCheckOrderExistsDto } from '../dto/gokwik-check-order-exists.dto';
import { GokwikCreateOrderDto } from '../dto/gokwik-create-order.dto';
import { GokwikPlaceOrderDto } from '../dto/gokwik-place-order.dto';
import { GokwikCartOwnerGuard } from '../guards/gokwik-cart-owner.guard';
import { GokwikCheckoutAuthGuard } from '../guards/gokwik-checkout-auth.guard';
import {
  GokwikCheckOrderExistsResponse,
  GokwikCreateOrderResponse,
  GokwikPlaceOrderResponse,
} from '../interfaces/gokwik-order.interface';
import { GokwikOrderService } from '../services/gokwik-order.service';

/**
 * Merchant order callbacks.
 * Auth:
 * 1. `Authorization: Bearer <gokwik_checkout>` (preferred) or legacy user session
 * 2. Cart must belong to that authenticated user (and match token cart binding when present)
 */
@Controller('gokwik')
@UseGuards(GokwikCheckoutAuthGuard, VerifiedUserGuard, GokwikCartOwnerGuard)
export class GokwikOrderController {
  private readonly logger = new Logger(GokwikOrderController.name);

  constructor(private readonly gokwikOrderService: GokwikOrderService) {}

  @Post('create-order')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  async createOrder(@Body() dto: GokwikCreateOrderDto): Promise<GokwikCreateOrderResponse> {
    this.logger.log({ cartId: dto.cart_id }, 'GoKwik create-order callback');
    return this.gokwikOrderService.createOrder(dto);
  }

  @Post('place-order')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  async placeOrder(@Body() dto: GokwikPlaceOrderDto): Promise<GokwikPlaceOrderResponse> {
    this.logger.log(
      {
        endpoint: 'POST /api/v1/gokwik/place-order',
        cartId: dto.cart_id,
        orderId: dto.order_id,
        paymentMethod: dto.payment_details?.payment_method,
        paymentAmount: dto.payment_details?.payment_amount,
        paymentInstrument: dto.payment_details?.payment_instrument,
        hasPaymentId: Boolean(dto.payment_details?.payment_id?.trim()),
        hasShippingAddress: Boolean(dto.shipping_address),
        hasBillingAddress: Boolean(dto.billing_address),
        hasOrderNote: Boolean(dto.order_note?.trim()),
        discountCount: dto.meta_data?.discounts?.length ?? 0,
        discountCodes: (dto.meta_data?.discounts ?? [])
          .map((discount) => discount.code?.trim())
          .filter(Boolean),
        gokwikOrderId: dto.meta_data?.gokwik_order_id ?? null,
        rtoRiskFlag: dto.meta_data?.rto_risk_flag ?? null,
      },
      '[GoKwik] place-order request received',
    );

    const result = await this.gokwikOrderService.placeOrder(dto);

    this.logger.log(
      {
        endpoint: 'POST /api/v1/gokwik/place-order',
        cartId: dto.cart_id,
        requestOrderId: dto.order_id,
        response: result,
        next: [
          'confirmDraftOrder (stock + coupon + cart clear)',
          'EVENTS.ORDER_CREATED → BOB /orders-create + MSG91',
          'kickoffFulfillment → UniCommerce enqueue + Shipway push',
          'enqueueOrderStatus Confirmed → GoKwik platform status',
        ],
      },
      '[GoKwik] place-order response returned',
    );

    return result;
  }

  @Post('check-order-exists')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  checkOrderExists(
    @Body() dto: GokwikCheckOrderExistsDto,
  ): Promise<GokwikCheckOrderExistsResponse> {
    return this.gokwikOrderService.checkOrderExists(dto);
  }
}
