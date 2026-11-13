import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Post, Req, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiExcludeController } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { EVENTS } from '@packages/events';
import { SUBSCRIPTION_PAYMENT_PURPOSE } from '@modules/subscription/constants/subscription-payment-purpose.constants';
import { SubscriptionMandateProvider } from '@modules/subscription/enums/subscription-mandate-provider.enum';
import { MembershipsService } from '@modules/subscription/services/memberships.service';
import { ProductSubscriptionsService } from '@modules/subscription/services/product-subscriptions.service';
import { SubscriptionMandateService } from '@modules/subscription/services/subscription-mandate.service';
import { SubscriptionWebhookEventsRepository } from '@modules/subscription/repositories/subscription-webhook-events.repository';
import { readCashfreeSubscriptionWebhook } from '@modules/subscription/utils/cashfree-subscription-webhook.util';
import { mapCashfreeSubscriptionStatus, mapRazorpayTokenStatus } from '@modules/subscription/utils/subscription-mandate-status.util';
import { razorpaySubscriptionEventSettlesPayment } from '@modules/subscription/utils/razorpay-upi-debit.util';
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
    @Inject(forwardRef(() => SubscriptionMandateService))
    private readonly subscriptionMandateService: SubscriptionMandateService,
    private readonly subscriptionWebhookEvents: SubscriptionWebhookEventsRepository,
    private readonly eventEmitter: EventEmitter2,
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
    } else if (
      sessionId &&
      ['failed', 'failure', 'cancelled', 'canceled', 'dropped'].includes(status)
    ) {
      await this.paymentRequestsService.handlePaymentFailedByProviderReference(
        sessionId,
        `Shiprocket checkout ${status}`,
        'shiprocket-checkout-webhook',
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
    const rawBodySource = (req as FastifyRequest & { rawBody?: Buffer | string }).rawBody;
    const rawBody = Buffer.isBuffer(rawBodySource)
      ? rawBodySource.toString('utf8')
      : rawBodySource;
    if (!rawBody) {
      this.logger.error(
        { requestId: req.id, rawBodyAvailable: false },
        'Cashfree webhook raw body is missing, so the signature cannot be verified',
      );
      throw new BadRequestException('Cashfree webhook body is missing');
    }
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
          this.logger.log(
            { orderId, paymentPurpose, requestId: req.id },
            'Cashfree payment success had no subscription purpose, so checkout handled it',
          );
          const providerAmount = Number(
            paymentData?.['payment_amount'] ?? orderData?.['order_amount'] ?? NaN,
          );
          await this.paymentRequestsService.handleCashfreePaymentSuccess(
            orderId,
            cfPaymentId ? String(cfPaymentId) : undefined,
            'cashfree-webhook',
            Number.isFinite(providerAmount) ? providerAmount : null,
          );
        }
        this.logger.log(
          { orderId, cfPaymentId, paymentPurpose, routed, requestId: req.id },
          'Cashfree webhook handled payment success',
        );
      } else {
        this.logger.warn(
          { eventType, requestId: req.id },
          'Cashfree webhook missing orderId',
        );
      }
    } else if (eventType === 'PAYMENT_USER_DROPPED_WEBHOOK' && orderId) {
      // User-dropped is ambiguous — do not auto-fail or release wallet holds.
      await this.paymentRequestsService.handlePaymentOutcomeUncertain(
        String(orderId),
        String(paymentData?.['payment_message'] ?? 'Cashfree payment user dropped'),
        'cashfree-webhook',
      );
      this.logger.log(
        { orderId, eventType, requestId: req.id },
        'Cashfree webhook recorded uncertain user-dropped outcome',
      );
    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' && orderId) {
      await this.productSubscriptionsService.handlePaymentFailed({
        gatewayOrderId: String(orderId),
        reason: String(paymentData?.['payment_message'] ?? 'Cashfree payment failed'),
        actor: 'cashfree-webhook',
      });
      await this.paymentRequestsService.handlePaymentFailedByProviderReference(
        String(orderId),
        String(paymentData?.['payment_message'] ?? paymentData?.['error_details'] ?? 'Cashfree payment failed'),
        'cashfree-webhook',
      );
      this.logger.log(
        { orderId, eventType, requestId: req.id },
        'Cashfree webhook handled payment failure',
      );
    } else if (
      eventType === 'SUBSCRIPTION_AUTH_STATUS' ||
      eventType === 'SUBSCRIPTION_STATUS_CHANGE' ||
      eventType === 'SUBSCRIPTION_STATUS_CHANGED' ||
      eventType === 'SUBSCRIPTION_PAYMENT_SUCCESS' ||
      eventType === 'SUBSCRIPTION_PAYMENT_FAILED' ||
      eventType === 'SUBSCRIPTION_PAYMENT_CANCELLED'
    ) {
      const subscription = readCashfreeSubscriptionWebhook(payload);
      const merchantSubscriptionId = subscription.merchantSubscriptionId;
      const cfSubscriptionId = subscription.cfSubscriptionId;
      const subscriptionStatus = subscription.subscriptionStatus;
      const subscriptionPaymentId = subscription.subscriptionPaymentId;
      const subscriptionCfPaymentId = subscription.cfPaymentId || (cfPaymentId ? String(cfPaymentId) : '');
      const eventId = [
        subscription.subscriptionStatus || subscription.paymentStatus || 'event',
        subscriptionCfPaymentId ||
          subscription.paymentId ||
          cfSubscriptionId ||
          merchantSubscriptionId ||
          'none',
        String(payload['event_time'] ?? ''),
      ].join(':');
      this.logger.log(
        {
          eventType,
          requestId: req.id,
          merchantSubscriptionId: merchantSubscriptionId || null,
          cfSubscriptionId: cfSubscriptionId || null,
          subscriptionStatus: subscriptionStatus || null,
          subscriptionPaymentId: subscriptionPaymentId ?? null,
          cfPaymentId: subscriptionCfPaymentId || null,
          paymentId: subscription.paymentId || null,
          paymentStatus: subscription.paymentStatus || paymentData?.['payment_status'] || null,
          paymentType: subscription.paymentType || null,
          paymentAmount: subscription.paymentAmount,
        },
        'Cashfree subscription webhook received',
      );
      const fresh = await this.subscriptionWebhookEvents.tryRecord({
        provider: 'CASHFREE',
        eventId: `${eventType}:${eventId}`,
        eventType,
      });
      if (!fresh) {
        this.logger.warn(
          { eventType, eventId, requestId: req.id },
          'Cashfree subscription webhook was a duplicate; settlement still runs',
        );
      }
      const isAuthPayment = subscription.paymentType.toUpperCase() === 'AUTH';
      if (eventType === 'SUBSCRIPTION_PAYMENT_SUCCESS' || eventType === 'SUBSCRIPTION_PAYMENT_FAILED') {
        if (eventType === 'SUBSCRIPTION_PAYMENT_FAILED') {
          await this.productSubscriptionsService.handlePaymentFailed({
            gatewayOrderId: subscription.paymentId || merchantSubscriptionId || String(orderId ?? ''),
            reason: String(paymentData?.['payment_message'] ?? 'Cashfree subscription charge failed'),
            actor: 'cashfree-subscription-webhook',
          });
          this.logger.warn(
            { eventType, merchantSubscriptionId, cfSubscriptionId, requestId: req.id },
            'Cashfree subscription payment failed, so no order was created',
          );
        } else {
          if (subscriptionStatus) {
            await this.subscriptionMandateService.handleProviderWebhook({
              provider: SubscriptionMandateProvider.CASHFREE,
              gatewayMandateId: cfSubscriptionId || undefined,
              gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId,
              authorizationOrderId: merchantSubscriptionId || undefined,
              gatewayPaymentId: subscriptionCfPaymentId || undefined,
              status: mapCashfreeSubscriptionStatus(subscriptionStatus),
              actor: 'cashfree-webhook',
              raw: payload,
            });
          }
          const paymentId =
            subscriptionPaymentId ||
            (await this.subscriptionMandateService.recordedFirstChargePaymentId(
              merchantSubscriptionId || cfSubscriptionId,
            )) ||
            undefined;
          const settled = await this.productSubscriptionsService.settleCashfreeSubscriptionPayment({
            paymentId,
            gatewayOrderId: subscription.paymentId || merchantSubscriptionId || String(orderId ?? ''),
            gatewayPaymentId: subscriptionCfPaymentId || undefined,
            gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId || undefined,
            actor: 'cashfree-subscription-webhook',
          });
          this.logger.log(
            { settled, isAuthPayment, subscriptionPaymentId: subscriptionPaymentId ?? null, cfSubscriptionId, requestId: req.id },
            settled
              ? 'Cashfree subscription payment settled'
              : 'Cashfree subscription payment was not settled, so no order was created',
          );
          if (isAuthPayment && !settled) {
            await this.productSubscriptionsService.tryChargeCashfreeFirstOrderAfterAuth({
              gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId,
              actor: 'cashfree-subscription-webhook',
            });
          }
        }
      } else if (
        eventType === 'SUBSCRIPTION_AUTH_STATUS' &&
        subscription.paymentStatus.toUpperCase() === 'SUCCESS'
      ) {
        if (subscriptionStatus) {
          await this.subscriptionMandateService.handleProviderWebhook({
            provider: SubscriptionMandateProvider.CASHFREE,
            gatewayMandateId: cfSubscriptionId || undefined,
            gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId,
            authorizationOrderId: merchantSubscriptionId || undefined,
            gatewayPaymentId: subscriptionCfPaymentId || undefined,
            status: mapCashfreeSubscriptionStatus(subscriptionStatus),
            actor: 'cashfree-webhook',
            raw: payload,
          });
        } else {
          this.logger.log(
            {
              eventType,
              merchantSubscriptionId: merchantSubscriptionId || null,
              cfSubscriptionId: cfSubscriptionId || null,
              paymentStatus: subscription.paymentStatus,
              requestId: req.id,
            },
            'Cashfree authorization succeeded without a subscription status; confirming mandate from Cashfree',
          );
          await this.subscriptionMandateService.confirmFromAuthorizationPayment({
            gatewayOrderId: merchantSubscriptionId || cfSubscriptionId,
            gatewayPaymentId: subscriptionCfPaymentId || undefined,
            actor: 'cashfree-webhook',
          });
        }
        const paymentId =
          subscriptionPaymentId ||
          (await this.subscriptionMandateService.recordedFirstChargePaymentId(
            merchantSubscriptionId || cfSubscriptionId,
          )) ||
          undefined;
        const settled = await this.productSubscriptionsService.settleCashfreeSubscriptionPayment({
          paymentId,
          gatewayOrderId: subscription.paymentId || merchantSubscriptionId || String(orderId ?? ''),
          gatewayPaymentId: subscriptionCfPaymentId || undefined,
          gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId || undefined,
          actor: 'cashfree-subscription-webhook',
        });
        this.logger.log(
          { settled, subscriptionPaymentId: paymentId ?? null, cfSubscriptionId, requestId: req.id },
          settled
            ? 'Cashfree authorization matched the product amount and was settled'
            : 'Cashfree AUTH succeeded — product order was not marked paid from a mismatched AUTH amount',
        );
        if (!settled) {
          await this.productSubscriptionsService.tryChargeCashfreeFirstOrderAfterAuth({
            gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId,
            actor: 'cashfree-subscription-webhook',
          });
        }
      } else if (!subscriptionStatus) {
        this.logger.log(
          {
            eventType,
            merchantSubscriptionId: merchantSubscriptionId || null,
            cfSubscriptionId: cfSubscriptionId || null,
            paymentStatus: subscription.paymentStatus || null,
            requestId: req.id,
          },
          'Cashfree subscription webhook had no status, so the mandate was left unchanged',
        );
      } else {
        const mandateMatched = await this.subscriptionMandateService.handleProviderWebhook({
          provider: SubscriptionMandateProvider.CASHFREE,
          gatewayMandateId: cfSubscriptionId || undefined,
          gatewaySubscriptionId: merchantSubscriptionId || cfSubscriptionId,
          authorizationOrderId: merchantSubscriptionId || undefined,
          status: mapCashfreeSubscriptionStatus(subscriptionStatus),
          actor: 'cashfree-webhook',
          raw: payload,
        });
        this.logger.log(
          {
            eventType,
            mandateMatched,
            subscriptionStatus: subscriptionStatus || null,
            merchantSubscriptionId: merchantSubscriptionId || null,
            cfSubscriptionId: cfSubscriptionId || null,
            requestId: req.id,
          },
          mandateMatched
            ? 'Cashfree mandate status applied'
            : 'Cashfree mandate webhook did not match a subscription',
        );
        if (subscriptionStatus.toUpperCase() === 'ACTIVE' && !isAuthPayment) {
          const paymentId = await this.subscriptionMandateService.firstChargePaymentIdIfReady(
            merchantSubscriptionId || cfSubscriptionId,
          );
          if (!paymentId) {
            this.logger.warn(
              { merchantSubscriptionId, cfSubscriptionId, requestId: req.id },
              'Cashfree subscription is active, but the product payment is not ready, so no order was created',
            );
          } else {
            const settled = await this.productSubscriptionsService.settleCashfreeSubscriptionPayment({
              paymentId,
              gatewaySubscriptionId: cfSubscriptionId || merchantSubscriptionId || undefined,
              actor: 'cashfree-subscription-webhook',
            });
            this.logger.log(
              { settled, paymentId, cfSubscriptionId, requestId: req.id },
              settled
                ? 'Cashfree active subscription settled the product payment'
                : 'Cashfree subscription is active, but the product payment did not settle, so no order was created',
            );
          }
        }
      }
    } else if (eventType === 'REFUND_STATUS_WEBHOOK' || eventType === 'REFUND_WEBHOOK') {
      const refundData = data?.['refund'] as Record<string, any> | undefined;
      await this.eventEmitter.emitAsync(EVENTS.REFUND_PROVIDER_UPDATED, {
        provider: 'CASHFREE',
        providerStatus: String(refundData?.['refund_status'] ?? refundData?.['status'] ?? eventType),
        providerRefundId: refundData?.['cf_refund_id'] ? String(refundData['cf_refund_id']) : null,
        merchantRefundReference: refundData?.['refund_id'] ? String(refundData['refund_id']) : null,
        orderId: null,
      });
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
      | {
          entity?: {
            id?: string;
            order_id?: string;
            status?: string;
            /** Razorpay amount in paise */
            amount?: number | string;
            error_description?: string;
            notes?: Record<string, unknown>;
          };
        }
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

    const eventId = `${event}:${paymentEntity?.entity?.id ?? orderId ?? linkId ?? 'none'}`;
    const fresh = await this.subscriptionWebhookEvents.tryRecord({
      provider: 'RAZORPAY',
      eventId,
      eventType: event,
    });
    if (!fresh && event.startsWith('token.')) {
      if (event === 'token.confirmed') {
        const duplicateToken = payloadData?.['token'] as { entity?: { id?: string } } | undefined;
        await this.productSubscriptionsService.resumeCardProductCharge(duplicateToken?.entity?.id);
      }
      return { received: true, event, requestId: req.id, duplicate: true };
    }

    const razorpayAmountPaise = Number(paymentEntity?.entity?.amount);
    const razorpayAmountRupees = Number.isFinite(razorpayAmountPaise)
      ? razorpayAmountPaise / 100
      : null;

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
        await this.paymentRequestsService.handlePaymentLinkPaid(
          linkId,
          paymentEntity?.entity?.id,
          'razorpay-webhook',
          razorpayAmountRupees,
        );
      }
    } else if (event === 'payment_link.cancelled' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkCancelled(linkId);
    } else if (event === 'payment_link.expired' && linkId) {
      await this.paymentRequestsService.handlePaymentLinkExpired(linkId);
    } else if (event === 'payment.authorized' || event === 'payment.captured' || event === 'order.paid') {
      const subscriptionPurpose =
        paymentPurpose === SUBSCRIPTION_PAYMENT_PURPOSE.PRODUCT_SUBSCRIPTION ||
        paymentPurpose === SUBSCRIPTION_PAYMENT_PURPOSE.MEMBERSHIP;
      let markSubscriptionPaid = false;
      if (subscriptionPurpose) {
        const settlement = razorpaySubscriptionEventSettlesPayment(event, paymentEntity?.entity?.status);
        markSubscriptionPaid =
          settlement === 'paid' ||
          (settlement === 'verify' &&
            (await this.productSubscriptionsService.isRazorpayChargeCaptured({
              gatewayOrderId: orderId,
              gatewayPaymentId: paymentEntity?.entity?.id,
            })));
        if (!markSubscriptionPaid) {
          this.logger.log(
            { event, orderId, paymentStatus: paymentEntity?.entity?.status, requestId: req.id },
            'Subscription payment was not captured, so it was not marked paid',
          );
        }
      }
      if (!subscriptionPurpose || markSubscriptionPaid) {
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
          await this.paymentRequestsService.handlePaymentCaptured(
            paymentRequestId,
            paymentEntity?.entity?.id,
            razorpayAmountRupees,
          );
        } else if (orderId) {
          await this.paymentRequestsService.handlePaymentLinkPaid(
            orderId,
            paymentEntity?.entity?.id,
            'razorpay-webhook',
            razorpayAmountRupees,
          );
        } else if (linkId) {
          await this.paymentRequestsService.handlePaymentLinkPaid(
            linkId,
            paymentEntity?.entity?.id,
            'razorpay-webhook',
            razorpayAmountRupees,
          );
        }
      }
      }
    } else if (event === 'payment.failed') {
      if (orderId) {
        await this.productSubscriptionsService.handlePaymentFailed({
          gatewayOrderId: orderId,
          reason: paymentEntity?.entity?.error_description,
          actor: 'razorpay-webhook',
        });
      }
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentFailed(
          paymentRequestId,
          paymentEntity?.entity?.error_description,
        );
      } else if (orderId) {
        await this.paymentRequestsService.handlePaymentFailedByProviderReference(
          orderId,
          paymentEntity?.entity?.error_description,
          'razorpay-webhook',
        );
      } else if (linkId) {
        await this.paymentRequestsService.handlePaymentFailedByProviderReference(
          linkId,
          paymentEntity?.entity?.error_description,
          'razorpay-webhook',
        );
      }
    } else if (event === 'payment.pending') {
      if (paymentRequestId) {
        await this.paymentRequestsService.handlePaymentPending(paymentRequestId);
      }
    } else if (
      event === 'token.confirmed' ||
      event === 'token.cancelled' ||
      event === 'token.paused' ||
      event === 'token.rejected'
    ) {
      const tokenEntity = payloadData?.['token'] as
        | { entity?: { id?: string; status?: string; recurring_status?: string; customer_id?: string } }
        | undefined;
      await this.subscriptionMandateService.handleProviderWebhook({
        provider: SubscriptionMandateProvider.RAZORPAY,
        gatewayMandateId: tokenEntity?.entity?.id,
        gatewayCustomerId: tokenEntity?.entity?.customer_id,
        status: mapRazorpayTokenStatus(
          tokenEntity?.entity?.recurring_status ?? tokenEntity?.entity?.status ?? event.replace('token.', ''),
        ),
        actor: 'razorpay-webhook',
        raw: payload,
      });
      if (event === 'token.confirmed') {
        await this.productSubscriptionsService.collectCardProductAfterTokenConfirmed(
          tokenEntity?.entity?.id,
        );
      }
    } else if (
      event === 'refund.processed' ||
      event === 'refund.failed' ||
      event === 'refund.created' ||
      event === 'refund.updated'
    ) {
      const refundEntity = payloadData?.['refund'] as
        | { entity?: { id?: string; status?: string; receipt?: string; notes?: Record<string, unknown> } }
        | undefined;
      const refundId = refundEntity?.entity?.id;
      const refundStatus = String(refundEntity?.entity?.status ?? event);
      const receipt = refundEntity?.entity?.receipt;
      await this.eventEmitter.emitAsync(EVENTS.REFUND_PROVIDER_UPDATED, {
        provider: 'RAZORPAY',
        providerStatus: refundStatus,
        providerRefundId: refundId ?? null,
        merchantRefundReference: receipt ?? null,
        orderId: null,
      });
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
