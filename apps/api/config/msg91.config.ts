import { registerAs } from '@nestjs/config';
import { MSG91_STATIC } from './msg91.constants';

/**
 * MSG91 — SMS OTP + order thank-you SMS (Flow API).
 * Env: MSG91_ENABLED, MSG91_AUTH_KEY only. All template/flow/DLT settings → msg91.constants.ts
 */
export const msg91Config = registerAs('msg91', () => ({
  enabled: (process.env['MSG91_ENABLED'] ?? 'false').toLowerCase() === 'true',
  authKey: process.env['MSG91_AUTH_KEY'] ?? '',

  otpTemplateId: MSG91_STATIC.otpTemplateId,
  orderThankYouTemplateId: MSG91_STATIC.orderThankYouTemplateId,
  dltTemplateId: MSG91_STATIC.dltTemplateId,
  peId: MSG91_STATIC.peId,
  senderId: MSG91_STATIC.senderId.trim().toUpperCase(),
  passSenderInFlow: MSG91_STATIC.passSenderInFlow,
  orderThankYouTemplateText: MSG91_STATIC.orderThankYouTemplateText,
  orderThankYouVars: [...MSG91_STATIC.orderThankYouVars],
  shortUrl: MSG91_STATIC.shortUrl,
  baseUrl: MSG91_STATIC.baseUrl,
  timeoutMs: MSG91_STATIC.timeoutMs,
}));
