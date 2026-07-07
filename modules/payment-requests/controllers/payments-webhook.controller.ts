import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { PaymentRequestsService } from '../services/payment-requests.service';
import { RazorpayPaymentLinksService } from '../services/razorpay-payment-links.service';
import { CashfreePaymentService } from '../services/cashfree-payment.service';

@ApiExcludeController()
@Controller('payment')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly paymentRequestsService: PaymentRequestsService,
    private readonly cashfreeService: CashfreePaymentService,
  ) { }

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
      }
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

    this.logger.log(
      { event, linkId, orderId, paymentRequestId, payload },
      'Razorpay webhook received',
    );

    if (event === 'payment_link.paid' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
    } else if (event === 'payment_link.cancelled' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    } else if (event === 'payment.captured' || event === 'order.paid') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentCaptured(paymentRequestId, paymentEntity?.entity?.id);
      } else if (orderId) {
        await this.paymentRequestsService.handlePaymentLinkPaid(orderId, paymentEntity?.entity?.id);
      } else if (linkId) {
        await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
      }
    } else if (event === 'payment.failed') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentFailed(paymentRequestId, paymentEntity?.entity?.error_description);
      }
    } else if (event === 'payment.pending') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentPending(paymentRequestId);
      }
    }

    return { received: true, event, requestId: req.id };
  }
}
