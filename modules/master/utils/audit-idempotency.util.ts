export const auditIdempotency = {
  authFailure(channel: string, maskedSubject: string, requestId: string): string {
    return `auth-failure:${channel}:${maskedSubject}:${requestId}`;
  },
  authSuccess(action: string, subjectId: string, requestId: string): string {
    return `auth:${action}:${subjectId}:${requestId}`;
  },
  rbac(action: string, subjectId: string, version: string): string {
    return `rbac:${action}:${subjectId}:${version}`;
  },
  refund(action: string, subjectId: string, status: string): string {
    return `refund:${action}:${subjectId}:${status}`;
  },
  write(entityType: string, entityId: string, action: string, version: string): string {
    return `write:${entityType}:${entityId}:${action}:${version}`;
  },
  webhook(provider: string, providerEventId: string, action: string): string {
    return `webhook:${provider}:${providerEventId}:${action}`;
  },
};
