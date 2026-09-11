import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { generateUniqueRefId } from '@packages/common';
import { RedisConnectionService } from '@packages/cache';
import { canonicalizeIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { AdminAbandonedCartsService } from '@modules/orders/services/admin-abandoned-carts.service';
import { CartsRepository } from '@modules/orders/repositories/carts.repository';
import { AbandonedCartNotifyCandidate } from '@modules/orders/interfaces/abandoned-cart.interface';
import { resolveCartCustomerActivityAt } from '@modules/orders/utils/cart-activity.util';
import { UsersService } from '@modules/users/services/users.service';
import { QueryFailedError } from 'typeorm';
import {
  BOB_ABANDONED_CART_CLAIM_LEASE_MS,
  BOB_ABANDONED_CART_NOTIFY_KIND,
  BOB_ABANDONED_CART_PATH,
  BOB_ABANDONED_CART_PERMANENT_HTTP,
  BobAbandonedCartSendJobData,
} from '../constants/bob-abandoned-cart.constants';
import { BobAbandonedCartOutboxEntity } from '../entities/bob-abandoned-cart-outbox.entity';
import { mapCurekaAbandonedCartToBob } from '../mappers/bob.mapper';
import { BobAbandonedCartOutboxRepository } from '../repositories/bob-abandoned-cart-outbox.repository';
import { toBobE164Phone } from '../utils/bob.util';
import {
  evaluateAbandonedCartEligibility,
  isRetryableBobHttpStatus,
  maskPhoneForLog,
  sanitizeAbandonedCartError,
} from '../utils/abandoned-cart-eligibility.util';
import { BobAbandonedCartQueueService } from './bob-abandoned-cart-queue.service';
import { BobNotifyService } from './bob-notify.service';

const SCAN_LOCK_KEY = 'bob:abandoned-cart:scan';
const SCAN_LOCK_TTL_MS = 10 * 60_000;

export type AbandonedCartScanSummary = {
  scanned: number;
  eligible: number;
  queued: number;
  skipped: number;
  skippedReasons: Record<string, number>;
};

export type AbandonedCartSendResult = {
  status: 'accepted' | 'failed' | 'skipped' | 'ambiguous' | 'retry';
  reason?: string;
};

@Injectable()
export class BobAbandonedCartNotifyService {
  private readonly logger = new Logger(BobAbandonedCartNotifyService.name);
  private readonly localLocks = new Set<string>();

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisConnectionService,
    private readonly cartsRepository: CartsRepository,
    private readonly usersService: UsersService,
    private readonly abandonedCartsService: AdminAbandonedCartsService,
    private readonly outboxRepository: BobAbandonedCartOutboxRepository,
    private readonly queueService: BobAbandonedCartQueueService,
    private readonly bobNotifyService: BobNotifyService,
  ) {}

  isEnabled(): boolean {
    return this.settings().enabled && this.isNotifyConfigured();
  }

  isNotifyConfigured(): boolean {
    const notifyUrl = this.configService.get<string>('bob.notifyUrl')?.trim() ?? '';
    const guestId =
      this.configService.get<string>('bob.guestId')?.trim() ||
      this.configService.get<string>('bob.apiKey')?.trim() ||
      '';
    return Boolean(notifyUrl && guestId);
  }

  settings(): {
    enabled: boolean;
    scanIntervalMs: number;
    inactivityMs: number;
    cooldownMs: number;
    batchSize: number;
    maxBatchesPerScan: number;
    maxAttempts: number;
  } {
    const cfg = this.configService.get<{
      enabled?: boolean;
      scanIntervalMinutes?: number;
      inactivityMinutes?: number;
      cooldownHours?: number;
      batchSize?: number;
      maxBatchesPerScan?: number;
      maxAttempts?: number;
    }>('bob.abandonedCart');
    return {
      enabled: cfg?.enabled ?? true,
      scanIntervalMs: (cfg?.scanIntervalMinutes ?? 30) * 60_000,
      inactivityMs: (cfg?.inactivityMinutes ?? 30) * 60_000,
      cooldownMs: (cfg?.cooldownHours ?? 24) * 60 * 60_000,
      batchSize: cfg?.batchSize ?? 50,
      maxBatchesPerScan: cfg?.maxBatchesPerScan ?? 40,
      maxAttempts: cfg?.maxAttempts ?? 3,
    };
  }

  async scanAndEnqueue(): Promise<AbandonedCartScanSummary> {
    const summary: AbandonedCartScanSummary = {
      scanned: 0,
      eligible: 0,
      queued: 0,
      skipped: 0,
      skippedReasons: {},
    };

    if (!this.settings().enabled) {
      this.bumpSkip(summary, 'disabled');
      this.logger.log(summary, '[BOB abandoned-cart] scan skipped — BOB_ABANDONED_CART_ENABLED=false');
      return summary;
    }
    if (!this.isNotifyConfigured()) {
      this.bumpSkip(summary, 'missing_bob_config');
      this.logger.warn(
        summary,
        '[BOB abandoned-cart] scan skipped — set BOB_NOTIFY_URL and BOB_GUEST_ID',
      );
      return summary;
    }

    const locked = await this.withScanLock(async () => this.runScan(summary));
    if (!locked) {
      this.bumpSkip(summary, 'scan_lock_held');
      this.logger.log(summary, '[BOB abandoned-cart] scan skipped — another instance holds the lock');
      return summary;
    }
    return locked;
  }

  async processSend(data: BobAbandonedCartSendJobData): Promise<AbandonedCartSendResult> {
    const outbox = await this.outboxRepository.findById(data.outboxId);
    if (!outbox) {
      return { status: 'skipped', reason: 'outbox_missing' };
    }
    if (outbox.status === 'accepted' || outbox.status === 'ambiguous' || outbox.status === 'skipped') {
      return { status: 'skipped', reason: `already_${outbox.status}` };
    }

    const claimToken = createHash('sha256')
      .update(`${randomUUID()}:${outbox.id}`)
      .digest('hex')
      .slice(0, 32);
    const claimed = await this.outboxRepository.claimForSend(
      outbox.id,
      claimToken,
      new Date(Date.now() - BOB_ABANDONED_CART_CLAIM_LEASE_MS),
    );
    if (!claimed) {
      const current = await this.outboxRepository.findById(outbox.id);
      return { status: 'skipped', reason: `claim_failed_${current?.status ?? 'missing'}` };
    }

    const recheck = await this.recheckEligibility(claimed);
    if (!recheck.ok) {
      await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
        status: 'skipped',
        lastError: recheck.reason,
        acceptedAt: null,
      });
      this.logger.log(
        {
          outboxId: claimed.id,
          cartRefId: claimed.cartRefId,
          reason: recheck.reason,
        },
        '[BOB abandoned-cart] send skipped after recheck',
      );
      return { status: 'skipped', reason: recheck.reason };
    }

    const payload = recheck.payload;
    const idempotencyKey = claimed.idempotencyKey;
    const result = await this.bobNotifyService.post(BOB_ABANDONED_CART_PATH, payload, {
      idempotencyKey,
    });
    const attempts = (claimed.attempts ?? 0) + 1;
    const snapshot = {
      checkoutId: payload.checkout_id,
      lineItemCount: payload.line_items.length,
      totalPrice: payload.order_details.total_price,
      phoneMasked: maskPhoneForLog(payload.phone),
    };

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
          outboxId: claimed.id,
          cartRefId: claimed.cartRefId,
          httpStatus: result.httpStatus,
          phoneMasked: snapshot.phoneMasked,
        },
        '[BOB abandoned-cart] BOB accepted /abancart (WhatsApp delivery is BOB-side)',
      );
      return { status: 'accepted' };
    }

    if (result.httpStatus == null) {
      await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
        status: 'ambiguous',
        attempts,
        lastHttpStatus: null,
        lastError: sanitizeAbandonedCartError(result.error ?? 'transport_timeout_or_unknown'),
        acceptedAt: new Date(),
      });
      this.logger.warn(
        { outboxId: claimed.id, cartRefId: claimed.cartRefId },
        '[BOB abandoned-cart] uncertain outcome — suppressing repeats for 24h',
      );
      return { status: 'ambiguous', reason: result.error };
    }

    const permanent = BOB_ABANDONED_CART_PERMANENT_HTTP.has(result.httpStatus);
    const retryable = !permanent && isRetryableBobHttpStatus(result.httpStatus);
    const maxAttempts = this.settings().maxAttempts;
    await this.outboxRepository.updateStatusForClaim(claimed.id, claimToken, {
      status: 'failed',
      attempts: permanent ? maxAttempts : attempts,
      lastHttpStatus: result.httpStatus,
      lastError: sanitizeAbandonedCartError(result.error ?? `http_${result.httpStatus}`),
      acceptedAt: null,
    });

    if (retryable && attempts < maxAttempts) {
      return { status: 'retry', reason: result.error };
    }

    this.logger.warn(
      {
        outboxId: claimed.id,
        cartRefId: claimed.cartRefId,
        httpStatus: result.httpStatus,
        permanent,
      },
      '[BOB abandoned-cart] /abancart rejected',
    );
    return { status: 'failed', reason: result.error };
  }

  private async runScan(summary: AbandonedCartScanSummary): Promise<AbandonedCartScanSummary> {
    const { inactivityMs, batchSize, maxBatchesPerScan } = this.settings();
    const inactiveBefore = new Date(Date.now() - inactivityMs);
    let afterActivityAt: Date | null = null;
    let afterCartId: string | null = null;

    for (let batch = 0; batch < maxBatchesPerScan; batch++) {
      const candidates = await this.cartsRepository.findAbandonedCartNotifyCandidates({
        inactiveBefore,
        afterActivityAt,
        afterCartId,
        limit: batchSize,
      });
      if (!candidates.length) break;

      summary.scanned += candidates.length;
      const last = candidates[candidates.length - 1]!;
      afterActivityAt = last.lastActivityAt;
      afterCartId = last.cartId;

      await this.enqueueEligibleBatch(candidates, summary);
    }

    this.logger.log(summary, '[BOB abandoned-cart] scan complete');
    return summary;
  }

  private async enqueueEligibleBatch(
    candidates: AbandonedCartNotifyCandidate[],
    summary: AbandonedCartScanSummary,
  ): Promise<void> {
    const { cooldownMs, inactivityMs, maxAttempts } = this.settings();
    const now = new Date();
    const since = new Date(now.getTime() - cooldownMs);

    const userIds = candidates.map((row) => row.userId);
    const phones = candidates
      .map((row) => canonicalizeIndianMobileNumber(row.mobileNumber ?? '') ?? '')
      .filter(Boolean);
    const [byUser, byPhone] = await Promise.all([
      this.outboxRepository.findBlockingByUserIds(userIds),
      this.outboxRepository.findBlockingByPhones(phones),
    ]);
    const outboxById = new Map<string, BobAbandonedCartOutboxEntity>();
    for (const row of [...byUser, ...byPhone]) {
      outboxById.set(row.id, row);
    }
    const rows = [...outboxById.values()];

    for (const candidate of candidates) {
      const phone = canonicalizeIndianMobileNumber(candidate.mobileNumber ?? '');
      const related = rows.filter(
        (row) =>
          row.userId === candidate.userId ||
          (phone != null && row.destinationPhoneNormalized === phone),
      );
      const inFlight = related.find((row) => row.status === 'pending' || row.status === 'sending');
      const cooldownRow = related
        .filter((row) => row.status === 'accepted' || row.status === 'ambiguous')
        .filter((row) => {
          const at = row.acceptedAt ?? row.createdAt;
          return at.getTime() >= since.getTime();
        })
        .sort((a, b) => (b.acceptedAt ?? b.createdAt).getTime() - (a.acceptedAt ?? a.createdAt).getTime())[0];
      const failedRow = related
        .filter((row) => row.status === 'failed' && row.userId === candidate.userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      const decision = evaluateAbandonedCartEligibility({
        isGuest: false,
        isActiveCart: true,
        hasPositiveQuantityItem: candidate.itemCount > 0,
        hasValidPhone: Boolean(phone),
        lastActivityAt: candidate.lastActivityAt,
        now,
        inactivityMs,
        lastAcceptedOrUncertainAt: cooldownRow ? cooldownRow.acceptedAt ?? cooldownRow.createdAt : null,
        cooldownMs,
        hasInFlightReservation: Boolean(inFlight),
      });

      if (!decision.eligible) {
        this.bumpSkip(summary, decision.reason ?? 'skipped');
        continue;
      }

      if (failedRow && failedRow.attempts >= maxAttempts) {
        const failedAt = failedRow.updatedAt ?? failedRow.createdAt;
        if (now.getTime() - failedAt.getTime() < cooldownMs) {
          this.bumpSkip(summary, 'failed_cooldown');
          continue;
        }
      }

      if (failedRow && failedRow.attempts < maxAttempts) {
        const queued = await this.queueService.enqueueSend(
          {
            outboxId: failedRow.id,
            userId: candidate.userId,
            cartId: candidate.cartId,
            cartRefId: candidate.cartRefId,
          },
          { attempts: maxAttempts },
        );
        if (queued) {
          summary.eligible += 1;
          summary.queued += 1;
        } else {
          this.bumpSkip(summary, 'job_already_queued');
        }
        continue;
      }

      summary.eligible += 1;
      const reserved = await this.reserveAndEnqueue(candidate, phone!);
      if (reserved) {
        summary.queued += 1;
      } else {
        this.bumpSkip(summary, 'reserve_conflict');
      }
    }
  }

  private async reserveAndEnqueue(
    candidate: AbandonedCartNotifyCandidate,
    phoneNormalized: string,
  ): Promise<boolean> {
    const idempotencyKey = `${BOB_ABANDONED_CART_NOTIFY_KIND}:${candidate.userId}:${candidate.cartId}:${Date.now()}`;
    try {
      const refId = await generateUniqueRefId('bac', (value) =>
        this.outboxRepository.existsByRefId(value),
      );
      const outbox = await this.outboxRepository.create({
        refId,
        userId: candidate.userId,
        cartId: candidate.cartId,
        cartRefId: candidate.cartRefId,
        destinationPhoneNormalized: phoneNormalized,
        notificationKind: BOB_ABANDONED_CART_NOTIFY_KIND,
        idempotencyKey,
        jobId: `bob-abandoned-cart:send:${candidate.userId}`,
        status: 'pending',
        attempts: 0,
        payloadSnapshot: {
          cartRefId: candidate.cartRefId,
          phoneMasked: maskPhoneForLog(phoneNormalized),
        },
        createdBy: 'bob-abandoned-cart',
        updatedBy: 'bob-abandoned-cart',
      });
      const queued = await this.queueService.enqueueSend({
        outboxId: outbox.id,
        userId: candidate.userId,
        cartId: candidate.cartId,
        cartRefId: candidate.cartRefId,
      });
      if (!queued) {
        await this.outboxRepository.updateStatus(outbox.id, {
          status: 'skipped',
          lastError: 'job_already_queued',
        });
        return false;
      }
      return true;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  private async recheckEligibility(
    outbox: BobAbandonedCartOutboxEntity,
  ): Promise<
    | { ok: true; payload: ReturnType<typeof mapCurekaAbandonedCartToBob> }
    | { ok: false; reason: string }
  > {
    const { inactivityMs, cooldownMs } = this.settings();
    const now = new Date();
    const cart = await this.cartsRepository.findActiveById(outbox.cartId);
    const items = (cart?.items ?? []).filter((item) => item.quantity > 0);
    let isGuest = true;
    let mobileNumber: string | null = null;

    try {
      const user = await this.usersService.findById(outbox.userId);
      isGuest = Boolean(user.isGuest);
      mobileNumber = user.mobileNumber ?? null;
    } catch {
      return { ok: false, reason: 'user_missing' };
    }

    const phone = canonicalizeIndianMobileNumber(mobileNumber ?? '');
    const lastActivityAt = cart ? resolveCartCustomerActivityAt(cart) : now;
    const cooldown = await this.outboxRepository.findCooldownAnchor({
      userId: outbox.userId,
      phoneNormalized: phone ?? outbox.destinationPhoneNormalized,
      since: new Date(now.getTime() - cooldownMs),
    });
    const cooldownIsSelf = cooldown != null && cooldown.id === outbox.id;

    const decision = evaluateAbandonedCartEligibility({
      isGuest,
      isActiveCart: Boolean(cart?.isActive),
      hasPositiveQuantityItem: items.length > 0,
      hasValidPhone: Boolean(phone),
      lastActivityAt,
      now,
      inactivityMs,
      lastAcceptedOrUncertainAt:
        cooldown && !cooldownIsSelf ? cooldown.acceptedAt ?? cooldown.createdAt : null,
      cooldownMs,
      hasInFlightReservation: false,
    });

    if (!decision.eligible) {
      return { ok: false, reason: decision.reason ?? 'not_eligible' };
    }

    try {
      const detail = await this.abandonedCartsService.findOne(outbox.cartRefId);
      const storefront =
        this.configService.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ??
        'https://www.cureka.com';
      let payload = mapCurekaAbandonedCartToBob({
        detail,
        recoveryUrl: `${storefront}/cart`,
        storefrontUrl: storefront,
      });
      const e164 = toBobE164Phone(payload.phone || mobileNumber);
      payload = {
        ...payload,
        phone: e164,
        customer: { ...payload.customer, phone: e164 },
      };
      if (!payload.line_items.length) {
        return { ok: false, reason: 'purchased_or_emptied' };
      }
      return { ok: true, payload };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return { ok: false, reason: 'purchased_or_emptied' };
      }
      throw error;
    }
  }

  private bumpSkip(summary: AbandonedCartScanSummary, reason: string): void {
    summary.skipped += 1;
    summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driver = error.driverError as { code?: string } | undefined;
    return driver?.code === '23505';
  }

  private async withScanLock<T>(fn: () => Promise<T>): Promise<T | null> {
    const acquired = await this.acquireLock(SCAN_LOCK_KEY, SCAN_LOCK_TTL_MS);
    if (!acquired) return null;
    try {
      return await fn();
    } finally {
      await this.releaseLock(SCAN_LOCK_KEY);
    }
  }

  private async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const redisKey = `lock:${key}`;
    const client = await this.redis.getConnectedClient();
    if (client) {
      const result = await client.set(redisKey, '1', 'PX', ttlMs, 'NX');
      return result === 'OK';
    }
    if (this.localLocks.has(redisKey)) return false;
    this.localLocks.add(redisKey);
    setTimeout(() => this.localLocks.delete(redisKey), ttlMs).unref?.();
    return true;
  }

  private async releaseLock(key: string): Promise<void> {
    const redisKey = `lock:${key}`;
    const client = await this.redis.getConnectedClient();
    if (client) {
      await client.del(redisKey);
    }
    this.localLocks.delete(redisKey);
  }
}
