import { Injectable } from '@nestjs/common';
import {
  CacheInvalidationService,
  CacheKeys,
  CacheModuleName,
  CacheService,
  CacheTtlService,
} from '@packages/cache';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import { IUserSessionContext } from '../interfaces/session.interface';
import { reviveSessionContextFromCache } from '../mappers/session-context-cache.mapper';

@Injectable()
export class SessionCacheService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly cacheInvalidation: CacheInvalidationService,
    private readonly cacheTtl: CacheTtlService,
    private readonly userSessionsRepository: UserSessionsRepository,
  ) {}

  async getByTokenHash(tokenHash: string): Promise<IUserSessionContext | null> {
    const cached = await this.cacheService.get<IUserSessionContext>(
      CacheKeys.session.byToken(tokenHash),
    );

    if (!cached) {
      return null;
    }

    return reviveSessionContextFromCache(cached);
  }

  async setContext(
    tokenHash: string,
    sessionId: string,
    context: IUserSessionContext,
  ): Promise<void> {
    const ttlSeconds = this.cacheTtl.forModule(CacheModuleName.SESSION);

    await Promise.all([
      this.cacheService.set(CacheKeys.session.byToken(tokenHash), context, ttlSeconds),
      this.cacheService.set(CacheKeys.session.bySessionId(sessionId), context, ttlSeconds),
    ]);
  }

  async invalidateByTokenHash(tokenHash: string): Promise<void> {
    await this.cacheInvalidation.invalidateKeys([
      CacheKeys.session.byToken(tokenHash),
    ]);
  }

  async invalidateBySessionId(sessionId: string): Promise<void> {
    const session = await this.userSessionsRepository.findById(sessionId);

    await this.cacheInvalidation.invalidateKeys([
      CacheKeys.session.bySessionId(sessionId),
    ]);

    if (session?.refreshTokenHash) {
      await this.invalidateByTokenHash(session.refreshTokenHash);
    }
  }

  async invalidateAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const sessions = await this.userSessionsRepository.findActiveByUserId(userId);

    await Promise.all(
      sessions
        .filter((session) => session.id !== exceptSessionId)
        .map((session) =>
          this.cacheInvalidation.invalidateKeys([
            CacheKeys.session.bySessionId(session.id),
            CacheKeys.session.byToken(session.refreshTokenHash),
          ]),
        ),
    );
  }
}
