import { registerAs } from '@nestjs/config';

/**
 * MSG91 — SMS OTP + order thank-you SMS (Flow API).
 * Send SMS (Flow): https://docs.msg91.com/sms/send-sms
 * OTP: https://docs.msg91.com/otp/sendotp
 */
export const msg91Config = registerAs('msg91', () => ({
  enabled: (process.env['MSG91_ENABLED'] ?? 'false').toLowerCase() === 'true',
  authKey: process.env['MSG91_AUTH_KEY'] ?? '',
  /** OTP template id from MSG91 OTP section */
  otpTemplateId: process.env['MSG91_OTP_TEMPLATE_ID'] ?? '',
  /**
   * Approved Flow SMS template id for order thank-you.
   * API: POST {baseUrl}/flow  (https://control.msg91.com/api/v5/flow)
   */
  orderThankYouTemplateId: process.env['MSG91_ORDER_THANKYOU_TEMPLATE_ID'] ?? '',
  /**
   * Comma-separated templateVar:orderField pairs (case-sensitive MSG91 vars).
   * Example template: "Thank you ##var## … order ##var1## … Rs ##var2##"
   * → var:customerName,var1:orderNumber,var2:grandTotal
   * Supported fields: customerName, orderNumber, grandTotal, paymentMethod, orderStatus
   */
  orderThankYouVars: (
    process.env['MSG91_ORDER_THANKYOU_VARS'] ??
    'var:customerName,var1:orderNumber,var2:grandTotal'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  /** Optional short URL flag for Flow API ("0" | "1"). */
  shortUrl: process.env['MSG91_SHORT_URL'] ?? '0',
  baseUrl: process.env['MSG91_BASE_URL'] ?? 'https://control.msg91.com/api/v5',
  timeoutMs: parseInt(process.env['MSG91_TIMEOUT_MS'] ?? '15000', 10),
}));
