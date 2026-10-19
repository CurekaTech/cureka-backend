import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { VerifiedUserGuard } from '@modules/auth/guards/verified-user.guard';
import { RawResponse } from '@packages/common';
import { GokwikCartOwnerGuard } from '../guards/gokwik-cart-owner.guard';
import { GokwikCheckoutAuthGuard } from '../guards/gokwik-checkout-auth.guard';
import { GokwikWalletRedemptionService } from '../services/gokwik-wallet-redemption.service';

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
