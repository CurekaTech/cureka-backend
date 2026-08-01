import { registerAs } from '@nestjs/config';

export const whatsappConfig = registerAs('whatsapp', () => ({
  /** When false, order WhatsApp messages are skipped. */
  enabled: (process.env['WHATSAPP_ENABLED'] ?? 'false').toLowerCase() === 'true',

  /** Bonb / Cureka WhatsApp send endpoint, e.g. https://whatsapp.bonb.io/v1/send/curekanew */
  sendUrl: process.env['WHATSAPP_SEND_URL'] ?? '',

  /** x-api-key header value from Bonb. */
  apiKey: process.env['WHATSAPP_API_KEY'] ?? '',

  /** Approved WhatsApp template name for order placed. */
  orderPlacedTemplateName: process.env['WHATSAPP_ORDER_PLACED_TEMPLATE'] ?? '',

  /** Template language code (WhatsApp), e.g. en_US or en. */
  orderPlacedLanguage: process.env['WHATSAPP_ORDER_PLACED_LANGUAGE'] ?? 'en_US',

  /**
   * Comma-separated body variable keys, in template order.
   * Supported: customerName, orderNumber, grandTotal, paymentMethod, orderStatus
   * Example: customerName,orderNumber,grandTotal
   */
  orderPlacedBodyVars: (
    process.env['WHATSAPP_ORDER_PLACED_BODY_VARS'] ?? 'customerName,orderNumber,grandTotal'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),

  timeoutMs: parseInt(process.env['WHATSAPP_TIMEOUT_MS'] ?? '15000', 10),
}));
