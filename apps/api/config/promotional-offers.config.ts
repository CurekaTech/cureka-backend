import { registerAs } from '@nestjs/config';

/**
 * Native promotional offers stay off unless this is exactly true.
 * This is the only runtime switch. It is not an admin setting.
 */
export const promotionalOffersConfig = registerAs('promotionalOffers', () => ({
  enabled: process.env['PROMOTIONAL_OFFERS_ENABLED']?.trim().toLowerCase() === 'true',
}));
