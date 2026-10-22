import { registerAs } from '@nestjs/config';

const enabled = (name: string): boolean => process.env[name]?.trim().toLowerCase() === 'true';

/**
 * Wallet features ship disabled.
 * `gokwikRedemptionEnabled` only gates the isolated GoKwik merchant-hosted
 * apply/remove adapter. Live debit/settlement remains blocked until the
 * GoKwik settlement contract is verified — do not set this true in production.
 */
export const walletConfig = registerAs('wallet', () => ({
  checkoutEnabled: enabled('WALLET_CHECKOUT_ENABLED'),
  gokwikRedemptionEnabled: enabled('GOKWIK_WALLET_REDEMPTION_ENABLED'),
  reservationTtlMinutes: Number(process.env['WALLET_RESERVATION_TTL_MINUTES'] ?? 60),
}));
