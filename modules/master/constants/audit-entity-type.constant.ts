export const AuditEntityType = {
  BLOG_POST: 'blog_post',
  SUPPORT_TICKET: 'support_ticket',
  RETURN_REQUEST: 'return_request',
  RETURN_POLICY: 'return_policy',
  COD_PAYOUT: 'cod_payout',
} as const;

export type AuditEntityTypeValue =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];
