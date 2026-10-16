import { registerAs } from '@nestjs/config';

const enabled = (name: string): boolean => process.env[name]?.trim().toLowerCase() === 'true';

/** Wallet features ship disabled; GoKwik stays separately gated pending contract verification. */
export const walletConfig = registerAs('wallet', () => ({
  checkoutEnabled: enabled('WALLET_CHECKOUT_ENABLED'),
  gokwikRedemptionEnabled: enabled('GOKWIK_WALLET_REDEMPTION_ENABLED'),
  reservationTtlMinutes: Number(process.env['WALLET_RESERVATION_TTL_MINUTES'] ?? 60),
}));
