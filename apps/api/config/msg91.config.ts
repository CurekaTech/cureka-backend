import { registerAs } from '@nestjs/config';
import { MSG91_STATIC } from './msg91.constants';

/**
 * MSG91 — SMS OTP + order transactional SMS (Flow API).
 * Env: MSG91_ENABLED, MSG91_AUTH_KEY only. All template/flow/DLT settings → msg91.constants.ts
 */
export const msg91Config = registerAs('msg91', () => ({
  enabled: (process.env['MSG91_ENABLED'] ?? 'false').toLowerCase() === 'true',
  authKey: process.env['MSG91_AUTH_KEY'] ?? '',

  otpTemplateId: MSG91_STATIC.otpTemplateId,
  orderThankYouTemplateId: MSG91_STATIC.orderThankYouTemplateId,
  orderCancelledTemplateId: MSG91_STATIC.orderCancelledTemplateId,
  dltTemplateId: MSG91_STATIC.dltTemplateId,
  orderCancelledDltTemplateId: MSG91_STATIC.orderCancelledDltTemplateId,
  peId: MSG91_STATIC.peId,
  senderId: MSG91_STATIC.senderId.trim().toUpperCase(),
  passSenderInFlow: MSG91_STATIC.passSenderInFlow,
  orderThankYouTemplateText: MSG91_STATIC.orderThankYouTemplateText,
  orderCancelledTemplateText: MSG91_STATIC.orderCancelledTemplateText,
  orderThankYouVars: [...MSG91_STATIC.orderThankYouVars],
  orderCancelledVars: [...MSG91_STATIC.orderCancelledVars],
  shortUrl: MSG91_STATIC.shortUrl,
  baseUrl: MSG91_STATIC.baseUrl,
  timeoutMs: MSG91_STATIC.timeoutMs,
}));
