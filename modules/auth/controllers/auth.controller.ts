import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service';
import {
  SendOtpDto,
  VerifyOtpDto,
  CompleteRegistrationDto,
} from '../dto/auth.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { IJwtPayload, IUserAuthResponse, IGuestAuthResponse } from '../interfaces/auth.interface';
import { IUser } from '@modules/users/interfaces/user.interface';
import { ResponseMessage } from '@common/decorators/response-message.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/send-otp
   * Initiates OTP-based login or registration for the given mobile number.
   */
  @ResponseMessage('OTP sent successfully')
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  sendOtp(@Body() dto: SendOtpDto): Promise<{ message: string }> {
    return this.authService.sendOtp(dto.mobileNumber);
  }

  /**
   * POST /api/v1/auth/verify-otp
   * Verifies the OTP and returns a JWT token.
   * - isRegistered: false → redirect frontend to complete-registration screen.
   * - isRegistered: true  → user is fully onboarded.
   */
  @ResponseMessage('OTP verified successfully')
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IUserAuthResponse> {
    const result = await this.authService.verifyOtp(dto.mobileNumber, dto.otp);
    reply.setCookie('user_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return result;
  }

  /**
   * POST /api/v1/auth/guest-login
   * Creates a guest session with a JWT token.
   * Guest users retain cart, wishlist, and session until OTP verification converts them.
   */
  @ResponseMessage('Guest session created')
  @Post('guest-login')
  @HttpCode(HttpStatus.CREATED)
  async guestLogin(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<IGuestAuthResponse> {
    const result = await this.authService.guestLogin();
    reply.setCookie('user_token', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    return result;
  }

  /**
   * POST /api/v1/auth/complete-registration
   * Completes user profile after OTP verification.
   * Requires a valid JWT (user must have been created via verify-otp).
   */
  @ResponseMessage('Registration completed successfully')
  @UseGuards(JwtAuthGuard)
  @Post('complete-registration')
  @HttpCode(HttpStatus.OK)
  completeRegistration(
    @CurrentUser() user: IJwtPayload,
    @Body() dto: CompleteRegistrationDto,
  ): Promise<IUser> {
    console.log("🚀 ~ AuthController ~ completeRegistration ~ user:", user)
    return this.authService.completeRegistration(user.sub, dto);
  }

  /**
   * GET /api/v1/auth/me
   * Returns the current authenticated user's profile.
   */
  @ResponseMessage('Profile retrieved successfully')
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: IJwtPayload): Promise<IUser> {
    return this.authService.getProfile(user.sub);
  }
}
