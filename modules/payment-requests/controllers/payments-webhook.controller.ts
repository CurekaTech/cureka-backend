import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Post, Req, forwardRef } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '@modules/subscription/constants/subscription-payment-purpose.constants';
import { MembershipsService } from '@modules/subscription/services/memberships.service';
import { ProductSubscriptionsService } from '@modules/subscription/services/product-subscriptions.service';
import { PaymentRequestsService } from '../services/payment-requests.service';
import { RazorpayPaymentLinksService } from '../services/razorpay-payment-links.service';
import { CashfreePaymentService } from '../services/cashfree-payment.service';
import { ShiprocketCheckoutService } from '@modules/checkout/services/shiprocket-checkout.service';

@ApiExcludeController()
@Controller('payment')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly cashfreeService: CashfreePaymentService,
    private readonly shiprocketCheckoutService: ShiprocketCheckoutService,
    @Inject(forwardRef(() => ProductSubscriptionsService))
    private readonly productSubscriptionsService: ProductSubscriptionsService,
    @Inject(forwardRef(() => MembershipsService))
    private readonly membershipsService: MembershipsService,
  ) { }

  @Post('webhook/shiprocket-checkout')
  @HttpCode(HttpStatus.OK)
  async shiprocketCheckoutWebhook(
    @Req() req: FastifyRequest,
    @Body() payload: Record<string, any>,
    @Headers('x-shiprocket-signature') signature?: string,
  ) {
    const rawBody = JSON.stringify(payload);
    this.shiprocketCheckoutService.verifyCallbackSignature(rawBody, signature);

    const eventType = String(payload['event'] ?? payload['type'] ?? '');
    const sessionId = String(
      payload['session_id'] ??
      payload['sessionId'] ??
      payload['checkout_session_id'] ??
      payload['order_id'] ??
      '',
    );
    const paymentId = payload['payment_id'] ?? payload['paymentId'] ?? payload['razorpay_payment_id'];
    const status = String(payload['payment_status'] ?? payload['status'] ?? '').toLowerCase();

    this.logger.log(
      { eventType, sessionId, status, requestId: req.id },
      'Shiprocket Checkout webhook received',
    );

    if (sessionId && ['paid', 'success', 'successful', 'completed', 'captured'].includes(status)) {
      await this.paymentRequestsService.handleShiprocketCheckoutPaymentSuccess(
        sessionId,
        paymentId ? String(paymentId) : undefined,
      );
    }

    return { received: true, event: eventType, requestId: req.id };
  }

  @Post('webhook/cashfree')
  @HttpCode(HttpStatus.OK)
  async cashfreeWebhook(
    @Req() req: FastifyRequest,
    @Body() payload: Record<string, any>,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
  ) {
    const rawBody = JSON.stringify(payload);
    this.cashfreeService.verifyWebhookSignature(rawBody, timestamp, signature);

    const eventType = String(payload['type'] ?? '');
    const data = payload['data'] as Record<string, any> | undefined;
    const orderData = data?.['order'] as Record<string, any> | undefined;
    const paymentData = data?.['payment'] as Record<string, any> | undefined;
    const orderId = orderData?.['order_id'];
    const cfPaymentId = paymentData?.['cf_payment_id'];
    const orderTags = (orderData?.['order_tags'] ?? orderData?.['order_meta'] ?? {}) as Record<
      string,
      unknown
    >;
    const paymentPurpose = String(
      orderTags['paymentPurpose'] ?? paymentData?.['payment_tags']?.['paymentPurpose'] ?? '',
    );

    this.logger.log(
      { eventType, orderId, cfPaymentId, paymentPurpose, requestId: req.id },
      'Cashfree webhook received',
    );

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' && paymentData?.['payment_status'] === 'SUCCESS') {
      if (orderId) {
        const routed = await this.routeSubscriptionPaid({
          paymentPurpose,
          gatewayOrderId: String(orderId),
          gatewayPaymentId: cfPaymentId ? String(cfPaymentId) : undefined,
          subscriptionPaymentId: String(orderTags['subscriptionPaymentId'] ?? ''),
          membershipPaymentId: String(orderTags['membershipPaymentId'] ?? ''),
          actor: 'cashfree-webhook',
        });
        if (!routed) {
          await this.paymentRequestsService.handleCashfreePaymentSuccess(
            orderId,
            cfPaymentId ? String(cfPaymentId) : undefined,
          );
        }
        this.logger.log(
          { orderId, cfPaymentId, requestId: req.id },
          'Cashfree webhook handled payment success',
        );
      } else {
        this.logger.warn(
          { eventType, requestId: req.id },
          'Cashfree webhook missing orderId',
        );
      }
    } else {
      this.logger.log(
        {
          eventType,
          paymentStatus: paymentData?.['payment_status'],
          requestId: req.id,
        },
        'Cashfree webhook skipped event',
      );
    }

    return { received: true, event: eventType, requestId: req.id };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: FastifyRequest,
    @Body() payload: Record<string, unknown>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    const event = String(payload['event'] ?? '');
    const rawBodySource = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const rawBody = Buffer.isBuffer(rawBodySource)
      ? rawBodySource.toString('utf8')
      : rawBodySource ?? JSON.stringify(payload);

    this.logger.log(
      {
        event,
        requestId: req.id,
        signatureProvided: Boolean(signature),
        rawBodyAvailable: rawBodySource !== undefined,
      },
      'Razorpay webhook received',
    );

    try {
      this.razorpayService.verifyWebhookSignature(rawBody, signature);
    } catch (error) {
      this.logger.warn(
        {
          event,
          requestId: req.id,
          signatureProvided: Boolean(signature),
          error: error instanceof Error ? error.message : String(error),
        },
        'Razorpay webhook signature verification failed',
      );
      throw error;
    }

    const payloadData = payload['payload'] as Record<string, unknown> | undefined;
    const linkEntity = payloadData?.['payment_link'] as
      | { entity?: { id?: string; notes?: Record<string, unknown> } }
      | undefined;
    const paymentEntity = payloadData?.['payment'] as
      | { entity?: { id?: string; order_id?: string; error_description?: string; notes?: Record<string, unknown> } }
      | undefined;
    const orderEntity = payloadData?.['order'] as
      | { entity?: { id?: string; notes?: Record<string, unknown> } }
      | undefined;

    const linkId = linkEntity?.entity?.id;
    const orderId = orderEntity?.entity?.id ?? paymentEntity?.entity?.order_id;
    const notes = {
      ...(linkEntity?.entity?.notes ?? {}),
      ...(orderEntity?.entity?.notes ?? {}),
      ...(paymentEntity?.entity?.notes ?? {}),
    } as Record<string, unknown>;
    const paymentRequestId = notes?.paymentRequestId as string | undefined;
    const paymentPurpose = String(notes?.paymentPurpose ?? '');

    this.logger.log(
      {
        event,
        linkId,
        orderId,
        paymentRequestId,
        paymentPurpose,
        paymentId: paymentEntity?.entity?.id,
        requestId: req.id,
      },
      'Razorpay webhook signature verified',
    );

    if (event === 'payment_link.paid' && linkId) {
      const routed = await this.routeSubscriptionPaid({
        paymentPurpose,
        gatewayOrderId: linkId,
        gatewayPaymentId: paymentEntity?.entity?.id,
        subscriptionPaymentId: String(notes['subscriptionPaymentId'] ?? ''),
        membershipPaymentId: String(notes['membershipPaymentId'] ?? ''),
        actor: 'razorpay-webhook',
      });
      if (!routed) {
        await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
      }
    } else if (event === 'payment_link.cancelled' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    } else if (event === 'payment.authorized' || event === 'payment.captured' || event === 'order.paid') {
      const routed = await this.routeSubscriptionPaid({
        paymentPurpose,
        gatewayOrderId: orderId ?? linkId,
        gatewayPaymentId: paymentEntity?.entity?.id,
        subscriptionPaymentId: String(notes['subscriptionPaymentId'] ?? ''),
        membershipPaymentId: String(notes['membershipPaymentId'] ?? ''),
        actor: 'razorpay-webhook',
      });
      if (!routed) {
        if (paymentRequestId) {
          await this.paymentRequestsService.handlePaymentCaptured(paymentRequestId, paymentEntity?.entity?.id);
        } else if (orderId) {
          await this.paymentRequestsService.handlePaymentLinkPaid(orderId, paymentEntity?.entity?.id);
        } else if (linkId) {
          await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
        }
      }
    } else if (event === 'payment.failed') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentFailed(paymentRequestId, paymentEntity?.entity?.error_description);
      }
    } else if (event === 'payment.pending') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentPending(paymentRequestId);
      }
    } else {
      this.logger.log(
        { event, requestId: req.id },
        'Razorpay webhook event did not require a payment-request update',
      );
    }

    return { received: true, event, requestId: req.id };
  }

  private async routeSubscriptionPaid(params: {
    paymentPurpose: string;
    gatewayOrderId?: string;
    gatewayPaymentId?: string;
    subscriptionPaymentId?: string;
    membershipPaymentId?: string;
    actor: string;
  }): Promise<boolean> {
    if (params.paymentPurpose === SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION) {
      await this.productSubscriptionsService.handlePaymentSuccess({
        paymentId: params.subscriptionPaymentId || undefined,
        gatewayOrderId: params.gatewayOrderId,
        gatewayPaymentId: params.gatewayPaymentId,
        actor: params.actor,
      });
      return true;
    }
    if (params.paymentPurpose === SUBSCRIPTION_PAYMENT_PURPOSE.MEMBERSHIP) {
      await this.membershipsService.handlePaymentSuccess({
        paymentId: params.membershipPaymentId || undefined,
        gatewayOrderId: params.gatewayOrderId,
        gatewayPaymentId: params.gatewayPaymentId,
        actor: params.actor,
      });
      return true;
    }
    return false;
  }
}
