import { ConfigService } from '@nestjs/config';

/** True only when PROMOTIONAL_OFFERS_ENABLED=true. Unset stays off. */
export function isPromotionalOffersEnabled(
  configService: Pick<ConfigService, 'get'>,
): boolean {
  return configService.get<boolean>('promotionalOffers.enabled') === true;
}
