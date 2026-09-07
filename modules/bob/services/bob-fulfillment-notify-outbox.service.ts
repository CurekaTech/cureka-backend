import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { generateUniqueRefId } from '@packages/common';
import { BobNotifyService } from './bob-notify.service';
import { BobNotifyOutboxRepository } from '../repositories/bob-notify-outbox.repository';
import { BobFulfillmentPayload } from '../interfaces/bob.interface';

export const BOB_FULFILLMENT_NOTIFY_KIND = 'fulfillments-create';

/** Sending lease length — expired leases may be reclaimed by another worker. */
const CLAIM_LEASE_MS = 60_000;

@Injectable()
export class BobFulfillmentNotifyOutboxService {
  private readonly logger = new Logger(BobFulfillmentNotifyOutboxService.name);

  constructor(
    private readonly outboxRepository: BobNotifyOutboxRepository,
    private readonly bobNotifyService: BobNotifyService,
  ) {}

  fulfillmentIdempotencyKey(orderId: string): string {
    return `${BOB_FULFILLMENT_NOTIFY_KIND}:${orderId}`;
  }

  async hasAcceptedFulfillment(orderId: string): Promise<boolean> {
    const row = await this.outboxRepository.findAcceptedForOrderKind(
      orderId,
      BOB_FULFILLMENT_NOTIFY_KIND,
    );
    return Boolean(row);
  }

  /** Accepted, suppressed, ambiguous, or in-flight sending blocks another customer notify. */
  async hasBlockingFulfillment(orderId: string): Promise<boolean> {
    const row = await this.outboxRepository.findBlockingForOrderKind(
      orderId,
      BOB_FULFILLMENT_NOTIFY_KIND,
    );
    return Boolean(row);
  }

  /**
   * Persist suppression so later webhooks / GET sync cannot enqueue WhatsApp #2.
   * Used by recovery `--apply` without `--notify`.
   */
  async suppressFulfillmentNotify(params: {
    orderId: string;
    orderNumber: string;
    shipmentId?: string | null;
    reason: string;
  }): Promise<{ status: 'suppressed' | 'skipped'; reason?: string }> {
    const idempotencyKey = this.fulfillmentIdempotencyKey(params.orderId);
    const existing = await this.outboxRepository.findByIdempotencyKey(idempotencyKey);
    if (existing?.status === 'accepted' || existing?.status === 'suppressed') {
      return { status: 'skipped', reason: `already_${existing.status}` };
    }
    if (existing?.status === 'ambiguous') {
      return { status: 'skipped', reason: 'already_ambiguous' };
    }

    if (!existing) {
      try {
        const refId = await generateUniqueRefId('bno', (candidate) =>
          this.outboxRepository.existsByRefId(candidate),
        );
        await this.outboxRepository.create({
          refId,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          shipmentId: params.shipmentId ?? null,
          notificationKind: BOB_FULFILLMENT_NOTIFY_KIND,
          idempotencyKey,
          status: 'suppressed',
          attempts: 0,
          lastError: params.reason,
          payloadSnapshot: { suppressReason: params.reason },
          createdBy: 'bob-fulfillment-outbox',
          updatedBy: 'bob-fulfillment-outbox',
        });
        return { status: 'suppressed' };
      } catch {
        const raced = await this.outboxRepository.findByIdempotencyKey(idempotencyKey);
        if (raced?.status === 'accepted' || raced?.status === 'suppressed') {
          return { status: 'skipped', reason: `already_${raced.status}` };
        }
        throw new Error('Failed to create suppression outbox row');
      }
    }

    await this.outboxRepository.updateStatus(existing.id, {
      status: 'suppressed',
      lastError: params.reason,
      lockedAt: null,
      claimToken: null,
    });
    return { status: 'suppressed' };
  }

  /**
   * Durable, PM2-safe fulfillment notify with atomic claim.
   * Timeout / unknown network outcomes become `ambiguous` (no auto-retry) to avoid
   * duplicate WhatsApp when BOB may already have accepted.
   */
  async enqueueAndSendFulfillment(params: {
    orderId: string;
    orderNumber: string;
    shipmentId: string;
    payload: BobFulfillmentPayload;
  }): Promise<{ status: 'accepted' | 'failed' | 'skipped' | 'ambiguous'; reason?: string }> {
    const idempotencyKey = this.fulfillmentIdempotencyKey(params.orderId);
    let outbox = await this.outboxRepository.findByIdempotencyKey(idempotencyKey);

    if (outbox?.status === 'accepted') {
      return { status: 'skipped', reason: 'already_accepted' };
    }
    if (outbox?.status === 'suppressed') {
      return { status: 'skipped', reason: 'suppressed' };
    }
    if (outbox?.status === 'ambiguous') {
      return {
        status: 'skipped',
        reason: 'ambiguous_prior_send_requires_manual_reconcile',
      };
    }

    if (!outbox) {
      try {
        const refId = await generateUniqueRefId('bno', (candidate) =>
          this.outboxRepository.existsByRefId(candidate),
        );
        outbox = await this.outboxRepository.create({
          refId,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          shipmentId: params.shipmentId,
          notificationKind: BOB_FULFILLMENT_NOTIFY_KIND,
          idempotencyKey,
          status: 'pending',
          attempts: 0,
          payloadSnapshot: {
            fulfillment_id: params.payload.fulfillment_id,
            tracking_number: params.payload.tracking_info?.tracking_number ?? null,
            shipping_status: params.payload.tracking_info?.shipping_status ?? null,
          },
          createdBy: 'bob-fulfillment-outbox',
          updatedBy: 'bob-fulfillment-outbox',
        });
      } catch {
        outbox = await this.outboxRepository.findByIdempotencyKey(idempotencyKey);
        if (!outbox) {
          return { status: 'failed', reason: 'outbox_create_failed' };
        }
        if (outbox.status === 'accepted' || outbox.status === 'suppressed') {
          return { status: 'skipped', reason: `already_${outbox.status}` };
        }
        if (outbox.status === 'ambiguous') {
          return { status: 'skipped', reason: 'ambiguous_prior_send_requires_manual_reconcile' };
        }
      }
    }

    const claimToken = createHash('sha256').update(`${randomUUID()}:${idempotencyKey}`).digest('hex').slice(0, 32);
    const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS);
    const claimed = await this.outboxRepository.claimForSend(outbox.id, claimToken, staleBefore);
    if (!claimed) {
      const current = await this.outboxRepository.findByIdempotencyKey(idempotencyKey);
      return {
        status: 'skipped',
        reason: `claim_failed_${current?.status ?? 'missing'}`,
      };
    }

    const result = await this.bobNotifyService.post('/fulfillments-create', params.payload, {
      idempotencyKey,
    });
    const attempts = (claimed.attempts ?? 0) + 1;

    if (result.accepted) {
      await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
        status: 'accepted',
        attempts,
        lastHttpStatus: result.httpStatus,
        lastError: null,
        acceptedAt: new Date(),
      });
      this.logger.log(
        {
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          shipmentId: params.shipmentId,
          outboxId: claimed.id,
          httpStatus: result.httpStatus,
          idempotencyKey,
        },
        '[BOB outbox] fulfillment notify accepted by BOB (WhatsApp delivery is BOB-side)',
      );
      return { status: 'accepted' };
    }

    // No HTTP status / transport timeout: BOB may have accepted — do not auto-retry.
    if (result.httpStatus == null) {
      await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
        status: 'ambiguous',
        attempts,
        lastHttpStatus: null,
        lastError: result.error ?? 'transport_timeout_or_unknown',
        acceptedAt: null,
      });
      this.logger.warn(
        {
          orderId: params.orderId,
          outboxId: claimed.id,
          error: result.error,
          idempotencyKey,
        },
        '[BOB outbox] ambiguous outcome after send — suppressed auto-retry to avoid duplicates',
      );
      return { status: 'ambiguous', reason: result.error };
    }

    await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
      status: 'failed',
      attempts,
      lastHttpStatus: result.httpStatus,
      lastError: result.error ?? 'rejected',
      acceptedAt: null,
    });
    this.logger.warn(
      {
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        outboxId: claimed.id,
        httpStatus: result.httpStatus,
        error: result.error,
      },
      '[BOB outbox] fulfillment notify rejected — retryable failed state',
    );
    return { status: 'failed', reason: result.error };
  }
}
