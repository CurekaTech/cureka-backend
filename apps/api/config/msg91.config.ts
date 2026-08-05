import { registerAs } from '@nestjs/config';

/**
 * MSG91 — SMS OTP + order thank-you SMS (Flow API).
 * Send SMS (Flow): https://docs.msg91.com/sms/send-sms
 * Legacy Flow sample: https://api.msg91.com/apidoc/textsms/send-sms-flow.php
 * OTP: https://docs.msg91.com/otp/sendotp
 *
 * NOTE: OTP SMS dispatch via MSG91 is configured (`MSG91_OTP_TEMPLATE_ID`) but
 * not wired in Auth/OtpService yet — OTP is generated and returned in non-prod only.
 */
export const msg91Config = registerAs('msg91', () => ({
  enabled: (process.env['MSG91_ENABLED'] ?? 'false').toLowerCase() === 'true',
  authKey: process.env['MSG91_AUTH_KEY'] ?? '',
  /** OTP template id from MSG91 OTP section (not yet used by Auth send path). */
  otpTemplateId: process.env['MSG91_OTP_TEMPLATE_ID'] ?? '',
  /**
   * Approved Flow SMS template id for order thank-you.
   * API: POST {baseUrl}/flow  (https://control.msg91.com/api/v5/flow)
   */
  orderThankYouTemplateId: process.env['MSG91_ORDER_THANKYOU_TEMPLATE_ID'] ?? '',
  /**
   * DLT Template ID mapped on the MSG91 Flow (India). Logged for diagnostics;
   * not sent in the Flow API body (portal mapping only).
   */
  dltTemplateId: process.env['MSG91_DLT_TEMPLATE_ID'] ?? '',
  /**
   * Sender ID registered in MSG91 / DLT (`MSG91_SENDER_ID`).
   * Normalized to uppercase at read time.
   */
  senderId: (process.env['MSG91_SENDER_ID'] ?? '').trim().toUpperCase(),
  /**
   * Comma-separated templateVar:orderField pairs (case-sensitive MSG91 vars).
   * Example template: "… Order ##var1## is under ##var2## …"
   * → var1:orderNumber,var2:orderStatus
   * Supported fields: customerName, orderNumber, grandTotal, paymentMethod, orderStatus
   */
  orderThankYouVars: (
    process.env['MSG91_ORDER_THANKYOU_VARS'] ??
    'var1:orderNumber,var2:orderStatus'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  /** Optional short URL flag for Flow API ("0" | "1"). */
  shortUrl: process.env['MSG91_SHORT_URL'] ?? '0',
  baseUrl: process.env['MSG91_BASE_URL'] ?? 'https://control.msg91.com/api/v5',
  timeoutMs: parseInt(process.env['MSG91_TIMEOUT_MS'] ?? '15000', 10),
}));
