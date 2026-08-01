export type WhatsAppBodyVariable =
  | 'customerName'
  | 'orderNumber'
  | 'grandTotal'
  | 'paymentMethod'
  | 'orderStatus';

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

export interface IOrderPlacedNotifyInput {
  phoneNumber: string;
  customerName: string;
  orderNumber: string;
  grandTotal: string;
  paymentMethod: string;
  orderStatus: string;
  source: string;
}
