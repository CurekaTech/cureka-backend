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

/**
 * MSG91 Flow / Send SMS body for POST {baseUrl}/flow
 * Docs (template_id style): https://docs.msg91.com/sms/send-sms
 * Docs (flow_id + sender style): https://api.msg91.com/apidoc/textsms/send-sms-flow.php
 *
 * control.msg91.com/api/v5/flow accepts `template_id` (Flow/Template ID from dashboard).
 * `sender` is required when the flow uses FromAPI; otherwise optional override.
 */
export interface IMsg91FlowSendPayload {
  template_id: string;
  short_url?: string;
  realTimeResponse?: string;
  /** Registered DLT / MSG91 sender ID — must match portal exactly (e.g. CUREKA). */
  sender?: string;
  recipients: IMsg91FlowRecipient[];
}

export interface IMsg91FlowSendResult {
  httpStatus: number;
  body: unknown;
  /** True when MSG91 was skipped because disabled/unconfigured. */
  skipped?: boolean;
  /** MSG91 request id when present in API response. */
  requestId?: string | null;
  /** MSG91 response `type` / status when present. */
  providerStatus?: string | null;
  /** Raw response text before JSON parse. */
  rawBody?: string | null;
  /** Response header map (string values only). */
  responseHeaders?: Record<string, string>;
}
