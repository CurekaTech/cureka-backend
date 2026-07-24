import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionService } from '../services/session.service';
import { IUserSessionContext } from '../interfaces/session.interface';
import { getSessionTokenFromRequest } from '../utils/auth-cookie.util';

/**
 * Storefront session auth for ecommerce users — opaque session token (not JWT).
 * Accepts `user_session` cookie or `Authorization: Bearer <token>`.
 */
@Injectable()
export class SessionCookieGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IUserSessionContext }>();

    const sessionToken = getSessionTokenFromRequest(request);
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Session missing — provide user_session cookie or Authorization: Bearer <token>',
      );
    }

    request.user = await this.sessionService.resolveSessionFromToken(sessionToken);
    return true;
  }
}
