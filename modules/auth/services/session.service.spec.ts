import { SessionCacheService } from './session-cache.service';
import { SessionService } from './session.service';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import { ConfigService } from '@nestjs/config';
import { hashRefreshToken, generateRefreshToken } from '../utils/refresh-token.util';

describe('SessionService — logout', () => {
  const sessionId = 'session-123';
  let sessionService: SessionService;
  let userSessionsRepository: {
    findByRefreshTokenHash: jest.Mock;
    revokeById: jest.Mock;
  };
  let sessionCacheService: {
    invalidateBySessionId: jest.Mock;
  };

  beforeEach(() => {
    userSessionsRepository = {
      findByRefreshTokenHash: jest.fn(),
      revokeById: jest.fn(),
    };
    sessionCacheService = {
      invalidateBySessionId: jest.fn(),
    };

    sessionService = new SessionService(
      userSessionsRepository as unknown as UserSessionsRepository,
      { get: () => 90 } as unknown as ConfigService,
      sessionCacheService as unknown as SessionCacheService,
    );
  });

  it('revokes an active session by token', async () => {
    const token = generateRefreshToken();
    userSessionsRepository.findByRefreshTokenHash.mockResolvedValue({
      id: sessionId,
      isRevoked: false,
    });

    const revoked = await sessionService.revokeSessionByToken(token);

    expect(revoked).toBe(true);
    expect(userSessionsRepository.findByRefreshTokenHash).toHaveBeenCalledWith(
      hashRefreshToken(token),
    );
    expect(sessionCacheService.invalidateBySessionId).toHaveBeenCalledWith(sessionId);
    expect(userSessionsRepository.revokeById).toHaveBeenCalledWith(sessionId);
  });

  it('returns false when token is unknown or already revoked', async () => {
    userSessionsRepository.findByRefreshTokenHash.mockResolvedValue(null);
    expect(await sessionService.revokeSessionByToken('missing-token')).toBe(false);

    userSessionsRepository.findByRefreshTokenHash.mockResolvedValue({
      id: sessionId,
      isRevoked: true,
    });
    expect(await sessionService.revokeSessionByToken('revoked-token')).toBe(false);
    expect(userSessionsRepository.revokeById).not.toHaveBeenCalled();
  });
});
