import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpService } from './otp.service';
import { UsersService } from '@modules/users/services/users.service';
import { OtpPurpose } from '../enums/otp-purpose.enum';
import {
  IJwtPayload,
  IUserAuthResponse,
  IGuestAuthResponse,
} from '../interfaces/auth.interface';
import { CompleteRegistrationDto } from '../dto/auth.dto';
import { IUser } from '@modules/users/interfaces/user.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  // ── OTP flow ─────────────────────────────────────────────────────────────────

  /**
   * Sends an OTP to the provided mobile number.
   * In production, the plain OTP should be dispatched via an SMS provider.
   * Returns a generic success message — never expose the OTP in the API response.
   */
  async sendOtp(mobileNumber: string): Promise<{ message: string }> {
    // plainOtp is returned here for SMS dispatch (provider integration point)
    const _plainOtp = await this.otpService.sendOtp(mobileNumber, OtpPurpose.LOGIN);

    // TODO: integrate SMS provider (e.g. Twilio, MSG91) to send _plainOtp to mobileNumber

    this.logger.log(`OTP dispatched: ${mobileNumber}`);
    return { message: 'OTP sent successfully' };
  }

  /**
   * Verifies an OTP and returns a JWT token.
   *
   * - If user already exists → update last login and return token.
   * - If a guest user matches the mobile → convert to registered user.
   * - If no user exists → create a lightweight unregistered user record.
   */
  async verifyOtp(mobileNumber: string, otp: string): Promise<IUserAuthResponse> {
    await this.otpService.verifyOtp(mobileNumber, otp, OtpPurpose.LOGIN);

    let user = await this.usersService.findByMobileNumber(mobileNumber);

    if (!user) {
      user = await this.usersService.createFromMobileNumber(mobileNumber);
      this.logger.log(`New user created via OTP: ${user.id}`);
    } else if (user.isGuest) {
      user = await this.usersService.convertGuestToUser(user.id, mobileNumber);
      this.logger.log(`Guest converted to registered user: ${user.id}`);
    } else {
      await this.usersService.updateLastLoginAt(user.id);
    }

    const token = this.generateUserToken(user.id, false);

    return {
      token,
      isRegistered: user.isRegistered,
      user,
    };
  }

  // ── Guest login ───────────────────────────────────────────────────────────────

  /**
   * Creates a guest user record and returns a short-lived JWT.
   * Guest users can browse, use the cart, and complete OTP verification later
   * to convert their session to a full account (cart/wishlist/addresses preserved).
   */
  async guestLogin(): Promise<IGuestAuthResponse> {
    const user = await this.usersService.createGuestUser();
    const token = this.generateUserToken(user.id, true);

    this.logger.log(`Guest session created: ${user.id}`);

    return { token, user };
  }

  // ── Registration completion ────────────────────────────────────────────────────

  /**
   * Completes the user's registration after OTP verification.
   * Sets firstName, lastName, optional email and marks isRegistered = true.
   */
  async completeRegistration(
    userId: string,
    dto: CompleteRegistrationDto,
  ): Promise<IUser> {
    const user = await this.usersService.completeRegistration(userId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
    });

    this.logger.log(`User registration completed: ${userId}`);

    return user;
  }

  // ── Profile ───────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<IUser> {
    return this.usersService.findById(userId);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  private generateUserToken(userId: string, isGuest: boolean): string {
    const payload: IJwtPayload = { sub: userId, isGuest };
    return this.jwtService.sign(payload);
  }
}
