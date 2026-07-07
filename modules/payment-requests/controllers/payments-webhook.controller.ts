import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
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

    this.logger.log({ eventType, sessionId, status, payload }, 'Shiprocket Checkout webhook received');

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

    console.log('PaymentsWebhookController.cashfreeWebhook start', {
      eventType,
      orderId,
      cfPaymentId,
      signature,
      timestamp,
    });
    this.logger.log(
      { eventType, orderId, cfPaymentId, payload },
      'Cashfree webhook received',
    );

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' && paymentData?.['payment_status'] === 'SUCCESS') {
      if (orderId) {
        await this.paymentRequestsService.handleCashfreePaymentSuccess(
          orderId,
          cfPaymentId ? String(cfPaymentId) : undefined,
        );
        console.log('PaymentsWebhookController.cashfreeWebhook handled payment success', {
          orderId,
          cfPaymentId,
        });
      } else {
        console.log('PaymentsWebhookController.cashfreeWebhook missing orderId', { payload });
      }
    } else {
      console.log('PaymentsWebhookController.cashfreeWebhook skipped event', {
        eventType,
        paymentStatus: paymentData?.['payment_status'],
      });
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
    const rawBody = JSON.stringify(payload);
    this.razorpayService.verifyWebhookSignature(rawBody, signature);

    const event = String(payload['event'] ?? '');
    const payloadData = payload['payload'] as Record<string, unknown> | undefined;
    const linkEntity = payloadData?.['payment_link'] as
      | { entity?: { id?: string } }
      | undefined;
    const paymentEntity = payloadData?.['payment'] as
      | { entity?: { id?: string; order_id?: string; error_description?: string; notes?: Record<string, unknown> } }
      | undefined;
    const orderEntity = payloadData?.['order'] as
      | { entity?: { id?: string } }
      | undefined;

    const linkId = linkEntity?.entity?.id;
    const orderId = orderEntity?.entity?.id ?? paymentEntity?.entity?.order_id;
    const notes = paymentEntity?.entity?.notes;
    const paymentRequestId = notes?.paymentRequestId as string | undefined;

    console.log('PaymentsWebhookController.webhook start', {
      event,
      linkId,
      orderId,
      paymentRequestId,
      signature,
    });
    this.logger.log(
      { event, linkId, orderId, paymentRequestId, payload },
      'Razorpay webhook received',
    );

    if (event === 'payment_link.paid' && linkId) {
      console.log('PaymentsWebhookController.webhook branch payment_link.paid', { linkId });
      await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
    } else if (event === 'payment_link.cancelled' && linkId) {
      console.log('PaymentsWebhookController.webhook branch payment_link.cancelled', { linkId });
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired' && linkId) {
      console.log('PaymentsWebhookController.webhook branch payment_link.expired', { linkId });
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    } else if (event === 'payment.authorized' || event === 'payment.captured' || event === 'order.paid') {
      if (event === 'payment.authorized') {
        console.log('PaymentsWebhookController.webhook branch payment.authorized received', {
          paymentRequestId,
          orderId,
          linkId,
          paymentId: paymentEntity?.entity?.id,
        });
      } else {
        console.log('PaymentsWebhookController.webhook branch payment captured/order paid', {
          event,
          paymentRequestId,
          orderId,
          linkId,
          paymentId: paymentEntity?.entity?.id,
        });
      }
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentCaptured(paymentRequestId, paymentEntity?.entity?.id);
      } else if (orderId) {
        await this.paymentRequestsService.handlePaymentLinkPaid(orderId, paymentEntity?.entity?.id);
      } else if (linkId) {
        await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
      }
    } else if (event === 'payment.failed') {
      console.log('PaymentsWebhookController.webhook branch payment.failed', {
        paymentRequestId,
        orderId,
        linkId,
      });
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentFailed(paymentRequestId, paymentEntity?.entity?.error_description);
      }
    } else if (event === 'payment.pending') {
      console.log('PaymentsWebhookController.webhook branch payment.pending', { paymentRequestId });
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentPending(paymentRequestId);
      }
    } else {
      console.log('PaymentsWebhookController.webhook branch no matching event', { event });
    }

    return { received: true, event, requestId: req.id };
  }
}
