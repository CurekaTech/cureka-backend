import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikAuthedRequest, GokwikCheckoutAuthGuard } from '../guards/gokwik-checkout-auth.guard';
import { GokwikCartOwnerGuard } from '../guards/gokwik-cart-owner.guard';
import { GokwikWalletRedemptionService } from '../services/gokwik-wallet-redemption.service';

class GokwikGetUserDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  email?: string;
}

function lastTenDigits(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

class GokwikApplyWalletCreditDto {
  @IsString()
  @MinLength(1)
  cart_id!: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

class GokwikRemoveWalletCreditDto {
  @IsString()
  @MinLength(1)
  cart_id!: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}

/**
 * Merchant-hosted GoKwik Custom Wallet endpoints.
 * GoKwik calls these; Cureka must not invent outbound apply/remove calls.
 *
 * Auth follows the existing GoKwik cart callback pattern (checkout Bearer token
 * + cart ownership). Exact GoKwik `access_token` scheme for wallet-only calls
 * remains an open contract question.
 */
/**
 * GoKwik calls this during checkout to learn who the customer is and, when
 * enabled, their Cureka wallet balance. No cart id and no debit.
 */
@Controller('gokwik')
@UseGuards(GokwikCheckoutAuthGuard, VerifiedUserGuard)
export class GokwikGetUserController {
  constructor(private readonly walletRedemption: GokwikWalletRedemptionService) {}

  @Post('get-user')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  async getUser(@Req() request: GokwikAuthedRequest, @Body() dto: GokwikGetUserDto) {
    const profile = request.user.profile;
    const requestedPhone = dto.phone ?? dto.mobile ?? dto.phone_number;
    const requestedDigits = lastTenDigits(requestedPhone);
    const profileDigits = lastTenDigits(profile.mobileNumber);
    if (requestedDigits && profileDigits && requestedDigits !== profileDigits) {
      throw new BadRequestException('Phone does not match the checkout customer');
    }
    if (requestedDigits && !profileDigits) {
      throw new BadRequestException('Phone does not match the checkout customer');
    }

    const requestedEmail = dto.email?.trim().toLowerCase();
    const profileEmail = profile.email?.trim().toLowerCase();
    if (requestedEmail && profileEmail && requestedEmail !== profileEmail) {
      throw new BadRequestException('Email does not match the checkout customer');
    }

    const balances = await this.walletRedemption.readWalletBalancesForGetUser(request.user.sub);
    return {
      ...(profile.firstName ? { first_name: profile.firstName } : {}),
      ...(profile.lastName ? { last_name: profile.lastName } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.mobileNumber ? { phone: profile.mobileNumber } : {}),
      ...(balances ?? {}),
    };
  }
}

@Controller('gokwik')
@UseGuards(GokwikCheckoutAuthGuard, VerifiedUserGuard, GokwikCartOwnerGuard)
export class GokwikWalletController {
  constructor(private readonly walletRedemption: GokwikWalletRedemptionService) {}

  @Post('apply-wallet-credit')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  applyWalletCredit(@Body() dto: GokwikApplyWalletCreditDto) {
    return this.walletRedemption.applyWalletCredit(dto);
  }

  @Post('remove-wallet-credit')
  @HttpCode(HttpStatus.OK)
  @RawResponse()
  removeWalletCredit(@Body() dto: GokwikRemoveWalletCreditDto) {
    return this.walletRedemption.removeWalletCredit(dto);
  }
}
