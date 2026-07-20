export const AuditEntityType = {
  BLOG_POST: 'blog_post',
  SUPPORT_TICKET: 'support_ticket',
} as const;

export type AuditEntityTypeValue =
  (typeof AuditEntityType)[keyof typeof AuditEntityType];
