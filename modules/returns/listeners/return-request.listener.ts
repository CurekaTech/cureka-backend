import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS } from '@packages/events';
import { RETURN_SUBMITTED_CUSTOMER_MESSAGE } from '../constants/return.constants';
import { ReturnWorkflowService } from '../services/return-workflow.service';

/**
 * Notification hooks for the return lifecycle.
 *
 * These log the intended customer message rather than sending it: MSG91 DLT
 * templates for returns have not been provisioned, and inventing template IDs
 * would fail silently in production.
 */
@Injectable()
export class ReturnRequestListener {
  private readonly logger = new Logger(ReturnRequestListener.name);

  constructor(private readonly workflowService: ReturnWorkflowService) {}

  /** Closes the return once its linked refund reaches the processed state. */
  @OnEvent(EVENTS.REFUND_PROCESSED)
  async onRefundProcessed(payload: { refundRequestId?: string }): Promise<void> {
    if (!payload.refundRequestId) return;
    await this.workflowService.onLinkedRefundProcessed(payload.refundRequestId);
  }

  @OnEvent(EVENTS.RETURN_REQUEST_CREATED)
  onCreated(payload: { returnNumber?: string; customerId?: string | null }): void {
    this.logger.log(
      {
        returnNumber: payload.returnNumber ?? null,
        customerId: payload.customerId ?? null,
        customerMessage: RETURN_SUBMITTED_CUSTOMER_MESSAGE,
      },
      'RETURN_REQUEST_CREATED — no MSG91 DLT template is configured for returns yet',
    );
  }

  @OnEvent(EVENTS.RETURN_REQUEST_APPROVED)
  onApproved(payload: { returnNumber?: string; pickupRequired?: boolean }): void {
    this.logger.log(
      { returnNumber: payload.returnNumber ?? null, pickupRequired: payload.pickupRequired ?? null },
      'RETURN_REQUEST_APPROVED',
    );
  }

  @OnEvent(EVENTS.RETURN_REQUEST_REJECTED)
  onRejected(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_REQUEST_REJECTED');
  }

  @OnEvent(EVENTS.RETURN_INFORMATION_REQUESTED)
  onInformationRequested(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_INFORMATION_REQUESTED');
  }

  @OnEvent(EVENTS.RETURN_PICKUP_SCHEDULED)
  onPickupScheduled(payload: { returnNumber?: string; reverseAwbNumber?: string | null }): void {
    this.logger.log(
      {
        returnNumber: payload.returnNumber ?? null,
        reverseAwbNumber: payload.reverseAwbNumber ?? null,
      },
      'RETURN_PICKUP_SCHEDULED',
    );
  }

  @OnEvent(EVENTS.RETURN_PICKUP_UPDATED)
  onPickupUpdated(payload: { returnNumber?: string; pickupStatus?: string }): void {
    this.logger.log(
      { returnNumber: payload.returnNumber ?? null, pickupStatus: payload.pickupStatus ?? null },
      'RETURN_PICKUP_UPDATED',
    );
  }

  @OnEvent(EVENTS.RETURN_RECEIVED_AT_WAREHOUSE)
  onReceived(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_RECEIVED_AT_WAREHOUSE');
  }

  @OnEvent(EVENTS.RETURN_QC_COMPLETED)
  onQcCompleted(payload: { returnNumber?: string; result?: string }): void {
    this.logger.log(
      { returnNumber: payload.returnNumber ?? null, result: payload.result ?? null },
      'RETURN_QC_COMPLETED',
    );
  }

  @OnEvent(EVENTS.RETURN_REFUND_LINKED)
  onRefundLinked(payload: { returnNumber?: string; refundRequestId?: string }): void {
    this.logger.log(
      {
        returnNumber: payload.returnNumber ?? null,
        refundRequestId: payload.refundRequestId ?? null,
      },
      'RETURN_REFUND_LINKED — refund still requires finance approval and initiation',
    );
  }

  @OnEvent(EVENTS.RETURN_REPLACEMENT_LINKED)
  onReplacementLinked(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_REPLACEMENT_LINKED');
  }

  @OnEvent(EVENTS.RETURN_COMPLETED)
  onCompleted(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_COMPLETED');
  }

  @OnEvent(EVENTS.SHIPWAY_WEBHOOK_RECEIVED)
  async onShipwayWebhook(payload: {
    orderId?: string;
    awbNumber?: string | null;
    status?: string | null;
    statusCode?: string | null;
    eventId?: string | null;
    trackingUrl?: string | null;
    courierName?: string | null;
    statusDate?: string | null;
  }): Promise<void> {
    try {
      const matched = await this.workflowService.applyShipwayTrackingEvent(payload);
      if (matched) {
        this.logger.log(
          { orderId: payload.orderId ?? null, awbNumber: payload.awbNumber ?? null },
          'Applied Shipway webhook to return pickup',
        );
      }
    } catch (error) {
      this.logger.warn(
        {
          orderId: payload.orderId ?? null,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to apply Shipway webhook to return pickup',
      );
    }
  }

  @OnEvent(EVENTS.RETURN_CANCELLED)
  onCancelled(payload: { returnNumber?: string }): void {
    this.logger.log({ returnNumber: payload.returnNumber ?? null }, 'RETURN_CANCELLED');
  }
}
