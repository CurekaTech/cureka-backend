import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { GokwikRepository } from '@modules/gokwik/repositories/gokwik.repository';
import { GokwikWebhookService } from '@modules/gokwik/services/gokwik-webhook.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { PaymentRequestsRepository } from '@modules/payment-requests/repositories/payment-requests.repository';
import { CashfreePaymentService } from '@modules/payment-requests/services/cashfree-payment.service';
import { RazorpayPaymentLinksService } from '@modules/payment-requests/services/razorpay-payment-links.service';
import {
  REFUND_PROVIDER_NOT_FOUND,
  REFUND_PROVIDER_NOT_SUPPORTED,
  REFUND_PROVIDER_REQUEST_FAILED,
} from '../constants/refund-request.constants';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundRequestEntity } from '../entities/refund-request.entity';

export type ProviderRefundResult = {
  providerRefundId: string | null;
  providerStatus: string;
  completed: boolean;
  failed: boolean;
  uncertain: boolean;
  responseReference: string | null;
  failureCode?: string;
  failureMessage?: string;
};

@Injectable()
export class RefundProcessorService {
  private readonly logger = new Logger(RefundProcessorService.name);

  constructor(
    private readonly gokwikWebhookService: GokwikWebhookService,
    private readonly gokwikRepository: GokwikRepository,
    private readonly razorpayService: RazorpayPaymentLinksService,
    private readonly cashfreeService: CashfreePaymentService,
    private readonly paymentRequestsRepository: PaymentRequestsRepository,
  ) {}

  async initiate(
    request: RefundRequestEntity,
    order: OrderEntity,
    amount: number,
    description: string,
  ): Promise<ProviderRefundResult> {
    switch (request.paymentProvider) {
      case RefundPaymentProvider.GOKWIK:
        return this.initiateGokwik(request, order, amount, description);
      case RefundPaymentProvider.RAZORPAY:
        return this.initiateRazorpay(request, amount, description);
      case RefundPaymentProvider.CASHFREE:
        return this.initiateCashfree(request, amount, description);
      case RefundPaymentProvider.COD:
        throw new BadRequestException({
          code: REFUND_PROVIDER_NOT_SUPPORTED,
          message: 'COD orders have no captured online payment to refund',
        });
      default:
        throw new BadRequestException({
          code: REFUND_PROVIDER_NOT_FOUND,
          message: 'Original payment provider could not be used for refund',
        });
    }
  }

  async reconcile(request: RefundRequestEntity): Promise<ProviderRefundResult> {
    switch (request.paymentProvider) {
      case RefundPaymentProvider.RAZORPAY:
        if (!request.providerRefundId) {
          return this.uncertain('Missing Razorpay refund id');
        }
        return this.mapRazorpay(await this.razorpayService.fetchRefund(request.providerRefundId));
      case RefundPaymentProvider.CASHFREE: {
        const merchantOrderId = await this.resolveCashfreeMerchantOrderId(request);
        const payload = await this.cashfreeService.getRefund(
          merchantOrderId,
          request.merchantRefundReference,
        );
        return this.mapCashfree(payload);
      }
      case RefundPaymentProvider.GOKWIK: {
        if (!request.providerRefundId) {
          return this.uncertain('Missing GoKwik refund id');
        }
        const existing = await this.gokwikRepository.findRefundByRefundId(request.providerRefundId);
        const status = existing?.status ?? request.providerRefundStatus ?? 'initiated';
        const normalized = status.toLowerCase();
        return {
          providerRefundId: request.providerRefundId,
          providerStatus: status,
          completed: normalized.includes('success'),
          failed: normalized.includes('fail') || normalized.includes('cancel'),
          uncertain: !normalized.includes('success') && !normalized.includes('fail'),
          responseReference: request.providerRefundId,
        };
      }
      default:
        throw new BadRequestException({
          code: REFUND_PROVIDER_NOT_SUPPORTED,
          message: 'Provider status cannot be reconciled for this payment source',
        });
    }
  }

  private async initiateGokwik(
    request: RefundRequestEntity,
    order: OrderEntity,
    amount: number,
    description: string,
  ): Promise<ProviderRefundResult> {
    try {
      const refundId = await this.gokwikWebhookService.initiateRefund(
        order.id,
        amount,
        description,
      );
      return {
        providerRefundId: refundId,
        providerStatus: 'initiated',
        completed: false,
        failed: false,
        uncertain: false,
        responseReference: refundId,
      };
    } catch (error) {
      return this.fromProviderError(error, request.refId);
    }
  }

  private async initiateRazorpay(
    request: RefundRequestEntity,
    amount: number,
    description: string,
  ): Promise<ProviderRefundResult> {
    if (!request.providerPaymentId) {
      throw new BadRequestException({
        code: REFUND_PROVIDER_NOT_FOUND,
        message: 'Razorpay payment id is missing; the request must stay in review',
      });
    }
    try {
      const payload = await this.razorpayService.createRefund({
        paymentId: request.providerPaymentId,
        amount,
        receipt: request.merchantRefundReference,
        notes: {
          refundRequestRefId: request.refId,
          orderNumber: request.orderNumber,
          description,
        },
      });
      return this.mapRazorpay(payload);
    } catch (error) {
      return this.fromProviderError(error, request.refId);
    }
  }

  private async initiateCashfree(
    request: RefundRequestEntity,
    amount: number,
    description: string,
  ): Promise<ProviderRefundResult> {
    try {
      const merchantOrderId = await this.resolveCashfreeMerchantOrderId(request);
      const payload = await this.cashfreeService.createRefund({
        merchantOrderId,
        refundId: request.merchantRefundReference,
        amount,
        note: description,
      });
      return this.mapCashfree(payload);
    } catch (error) {
      return this.fromProviderError(error, request.refId);
    }
  }

  private async resolveCashfreeMerchantOrderId(request: RefundRequestEntity): Promise<string> {
    if (!request.paymentRequestId) {
      throw new BadRequestException({
        code: REFUND_PROVIDER_NOT_FOUND,
        message: 'Cashfree merchant order id is missing',
      });
    }
    const paymentRequest = await this.paymentRequestsRepository.findById(request.paymentRequestId);
    if (!paymentRequest?.refId) {
      throw new BadRequestException({
        code: REFUND_PROVIDER_NOT_FOUND,
        message: 'Cashfree merchant order id is missing',
      });
    }
    return paymentRequest.refId;
  }

  private mapRazorpay(payload: Record<string, unknown>): ProviderRefundResult {
    const status = String(payload['status'] ?? 'created').toLowerCase();
    const id = typeof payload['id'] === 'string' ? payload['id'] : null;
    return {
      providerRefundId: id,
      providerStatus: status,
      completed: status === 'processed',
      failed: status === 'failed',
      uncertain: status === 'pending' || status === 'created',
      responseReference: id,
    };
  }

  private mapCashfree(payload: Record<string, unknown>): ProviderRefundResult {
    const status = String(payload['refund_status'] ?? payload['status'] ?? 'PENDING').toUpperCase();
    const id =
      (typeof payload['cf_refund_id'] === 'string' && payload['cf_refund_id']) ||
      (typeof payload['refund_id'] === 'string' && payload['refund_id']) ||
      null;
    return {
      providerRefundId: id,
      providerStatus: status,
      completed: status === 'SUCCESS',
      failed: status === 'CANCELLED' || status === 'FAILED',
      uncertain: status === 'PENDING' || status === 'ONHOLD',
      responseReference: id,
    };
  }

  private fromProviderError(error: unknown, refId: string): ProviderRefundResult {
    const message = error instanceof Error ? error.message : String(error);
    const uncertain = /timeout|ECONN|network|503|504/i.test(message);
    this.logger.error(
      {
        refundRequestRefId: refId,
        uncertain,
        error: message,
      },
      'Provider refund call failed',
    );
    if (uncertain) {
      return this.uncertain(message);
    }
    return {
      providerRefundId: null,
      providerStatus: 'failed',
      completed: false,
      failed: true,
      uncertain: false,
      responseReference: null,
      failureCode: REFUND_PROVIDER_REQUEST_FAILED,
      failureMessage: message,
    };
  }

  private uncertain(message: string): ProviderRefundResult {
    return {
      providerRefundId: null,
      providerStatus: 'pending_reconciliation',
      completed: false,
      failed: false,
      uncertain: true,
      responseReference: null,
      failureCode: 'PENDING_RECONCILIATION',
      failureMessage: message,
    };
  }
}
