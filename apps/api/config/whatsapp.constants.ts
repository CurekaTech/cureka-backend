/**
 * Static WhatsApp (Bonb) template settings.
 * Only WHATSAPP_ENABLED / WHATSAPP_SEND_URL / WHATSAPP_API_KEY / WHATSAPP_TIMEOUT_MS
 * are read from environment — see whatsapp.config.ts.
 *
 * Add new message types here as we integrate more templates.
 * `bodyVars` must match the approved WhatsApp template placeholder order.
 */
export const WHATSAPP_STATIC = {
  /** Default language for all Cureka WhatsApp templates. */
  language: 'en_US',

  orderPlaced: {
    /** Approved template name (Bonb / Meta). */
    templateName: 'order_confirmation_v1',
    /** Body variable keys in template order. */
    bodyVars: ['customerName', 'orderNumber', 'grandTotal'] as const,
  },

  orderCancelled: {
    /** Approved Bonb/Meta template: Hi {{1}}, We have cancelled your order {{2}} as per your request... */
    templateName: 'cancel_v1',
    bodyVars: ['customerName', 'orderNumber'] as const,
  },
} as const;
