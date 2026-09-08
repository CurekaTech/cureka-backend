import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '@packages/events';
import { REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE } from '../constants/refund-request.constants';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundRequestsService } from '../services/refund-request.service';

export class RefundProviderUpdatedEvent {
  constructor(
    public readonly provider: RefundPaymentProvider,
    public readonly providerStatus: string,
    public readonly providerRefundId?: string | null,
    public readonly merchantRefundReference?: string | null,
    public readonly orderId?: string | null,
  ) {}
}

@Injectable()
export class RefundRequestListener {
  private readonly logger = new Logger(RefundRequestListener.name);

  constructor(private readonly refundRequestsService: RefundRequestsService) {}

  @OnEvent(EVENTS.REFUND_PROVIDER_UPDATED)
  async onProviderUpdated(event: RefundProviderUpdatedEvent): Promise<void> {
    const provider = String(event.provider ?? '').toUpperCase() as RefundPaymentProvider;
    this.logger.log(
      {
        provider,
        providerRefundId: event.providerRefundId ?? null,
        status: event.providerStatus,
      },
      'Applying provider refund webhook to refund request',
    );
    await this.refundRequestsService.applyProviderWebhook({
      provider,
      providerRefundId: event.providerRefundId,
      merchantRefundReference: event.merchantRefundReference,
      providerStatus: event.providerStatus,
      orderId: event.orderId,
    });
  }

  @OnEvent(EVENTS.REFUND_REQUEST_CREATED)
  onRefundRequestCreated(payload: { refundRequestId?: string; orderNumber?: string }): void {
    this.logger.log(
      {
        refundRequestId: payload.refundRequestId ?? null,
        orderNumber: payload.orderNumber ?? null,
        customerMessage: REFUND_REQUEST_INITIATED_CUSTOMER_MESSAGE,
      },
      'REFUND_REQUEST_CREATED — customer should see request-initiated copy; no MSG91 DLT template is configured yet',
    );
  }

  @OnEvent(EVENTS.REFUND_REQUEST_APPROVED)
  onRefundRequestApproved(payload: { refundRequestId?: string }): void {
    this.logger.log({ refundRequestId: payload.refundRequestId ?? null }, 'REFUND_REQUEST_APPROVED');
  }

  @OnEvent(EVENTS.REFUND_REQUEST_REJECTED)
  onRefundRequestRejected(payload: { refundRequestId?: string }): void {
    this.logger.log({ refundRequestId: payload.refundRequestId ?? null }, 'REFUND_REQUEST_REJECTED');
  }

  @OnEvent(EVENTS.REFUND_PROCESSING_STARTED)
  onRefundProcessingStarted(payload: { refundRequestId?: string }): void {
    this.logger.log({ refundRequestId: payload.refundRequestId ?? null }, 'REFUND_PROCESSING_STARTED');
  }

  @OnEvent(EVENTS.REFUND_PROCESSED)
  onRefundProcessed(payload: { refundRequestId?: string }): void {
    this.logger.log({ refundRequestId: payload.refundRequestId ?? null }, 'REFUND_PROCESSED');
  }

  @OnEvent(EVENTS.REFUND_FAILED)
  onRefundFailed(payload: { refundRequestId?: string }): void {
    this.logger.log({ refundRequestId: payload.refundRequestId ?? null }, 'REFUND_FAILED');
  }
}
