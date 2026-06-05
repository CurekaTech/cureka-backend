export interface IJwtPayload {
  /** Subject — the authenticated entity's UUID (admin or user) */
  sub: string;
  /** Active refresh session id — present on user access tokens */
  sessionId?: string;
  /** RBAC role — customer, vendor, admin, etc. */
  role?: string;
  /** Present only on user tokens — true for guest sessions */
  isGuest?: boolean;
  /** Present only on admin tokens */
  email?: string;
}

/** Narrowed payload for admin-protected routes — email and role are always present in admin JWTs */
export interface IAdminJwtPayload extends IJwtPayload {
  email: string;
  role: string;
}
