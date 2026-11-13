import { BadRequestException, Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { RawResponse } from '@packages/common';
import { CashfreePaymentService } from '../services/cashfree-payment.service';
import {
  cashfreeHostedCheckoutHtml,
  isCashfreePaymentSessionId,
  isCashfreeSubscriptionSessionId,
  normalizeCashfreePaymentSessionId,
} from '../utils/cashfree-checkout-url.util';

@ApiExcludeController()
@RawResponse()
@Controller('payments/cashfree')
export class CashfreeHostedCheckoutController {
  constructor(private readonly cashfreePaymentService: CashfreePaymentService) {}

  @ApiOperation({ summary: 'Open Cashfree hosted checkout for a payment_session_id (email / browser link)' })
  @Get('hosted-checkout')
  @Header('Cache-Control', 'no-store')
  hostedCheckout(
    @Query('payment_session_id') paymentSessionId: string | undefined,
    @Query('subscription_session_id') subscriptionSessionId: string | undefined,
    @Res() reply: FastifyReply,
  ): void {
    const sessionId = normalizeCashfreePaymentSessionId(
      subscriptionSessionId || paymentSessionId || '',
    );
    if (!isCashfreePaymentSessionId(sessionId) && !isCashfreeSubscriptionSessionId(sessionId)) {
      throw new BadRequestException('A valid Cashfree payment_session_id or subscription_session_id is required');
    }
    const environment = this.cashfreePaymentService.getEnv() === 'production' ? 'production' : 'sandbox';
    const html = cashfreeHostedCheckoutHtml(sessionId, environment);
    void reply.type('text/html; charset=utf-8').send(html);
  }
}
