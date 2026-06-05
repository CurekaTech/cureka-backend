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
 * Pure cookie session auth for ecommerce users — no JWT.
 * Reads user_session cookie, validates against user_sessions table, sets request.user.
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
      throw new UnauthorizedException('Session cookie missing');
    }

    request.user = await this.sessionService.resolveSessionFromToken(sessionToken);
    return true;
  }
}
