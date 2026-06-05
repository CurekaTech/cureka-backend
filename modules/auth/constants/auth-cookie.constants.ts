export const AUTH_COOKIE_NAMES = {
  /** Opaque session token — NOT JWT. Validated against user_sessions table. */
  USER_SESSION: 'user_session',
  /** Admin panel only — JWT in HttpOnly cookie. */
  ADMIN: 'admin_token',
} as const;

export const getSessionCookieMaxAgeSeconds = (expiresInDays: number): number =>
  expiresInDays * 24 * 60 * 60;
