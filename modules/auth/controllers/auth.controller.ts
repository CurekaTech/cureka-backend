import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from '../services/auth.service';
import {
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  CompleteRegistrationDto,
  RefreshSessionDto,
} from '../dto/auth.dto';
import { KwikpassExchangeDto } from '../dto/kwikpass.dto';
import {
  IUserAuthResponse,
  IGuestAuthResponse,
  IRefreshAuthResponse,
} from '../interfaces/auth.interface';
import { IKwikpassPublicConfig } from '../services/kwikpass.service';
import { IUser } from '@modules/users/interfaces/user.interface';
import { ResponseMessage } from '@packages/common';
import { SessionCookieGuard } from '../guards/session-cookie.guard';
import { CurrentSessionUser } from '../decorators/current-session-user.decorator';
import { IUserSessionContext } from '../interfaces/session.interface';
import {
  clearUserSessionCookie,
  getSessionTokenFromRequest,
  setUserSessionCookie,
} from '../utils/auth-cookie.util';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { KwikpassService } from '../services/kwikpass.service';

/**
 * Ecommerce user auth — opaque session token (not JWT).
 * Delivered as HttpOnly `user_session` cookie and as `token` in auth JSON responses.
 * Clients without cookies (e.g. GoKwik / mobile) send `Authorization: Bearer <token>`.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly kwikpassService: KwikpassService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  @ResponseMessage('OTP sent successfully')
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
  ): Promise<{ message: string; otp?: string }> {
    return this.authService.login(dto.identifier, req);
  }

  // ── KwikPass ──────────────────────────────────────────────────────────────

  @ResponseMessage('KwikPass configuration')
  @Get('kwikpass/config')
  getKwikpassConfig(): IKwikpassPublicConfig {
    const config = this.kwikpassService.getPublicConfig();
    this.logger.log(
      `[kwikpass/config] enabled=${config.enabled} mid="${config.merchantId}" env="${config.environment}" sdkUrl="${config.sdkUrl}"`,
    );
    return config;
  }

  @ResponseMessage('KwikPass session created')
  @Post('kwikpass/exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeKwikpass(
    @Body() dto: KwikpassExchangeDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IUserAuthResponse> {
    this.logger.log(
      `[kwikpass/exchange] REQUEST ip="${req.ip}" tokenLength=${dto.kpToken?.length ?? 0}`,
    );
    const sessionToken = getSessionTokenFromRequest(req);
    const guestUserId =
      await this.authService.resolveGuestUserIdFromSessionToken(sessionToken);
    const result = await this.kwikpassService.exchange(
      dto.kpToken,
      this.authService.resolveDeviceContext(req),
      guestUserId,
    );
    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
      req,
    );
    this.logger.log(
      `[kwikpass/exchange] SUCCESS sessionId=${result.sessionId} isRegistered=${result.isRegistered}`,
    );
    return {
      sessionId: result.sessionId,
      isRegistered: result.isRegistered,
      user: result.user,
      token: result.sessionToken,
    };
  }

  /**
   * Diagnostic endpoint — decrypts a kpToken and returns what's inside it.
   * Useful for debugging from Postman without going through the full login flow.
   * Does NOT create a session.
   */
  @ResponseMessage('KwikPass token probe result')
  @Post('kwikpass/probe')
  @HttpCode(HttpStatus.OK)
  probeKwikpassToken(@Body() dto: KwikpassExchangeDto): Promise<Record<string, unknown>> {
    this.logger.log(`[kwikpass/probe] Probing token (length=${dto.kpToken?.length ?? 0})`);
    return this.kwikpassService.probe(dto.kpToken);
  }

  @ResponseMessage('OTP sent successfully')
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(
    @Body() dto: SendOtpDto,
    @Req() req: FastifyRequest,
  ): Promise<{ message: string; otp?: string }> {
    return this.authService.sendOtp(dto.mobileNumber, req);
  }

  @ResponseMessage('OTP verified successfully')
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IUserAuthResponse> {
    const device = this.authService.resolveDeviceContext(req);
    const sessionToken = getSessionTokenFromRequest(req);
    const guestUserId =
      await this.authService.resolveGuestUserIdFromSessionToken(sessionToken);
    const result = await this.authService.verifyOtp(
      dto.mobileNumber,
      dto.otp,
      device,
      guestUserId,
    );

    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
      req,
    );

    return {
      sessionId: result.sessionId,
      isRegistered: result.isRegistered,
      user: result.user,
      // Token only for registered users; unregistered clients complete registration first.
      token: result.isRegistered ? result.sessionToken : null,
    };
  }

  @ResponseMessage('Guest session created')
  @Post('guest-login')
  @HttpCode(HttpStatus.CREATED)
  async guestLogin(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IGuestAuthResponse> {
    const device = this.authService.resolveDeviceContext(req);
    const result = await this.authService.guestLogin(device);

    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
      req,
    );

    return {
      sessionId: result.sessionId,
      user: result.user,
      token: result.sessionToken,
    };
  }

  @ResponseMessage('Registration completed successfully')
  @UseGuards(SessionCookieGuard)
  @Post('complete-registration')
  @HttpCode(HttpStatus.OK)
  async completeRegistration(
    @CurrentSessionUser() user: IUserSessionContext,
    @Req() req: FastifyRequest,
    @Body() dto: CompleteRegistrationDto,
  ): Promise<IUserAuthResponse> {
    const updatedUser = await this.authService.completeRegistration(user.sub, dto);
    const sessionToken = getSessionTokenFromRequest(req);
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Session missing — provide user_session cookie or Authorization: Bearer <token>',
      );
    }

    return {
      sessionId: user.sessionId,
      isRegistered: updatedUser.isRegistered,
      user: updatedUser,
      token: sessionToken,
    };
  }

  @ResponseMessage('Profile retrieved successfullyyyyy')
  @UseGuards(SessionCookieGuard)
  @Get('me')
  getProfile(@CurrentSessionUser() user: IUserSessionContext): Promise<IUser> {
    return this.storageUrlEnricher.enrichFields(user.profile, ['profileImageUrl']);
  }

  @ResponseMessage('Session refreshed successfully')
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: FastifyRequest,
    @Body() dto: RefreshSessionDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IRefreshAuthResponse> {
    const sessionToken = getSessionTokenFromRequest(req) ?? dto.refreshToken;
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Session missing — provide user_session cookie, Authorization: Bearer <token>, or refreshToken body',
      );
    }

    const result = await this.authService.refreshSession(sessionToken);

    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
      req,
    );

    return { sessionId: result.sessionId, token: result.sessionToken };
  }

  @ResponseMessage('Logged out successfully')
  @UseGuards(SessionCookieGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentSessionUser() user: IUserSessionContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<null> {
    await this.authService.logout(user.sessionId);
    clearUserSessionCookie(reply);
    return null;
  }

  @ResponseMessage('Logged out from all devices successfully')
  @UseGuards(SessionCookieGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentSessionUser() user: IUserSessionContext,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<null> {
    await this.authService.logoutAllDevices(user.sub);
    clearUserSessionCookie(reply);
    return null;
  }

  @ResponseMessage('Active sessions retrieved successfully')
  @UseGuards(SessionCookieGuard)
  @Get('sessions')
  getSessions(@CurrentSessionUser() user: IUserSessionContext) {
    return this.authService.getActiveSessions(user.sub, user.sessionId);
  }

  @ResponseMessage('Session revoked successfully')
  @UseGuards(SessionCookieGuard)
  @Post('sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentSessionUser() user: IUserSessionContext,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<null> {
    await this.authService.revokeSessionById(user.sub, sessionId);
    return null;
  }
}
