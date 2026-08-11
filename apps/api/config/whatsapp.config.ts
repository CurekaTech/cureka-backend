import { registerAs } from '@nestjs/config';
import { WHATSAPP_STATIC } from './whatsapp.constants';

/**
 * WhatsApp (Bonb) — connection from env; templates from whatsapp.constants.ts.
 */
export const whatsappConfig = registerAs('whatsapp', () => ({
  /** When false, all WhatsApp messages are skipped. */
  enabled: (process.env['WHATSAPP_ENABLED'] ?? 'false').toLowerCase() === 'true',

  /** Bonb / Cureka WhatsApp send endpoint, e.g. https://whatsapp.bonb.io/v1/send/curekanew */
  sendUrl: process.env['WHATSAPP_SEND_URL'] ?? '',

  /** x-api-key header value from Bonb. */
  apiKey: process.env['WHATSAPP_API_KEY'] ?? '',

  timeoutMs: parseInt(process.env['WHATSAPP_TIMEOUT_MS'] ?? '15000', 10),

  language: WHATSAPP_STATIC.language,

  orderPlacedTemplateName: WHATSAPP_STATIC.orderPlaced.templateName,
  orderPlacedBodyVars: [...WHATSAPP_STATIC.orderPlaced.bodyVars],

  orderCancelledTemplateName: WHATSAPP_STATIC.orderCancelled.templateName,
  orderCancelledBodyVars: [...WHATSAPP_STATIC.orderCancelled.bodyVars],
}));
