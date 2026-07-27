// import { FastifyReply, FastifyRequest } from 'fastify';
// import {
//   AUTH_COOKIE_NAMES,
//   getSessionCookieMaxAgeSeconds,
// } from '../constants/auth-cookie.constants';

// const isProduction = (): boolean => process.env['NODE_ENV'] === 'production';

// export const setUserSessionCookie = (
//   reply: FastifyReply,
//   sessionToken: string,
//   expiresInDays: number,
// ): void => {
//   reply.setCookie(AUTH_COOKIE_NAMES.USER_SESSION, sessionToken, {
//     httpOnly: true,
//     secure: isProduction(),
//     sameSite: 'lax',
//     path: '/',
//     maxAge: getSessionCookieMaxAgeSeconds(expiresInDays),
//   });
// };

// export const clearUserSessionCookie = (reply: FastifyReply): void => {
//   reply.clearCookie(AUTH_COOKIE_NAMES.USER_SESSION, { path: '/' });
// };

// export const getSessionTokenFromRequest = (req: FastifyRequest): string | undefined => {
//   const token = req.cookies?.[AUTH_COOKIE_NAMES.USER_SESSION];
//   return typeof token === 'string' && token.length > 0 ? token : undefined;
// };


import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AUTH_COOKIE_NAMES,
  getSessionCookieMaxAgeSeconds,
} from '../constants/auth-cookie.constants';

/**
 * Secure flag for auth cookies:
 * - COOKIE_SECURE=true|false overrides everything
 * - Otherwise uses X-Forwarded-Proto from nginx (http IP vs https domain)
 */
export const shouldUseSecureCookie = (req?: FastifyRequest): boolean => {
  const env = process.env['COOKIE_SECURE'];
  if (env === 'true') return true;
  if (env === 'false') return false;

  const forwarded = req?.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim().toLowerCase() === 'https';
  }

  return false;
};

export const getAuthCookieOptions = (
  req: FastifyRequest | undefined,
  maxAgeSeconds: number,
) => ({
  httpOnly: true as const,
  secure: shouldUseSecureCookie(req),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

export const setUserSessionCookie = (
  reply: FastifyReply,
  sessionToken: string,
  expiresInDays: number,
  req?: FastifyRequest,
): void => {
  reply.setCookie(
    AUTH_COOKIE_NAMES.USER_SESSION,
    sessionToken,
    getAuthCookieOptions(req, getSessionCookieMaxAgeSeconds(expiresInDays)),
  );
};

export const clearUserSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(AUTH_COOKIE_NAMES.USER_SESSION, { path: '/' });
};

/**
 * Resolve storefront session token from:
 * 1. `Authorization: Bearer <token>` (mobile / GoKwik / Postman — wins when present)
 * 2. HttpOnly cookie `user_session` (browser)
 *
 * Bearer is preferred so API clients are not overridden by a stale login cookie
 * (common in Postman when switching users while testing GoKwik callbacks).
 */
export const getSessionTokenFromRequest = (req: FastifyRequest): string | undefined => {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const [scheme, token] = authorization.split(/\s+/);
    if (scheme?.toLowerCase() === 'bearer' && token) {
      return token;
    }
  }

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.USER_SESSION];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  return undefined;
};
