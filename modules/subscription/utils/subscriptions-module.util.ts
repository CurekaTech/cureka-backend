import { ConfigService } from '@nestjs/config';

/** True only when SUBSCRIPTIONS_MODULE_ENABLED=true. Unset stays off. */
export function isSubscriptionsModuleEnabled(
  configService: Pick<ConfigService, 'get'>,
): boolean {
  return configService.get<boolean>('subscriptions.moduleEnabled') === true;
}

/** Default on. Set SUBSCRIPTION_CASHFREE_ADVANCE_CHARGE=false to roll back. */
export function isCashfreeAdvanceChargeEnabled(
  configService: Pick<ConfigService, 'get'>,
): boolean {
  return configService.get<boolean>('subscriptions.cashfreeAdvanceCharge') !== false;
}
