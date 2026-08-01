import { registerAs } from '@nestjs/config';

/**
 * MSG91 — used for SMS OTP (SendOTP), not order WhatsApp.
 * Docs: https://docs.msg91.com/otp/sendotp
 *
 * Order placement alerts use WhatsApp (bonb). Configure MSG91 when wiring auth OTP SMS.
 */
export const msg91Config = registerAs('msg91', () => ({
  enabled: (process.env['MSG91_ENABLED'] ?? 'false').toLowerCase() === 'true',
  authKey: process.env['MSG91_AUTH_KEY'] ?? '',
  /** OTP template id from MSG91 OTP section */
  otpTemplateId: process.env['MSG91_OTP_TEMPLATE_ID'] ?? '',
  baseUrl: process.env['MSG91_BASE_URL'] ?? 'https://control.msg91.com/api/v5',
  timeoutMs: parseInt(process.env['MSG91_TIMEOUT_MS'] ?? '15000', 10),
}));
