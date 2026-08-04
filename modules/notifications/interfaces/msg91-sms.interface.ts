export type Msg91OrderField =
  | 'customerName'
  | 'orderNumber'
  | 'grandTotal'
  | 'paymentMethod'
  | 'orderStatus';

export interface IMsg91FlowRecipient {
  mobiles: string;
  [key: string]: string;
}

export interface IMsg91FlowSendPayload {
  template_id: string;
  short_url?: string;
  realTimeResponse?: string;
  recipients: IMsg91FlowRecipient[];
}

export interface IMsg91FlowSendResult {
  httpStatus: number;
  body: unknown;
}
