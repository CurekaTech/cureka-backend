import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';
import { SessionCacheService } from './session-cache.service';
import { UsersService } from '@modules/users/services/users.service';
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
import { OtpRateLimitService } from './otp-rate-limit.service';

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
    this.logger.log(`OTP dispatched: ${normalized}`);
    return this.buildOtpSendResponse(plainOtp);
  }

  async verifyOtp(
    mobileNumber: string,
    otp: string,
    device: IDeviceContext,
  ): Promise<IUserAuthTokensResult> {
    const normalized = parseIndianMobileNumber(mobileNumber);
    await this.otpService.verifyOtp(normalized, otp, OtpPurpose.LOGIN);

    let user = await this.usersService.findByMobileNumber(normalized);

    if (!user) {
      user = await this.usersService.createFromMobileNumber(normalized);
      this.logger.log(`New user created via OTP: ${user.id}`);
    } else if (user.isGuest) {
      user = await this.usersService.convertGuestToUser(user.id, normalized);
      this.logger.log(`Guest converted to registered user: ${user.id}`);
    } else {
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

    await this.sessionService.logoutCurrentSession(sessionId);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionService.logoutCurrentSession(sessionId);
  }

  async logoutAllDevices(userId: string, currentSessionId?: string): Promise<void> {
    await this.sessionService.logoutAllSessions(userId, currentSessionId);
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
