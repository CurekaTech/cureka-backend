import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  IUserAuthResponse,
  IGuestAuthResponse,
  IRefreshAuthResponse,
} from '../interfaces/auth.interface';
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

/**
 * Ecommerce user auth — pure cookie session (no JWT).
 * Cookie: user_session (opaque token) → validated against user_sessions table.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
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
    );

    return {
      sessionId: result.sessionId,
      isRegistered: result.isRegistered,
      user: result.user,
      token: result.isRegistered ? result.sessionToken : null
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
    console.log("🚀 ~ AuthController ~ guestLogin ~ device:", device)
    const result = await this.authService.guestLogin(device);
    console.log("🚀 ~ AuthController ~ guestLogin ~ result:", result)

    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
    );

    return {
      sessionId: result.sessionId,
      user: result.user,
    };
  }

  @ResponseMessage('Registration completed successfully')
  @UseGuards(SessionCookieGuard)
  @Post('complete-registration')
  @HttpCode(HttpStatus.OK)
  completeRegistration(
    @CurrentSessionUser() user: IUserSessionContext,
    @Body() dto: CompleteRegistrationDto,
  ): Promise<IUser> {
    return this.authService.completeRegistration(user.sub, dto);
  }

  @ResponseMessage('Profile retrieved successfully')
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
      throw new UnauthorizedException('Session cookie missing');
    }

    const result = await this.authService.refreshSession(sessionToken);

    setUserSessionCookie(
      reply,
      result.sessionToken,
      this.authService.getRefreshExpiresInDays(),
    );

    return { sessionId: result.sessionId };
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
