import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { PaymentRequestsService } from '../services/payment-requests.service';
import { RazorpayPaymentLinksService } from '../services/razorpay-payment-links.service';

@ApiExcludeController()
@Controller('payment')
export class PaymentsWebhookController {
  constructor(
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly paymentRequestsService: PaymentRequestsService,
  ) {}

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
    const notes = paymentEntity?.entity?.notes;
    const paymentRequestId = notes?.paymentRequestId as string | undefined;
    const orderId = orderEntity?.entity?.id ?? paymentEntity?.entity?.order_id;

    if (event === 'payment_link.paid' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
    } else if (event === 'payment_link.cancelled' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    } else if (event === 'payment.captured' && paymentRequestId) {
      await this.paymentRequestsService.handlePaymentCaptured(paymentRequestId, paymentEntity?.entity?.id);
    } else if (event === 'payment.failed' && paymentRequestId) {
      await this.paymentRequestsService.handlePaymentFailed(
        paymentRequestId,
        paymentEntity?.entity?.error_description,
      );
    } else if (event === 'payment.pending' && paymentRequestId) {
      await this.paymentRequestsService.handlePaymentPending(paymentRequestId);
    } else if (
      (event === 'payment.captured' || event === 'order.paid') &&
      orderId
    ) {
      await this.paymentRequestsService.handlePaymentLinkPaid(orderId, paymentEntity?.entity?.id);
    }

    return { received: true, event, requestId: req.id };
  }
}
