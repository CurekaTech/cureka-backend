import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { FastifyRequest } from 'fastify';
import { AuditService } from '@modules/master/services/audit.service';
import { getAuditActor } from '@modules/master/utils/audit-actor.context';
import { auditIdempotency } from '@modules/master/utils/audit-idempotency.util';
import { maskAuditMobile } from '@modules/master/utils/audit-redact.util';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { SessionCacheService } from './session-cache.service';
import { UsersService } from '@modules/users/services/users.service';
import { CartService } from '@modules/orders/services/cart.service';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { OtpPurpose } from '../enums/otp-purpose.enum';
import {
  IGuestAuthTokensResult,
  IRefreshTokensResult,
  IUserAuthTokensResult,
} from '../interfaces/auth.interface';
import { ConfigService } from '@nestjs/config';
import { CompleteRegistrationDto } from '../dto/auth.dto';
import { IUser } from '@modules/users/interfaces/user.interface';
import { IDeviceContext } from '../interfaces/session.interface';
import { extractDeviceContext } from '../utils/device-context.util';
import { parseIndianMobileNumber } from '../utils/mobile-number.util';
import { hashRefreshToken } from '../utils/refresh-token.util';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import { OtpRateLimitService } from './otp-rate-limit.service';
import { maskMobile } from '@packages/logger';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly sessionService: SessionService,
    private readonly sessionCacheService: SessionCacheService,
    private readonly configService: ConfigService,
    private readonly otpRateLimitService: OtpRateLimitService,
    @Inject(forwardRef(() => CartService))
    private readonly cartService: CartService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly userSessionsRepository: UserSessionsRepository,
  ) {}

  // ── Unified login (UI: email or mobile) ─────────────────────────────────────

  async login(
    identifier: string,
    req?: FastifyRequest,
  ): Promise<{ message: string; otp?: string }> {
    const mobileNumber = parseIndianMobileNumber(identifier);
    return this.sendOtp(mobileNumber, req);
  }

  // ── OTP flow ─────────────────────────────────────────────────────────────────

  async sendOtp(
    mobileNumber: string,
    req?: FastifyRequest,
  ): Promise<{ message: string; otp?: string }> {
    const normalized = parseIndianMobileNumber(mobileNumber);
    await this.otpRateLimitService.assertCanSendOtp(
      normalized,
      req ? extractDeviceContext(req).ipAddress : undefined,
    );

    const plainOtp = await this.otpService.sendOtp(normalized, OtpPurpose.LOGIN);
    this.logger.log(`OTP dispatched: ${maskMobile(normalized)}`);
    return this.buildOtpSendResponse(plainOtp);
  }

  async verifyOtp(
    mobileNumber: string,
    otp: string,
    device: IDeviceContext,
    guestUserId?: string | null,
  ): Promise<IUserAuthTokensResult> {
    const normalized = parseIndianMobileNumber(mobileNumber);
    try {
      await this.otpService.verifyOtp(normalized, otp, OtpPurpose.LOGIN);
    } catch (error) {
      await this.persistAuthFailure('otp', maskAuditMobile(normalized));
      throw error;
    }

    const guestSessionUserId = await this.resolveGuestUserId(guestUserId);
    const result = await this.loginWithVerifiedMobile(normalized, device, guestSessionUserId);
    await this.auditService.persistCritical({
      entityType: 'user_auth',
      entityId: result.user.id,
      entityRefId: result.sessionId,
      action: 'otp_verified',
      performedBy: result.user.id,
      actorType: 'USER',
      actorId: result.user.id,
      idempotencyKey: auditIdempotency.authSuccess(
        'otp_verified',
        result.sessionId,
        this.requestId(),
      ),
      details: { outcome: 'success', mobile: maskAuditMobile(normalized) },
    });
    return result;
  }

  async loginWithVerifiedMobile(
    mobileNumber: string,
    device: IDeviceContext,
    guestUserId?: string | null,
  ): Promise<IUserAuthTokensResult> {
    const normalized = parseIndianMobileNumber(mobileNumber);
    const guestSessionUserId = await this.resolveGuestUserId(guestUserId);
    let user = await this.usersService.findByMobileNumber(normalized);

    if (!user) {
      if (guestSessionUserId) {
        user = await this.usersService.convertGuestToUser(guestSessionUserId, normalized);
        this.logger.log(`Guest converted to registered user: ${user.id}`);
      } else {
        user = await this.usersService.createFromMobileNumber(normalized);
        this.logger.log(`New user created via OTP: ${user.id}`);
      }
    } else if (user.isGuest) {
      user = await this.usersService.convertGuestToUser(user.id, normalized);
      this.logger.log(`Guest converted to registered user: ${user.id}`);
    } else {
      if (guestSessionUserId && guestSessionUserId !== user.id) {
        await this.cartService.mergeGuestCartIntoUser(guestSessionUserId, user.id);
        this.logger.log(`Merged guest cart into user ${user.id}`);
      }
      await this.usersService.updateLastLoginAt(user.id);
    }

    const tokens = await this.sessionService.createSession(
      user.id,
      user.role ?? UserRole.CUSTOMER,
      device,
      false,
    );

    return {
      sessionToken: tokens.sessionToken,
      sessionId: tokens.sessionId,
      isRegistered: user.isRegistered,
      user,
    };
  }

  // ── Guest login ───────────────────────────────────────────────────────────────

  async guestLogin(device: IDeviceContext): Promise<IGuestAuthTokensResult> {
    const user = await this.usersService.createGuestUser();

    const tokens = await this.sessionService.createSession(
      user.id,
      UserRole.CUSTOMER,
      device,
      true,
    );

    this.logger.log(`Guest session created: ${user.id}`);

    return {
      sessionToken: tokens.sessionToken,
      sessionId: tokens.sessionId,
      user,
    };
  }

  // ── Refresh + session management ──────────────────────────────────────────────

  async refreshSession(sessionToken: string): Promise<IRefreshTokensResult> {
    const rotated = await this.sessionService.rotateSessionToken(sessionToken);

    return {
      sessionToken: rotated.sessionToken,
      sessionId: rotated.sessionId,
    };
  }

  async revokeSessionById(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionService.findSessionById(sessionId);

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You can only revoke your own sessions');
    }

    const revoked = await this.dataSource.transaction(async (manager) => {
      const didRevoke = await this.sessionService.logoutCurrentSession(sessionId, manager);
      if (!didRevoke) return false;
      await this.auditService.enqueueCritical(manager, {
        entityType: 'user_auth',
        entityId: userId,
        entityRefId: sessionId,
        action: 'session_revoke',
        performedBy: userId,
        actorType: 'USER',
        actorId: userId,
        idempotencyKey: auditIdempotency.authSuccess('session_revoke', sessionId, this.requestId()),
        details: { sessionId },
      });
      return true;
    });
    if (revoked) await this.sessionCacheService.invalidateBySessionId(sessionId);
  }

  async logout(sessionId: string): Promise<void> {
    const session = await this.sessionService.findSessionById(sessionId);
    if (!session) return;
    await this.revokeSessionById(session.userId, sessionId);
  }

  /** Idempotent logout using the opaque session token (cookie or Bearer). */
  async logoutByToken(sessionToken?: string): Promise<boolean> {
    if (!sessionToken) return false;
    const existing = await this.userSessionsRepository.findByRefreshTokenHash(
      hashRefreshToken(sessionToken),
    );
    if (!existing || existing.isRevoked) return false;

    const revoked = await this.dataSource.transaction(async (manager) => {
      const didRevoke = await this.sessionService.revokeSessionByToken(sessionToken, manager);
      if (!didRevoke) return false;
      await this.auditService.enqueueCritical(manager, {
        entityType: 'user_auth',
        entityId: existing.userId,
        entityRefId: existing.id,
        action: 'logout',
        performedBy: existing.userId,
        actorType: 'USER',
        actorId: existing.userId,
        idempotencyKey: auditIdempotency.authSuccess('logout', existing.id, this.requestId()),
        details: { sessionId: existing.id },
      });
      return true;
    });
    if (revoked) await this.sessionCacheService.invalidateBySessionId(existing.id);
    return revoked;
  }

  async logoutAllDevices(userId: string, currentSessionId?: string): Promise<number> {
    const revoked = await this.dataSource.transaction(async (manager) => {
      const count = await this.sessionService.logoutAllSessions(userId, currentSessionId, manager);
      if (count === 0) return 0;
      await this.auditService.enqueueCritical(manager, {
        entityType: 'user_auth',
        entityId: userId,
        action: 'logout_all',
        performedBy: userId,
        actorType: 'USER',
        actorId: userId,
        idempotencyKey: auditIdempotency.authSuccess('logout_all', userId, this.requestId()),
        details: { revokedSessions: count },
      });
      return count;
    });
    if (revoked > 0) {
      await this.sessionCacheService.invalidateAllForUser(userId, currentSessionId);
    }
    return revoked;
  }

  private requestId(): string {
    return getAuditActor()?.requestId ?? randomUUID();
  }

  private async persistAuthFailure(channel: string, maskedSubject: string): Promise<void> {
    const requestId = this.requestId();
    await this.auditService.persistCritical({
      entityType: 'user_auth',
      entityId: null,
      entityRefId: requestId,
      action: 'otp_failed',
      performedBy: 'anonymous',
      actorType: 'ANONYMOUS',
      actorId: null,
      idempotencyKey: auditIdempotency.authFailure(channel, maskedSubject, requestId),
      details: { outcome: 'failure', mobile: maskedSubject },
    });
  }

  async getActiveSessions(userId: string, currentSessionId?: string) {
    return this.sessionService.listActiveSessions(userId, currentSessionId);
  }

  // ── Registration completion ────────────────────────────────────────────────────

  async completeRegistration(userId: string, dto: CompleteRegistrationDto): Promise<IUser> {
    const user = await this.usersService.completeRegistration(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      dateOfBirth: dto.dateOfBirth,
    });

    await this.sessionCacheService.invalidateAllForUser(userId);

    this.logger.log(`User registration completed: ${userId}`);
    return user;
  }

  async getProfile(userId: string): Promise<IUser> {
    return this.usersService.findById(userId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  resolveDeviceContext(req: FastifyRequest): IDeviceContext {
    return extractDeviceContext(req);
  }

  async resolveGuestUserIdFromSessionToken(
    sessionToken?: string,
  ): Promise<string | null> {
    if (!sessionToken) {
      return null;
    }

    try {
      const session = await this.sessionService.resolveSessionFromToken(sessionToken);
      return session.isGuest ? session.sub : null;
    } catch {
      return null;
    }
  }

  private async resolveGuestUserId(guestUserId?: string | null): Promise<string | null> {
    if (!guestUserId) {
      return null;
    }

    try {
      const user = await this.usersService.findById(guestUserId);
      return user.isGuest ? user.id : null;
    } catch {
      return null;
    }
  }

  getRefreshExpiresInDays(): number {
    return this.configService.get<number>('jwt.refreshExpiresInDays', 90);
  }

  /** Exposes OTP in non-production only — remove before go-live. */
  private buildOtpSendResponse(plainOtp: string): { message: string; otp?: string } {
    const response: { message: string; otp?: string } = {
      message: 'OTP sent successfully',
    };

    if (process.env['NODE_ENV'] !== 'production') {
      response.otp = plainOtp;
    }

    return response;
  }

}
