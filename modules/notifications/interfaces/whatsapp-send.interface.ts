export type WhatsAppBodyVariable =
  | 'customerName'
  | 'orderNumber'
  | 'grandTotal'
  | 'paymentMethod'
  | 'orderStatus'
  | 'cancelReason';

export interface IWhatsAppTemplateBodyPart {
  type: 'text';
  text: string;
}

export interface IWhatsAppTemplateSendPayload {
  phone: string;
  type: 'template';
  name: string;
  language: string;
  body: IWhatsAppTemplateBodyPart[];
}

/** Shared fields for order transactional notifications (placed / cancelled / …). */
export interface IOrderNotifyInput {
  phoneNumber: string;
  customerName: string;
  orderNumber: string;
  grandTotal: string;
  paymentMethod: string;
  orderStatus: string;
  source: string;
  cancelReason?: string;
}

/** @deprecated Prefer IOrderNotifyInput — alias kept for existing call sites. */
export type IOrderPlacedNotifyInput = IOrderNotifyInput;
