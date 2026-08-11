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
    /**
     * Approved cancel template name — update when Meta/Bonb template is ready.
     * Leave empty string to skip WhatsApp cancel sends.
     */
    templateName: 'order_cancellation_v1',
    bodyVars: ['customerName', 'orderNumber', 'cancelReason'] as const,
  },
} as const;
