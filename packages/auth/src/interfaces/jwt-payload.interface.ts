export interface IJwtPayload {
  /** Subject — the authenticated entity's UUID (admin or user) */
  sub: string;
  /** Present only on user tokens — true for guest sessions */
  isGuest?: boolean;
  /** Present only on admin tokens */
  email?: string;
  /** Present only on admin tokens */
  role?: string;
}

/** Narrowed payload for admin-protected routes — email and role are always present in admin JWTs */
export interface IAdminJwtPayload extends IJwtPayload {
  email: string;
  role: string;
}
