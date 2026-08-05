/**
 * Static MSG91 integration settings (Cureka production values).
 * Only MSG91_ENABLED and MSG91_AUTH_KEY are read from environment — see msg91.config.ts.
 *
 * Flow / DLT mapping docs:
 * - https://msg91.com/help/map-approved-dlt-template-id-with-respective-flow-id-on-msg91-panel
 * - https://msg91.com/help/dlt-registration-in-india/error-description-sms-not-matched-with-dlt-template
 */
export const MSG91_STATIC = {
  /** MSG91 OTP template (not yet wired in Auth send path). */
  otpTemplateId: '66b9b241d6fc05710e7da242',

  /** MSG91 Flow / template ID for order thank-you SMS. */
  orderThankYouTemplateId: '66ab3a0ad6fc0541637a4a34',

  /** DLT content template ID mapped on the MSG91 Flow above. */
  dltTemplateId: '1207163584541815417',

  /** DLT Principal Entity ID — set when known; mapped on MSG91 panel. */
  peId: '',

  /** Registered 6-char sender ID (must match DLT header). */
  senderId: 'CUREKA',

  /**
   * Include `sender` in Flow API body only when the MSG91 Flow uses "From API".
   * false = use sender configured on the Flow in MSG91 panel (recommended for DLT).
   */
  passSenderInFlow: false,

  /**
   * Exact MSG91 Flow template text (##var## placeholders).
   * Used for rendered-SMS preview logs — must match MSG91 panel + DLT-approved content.
   */
  orderThankYouTemplateText:
    'Thank you for ordering on Cureka.com. Your Order ##var1## is under ##var2## and the shipment tracking id will be shared soon. Contact 9655928004 for any queries.',

  /** templateVar:orderField pairs (MSG91 vars are case-sensitive). */
  orderThankYouVars: ['var1:orderNumber', 'var2:orderStatus'] as const,

  shortUrl: '0' as const,
  baseUrl: 'https://control.msg91.com/api/v5',
  timeoutMs: 15_000,
} as const;
