import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import {
  IDeviceContext,
  ISessionCookieResult,
  IUserSessionContext,
  IUserSessionInfo,
} from '../interfaces/session.interface';
import { mapUserEntityToResponse } from '@modules/users/mappers/user.mapper';
import { SESSION_ACTIVITY_TOUCH_INTERVAL_MS } from '../constants/session.constants';
import { generateRefreshToken, hashRefreshToken } from '../utils/refresh-token.util';

@Injectable()
export class SessionService {
  constructor(
    private readonly userSessionsRepository: UserSessionsRepository,
    private readonly configService: ConfigService,
  ) {}

  async createSession(
    userId: string,
    _role: UserRole,
    device: IDeviceContext,
    _isGuest = false,
  ): Promise<ISessionCookieResult> {
    const sessionToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(sessionToken);
    const now = new Date();
    const expiresAt = this.buildSessionExpiryDate();

    const session = await this.userSessionsRepository.create({
      userId,
      refreshTokenHash,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      browser: device.browser,
      os: device.os,
      ipAddress: device.ipAddress,
      lastActivity: now,
      expiresAt,
      isRevoked: false,
    });

    return { sessionToken, sessionId: session.id };
  }

  async resolveSessionFromToken(sessionToken: string): Promise<IUserSessionContext> {
    const refreshTokenHash = hashRefreshToken(sessionToken);
    const session =
      await this.userSessionsRepository.findActiveSessionWithUserByTokenHash(
        refreshTokenHash,
      );

    if (!session) {
      throw new UnauthorizedException('Invalid or revoked session');
    }

    if (session.expiresAt <= new Date()) {
      await this.userSessionsRepository.revokeById(session.id);
      throw new UnauthorizedException('Session expired');
    }

    if (this.shouldTouchSessionActivity(session.lastActivity)) {
      await this.userSessionsRepository.touchLastActivity(session.id);
    }

    if (!session.user) {
      throw new UnauthorizedException('User not found for session');
    }

    const profile = mapUserEntityToResponse(session.user);

    return {
      sub: profile.id,
      sessionId: session.id,
      role: profile.role,
      isGuest: profile.isGuest,
      isRegistered: profile.isRegistered,
      status: profile.status,
      profile,
    };
  }

  private shouldTouchSessionActivity(lastActivity: Date): boolean {
    return Date.now() - lastActivity.getTime() > SESSION_ACTIVITY_TOUCH_INTERVAL_MS;
  }

  async rotateSessionToken(
    sessionToken: string,
  ): Promise<ISessionCookieResult & { userId: string }> {
    const refreshTokenHash = hashRefreshToken(sessionToken);
    const session = await this.userSessionsRepository.findByRefreshTokenHash(refreshTokenHash);

    if (!session || session.isRevoked) {
      throw new UnauthorizedException('Invalid or revoked session');
    }

    if (session.expiresAt <= new Date()) {
      await this.userSessionsRepository.revokeById(session.id);
      throw new UnauthorizedException('Session expired');
    }

    const newSessionToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newSessionToken);
    const expiresAt = this.buildSessionExpiryDate();

    await this.userSessionsRepository.updateById(session.id, {
      refreshTokenHash: newTokenHash,
      lastActivity: new Date(),
      expiresAt,
    });

    return {
      sessionToken: newSessionToken,
      sessionId: session.id,
      userId: session.userId,
    };
  }

  async findSessionById(sessionId: string) {
    return this.userSessionsRepository.findById(sessionId);
  }

  async logoutCurrentSession(sessionId: string): Promise<void> {
    await this.userSessionsRepository.revokeById(sessionId);
  }

  async logoutAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await this.userSessionsRepository.revokeAllByUserId(userId, exceptSessionId);
  }

  async revokeAllSessionsForUser(userId: string): Promise<void> {
    await this.userSessionsRepository.revokeAllByUserId(userId);
  }

  async listActiveSessions(userId: string, currentSessionId?: string): Promise<IUserSessionInfo[]> {
    const sessions = await this.userSessionsRepository.findActiveByUserId(userId);

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      browser: session.browser,
      os: session.os,
      ipAddress: session.ipAddress,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
      isCurrent: session.id === currentSessionId,
    }));
  }

  private buildSessionExpiryDate(): Date {
    const days = this.configService.get<number>('jwt.refreshExpiresInDays', 90);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
  }
}
