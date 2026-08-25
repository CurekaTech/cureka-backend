import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService, RedisConnectionService } from '@packages/cache';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Minimal idempotency for storefront checkout / verify retries.
 *
 * Cache key: `idempotency:checkout:{operation}:{userId}:{keyFingerprint}`
 * so the same Idempotency-Key cannot collide across checkout / modal / verify.
 *
 * Requires shared Redis in production (PM2 cluster). When an Idempotency-Key is
 * present and Redis is unavailable, fails closed (503) to avoid silent duplicates.
 *
 * Execution order (critical for GoKwik token minting):
 * 1. LOOKUP cache by key
 * 2. If hit → return cached response (same customerToken)
 * 3. If miss → run handler (may mint token) → STORE response
 */
@Injectable()
export class CheckoutIdempotencyService {
  private readonly logger = new Logger(CheckoutIdempotencyService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly redisConnection: RedisConnectionService,
  ) {}

  async run<T>(
    userId: string,
    operation: string,
    idempotencyKey: string | undefined,
    handler: () => Promise<T>,
  ): Promise<T> {
    const key = idempotencyKey?.trim();
    if (!key) {
      return handler();
    }

    if (!this.redisConnection.isReachable()) {
      this.logger.error(
        {
          userId,
          operation,
          idempotencyKey: this.fingerprint(key),
        },
        '[CheckoutIdempotency] Redis unavailable — refusing to run with Idempotency-Key (would not be shared across PM2 workers)',
      );
      throw new ServiceUnavailableException(
        'Checkout idempotency storage unavailable. Retry when Redis is healthy, or omit Idempotency-Key.',
      );
    }

    const cacheKey = this.buildCacheKey(userId, operation, key);
    const cached = await this.cacheService.get<T>(cacheKey);
    if (cached !== undefined && cached !== null) {
      this.logger.log(
        { userId, operation, idempotencyKey: this.fingerprint(key) },
        '[CheckoutIdempotency] Returning cached response',
      );
      return cached;
    }

    const result = await handler();
    const stored = await this.cacheService.set(cacheKey, result, IDEMPOTENCY_TTL_SECONDS);
    if (!stored) {
      this.logger.warn(
        { userId, operation, idempotencyKey: this.fingerprint(key) },
        '[CheckoutIdempotency] Failed to persist response — retry may not be idempotent',
      );
    }
    return result;
  }

  private buildCacheKey(userId: string, operation: string, key: string): string {
    return `idempotency:checkout:${operation}:${userId}:${this.fingerprint(key)}`;
  }

  private fingerprint(key: string): string {
    return createHash('sha256').update(key).digest('hex').slice(0, 32);
  }
}
