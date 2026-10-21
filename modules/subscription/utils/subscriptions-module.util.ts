import { ConfigService } from '@nestjs/config';

/** True only when SUBSCRIPTIONS_MODULE_ENABLED=true. Unset stays off. */
export function isSubscriptionsModuleEnabled(
  configService: Pick<ConfigService, 'get'>,
): boolean {
  return configService.get<boolean>('subscriptions.moduleEnabled') === true;
}
