import { Body, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { PaymentRequestsService } from '../services/payment-requests.service';
import { RazorpayPaymentLinksService } from '../services/razorpay-payment-links.service';

@ApiExcludeController()
@Controller('payments/razorpay')
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
    const linkEntity = (payload['payload'] as Record<string, unknown> | undefined)?.[
      'payment_link'
    ] as
      | { entity?: { id?: string } }
      | undefined;
    const paymentEntity = (payload['payload'] as Record<string, unknown> | undefined)?.[
      'payment'
    ] as
      | { entity?: { id?: string } }
      | undefined;
    const linkId = linkEntity?.entity?.id;

    if (!linkId) {
      return { received: true };
    }

    if (event === 'payment_link.paid') {
      await this.paymentRequestsService.handlePaymentLinkPaid(linkId, paymentEntity?.entity?.id);
    } else if (event === 'payment_link.cancelled') {
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired') {
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    }

    return { received: true, event, requestId: req.id };
  }
}
