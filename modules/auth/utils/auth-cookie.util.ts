import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AUTH_COOKIE_NAMES,
  getSessionCookieMaxAgeSeconds,
} from '../constants/auth-cookie.constants';

const isProduction = (): boolean => process.env['NODE_ENV'] === 'production';

export const setUserSessionCookie = (
  reply: FastifyReply,
  sessionToken: string,
  expiresInDays: number,
): void => {
  reply.setCookie(AUTH_COOKIE_NAMES.USER_SESSION, sessionToken, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: getSessionCookieMaxAgeSeconds(expiresInDays),
  });
};

export const clearUserSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(AUTH_COOKIE_NAMES.USER_SESSION, { path: '/' });
};

export const getSessionTokenFromRequest = (req: FastifyRequest): string | undefined => {
  const token = req.cookies?.[AUTH_COOKIE_NAMES.USER_SESSION];
  return typeof token === 'string' && token.length > 0 ? token : undefined;
};
