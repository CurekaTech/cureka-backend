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
 * Official docs use `flow_id` + uppercase VAR keys in recipients.
 */
export interface IMsg91FlowSendPayload {
  /** Canonical MSG91 Flow ID (DLT-mapped on panel). */
  flow_id: string;
  /** Legacy/alternate key — some accounts accept this instead of flow_id. */
  template_id?: string;
  short_url?: string;
  realTimeResponse?: string;
  /** Only when Flow sender mode is "From API". */
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
