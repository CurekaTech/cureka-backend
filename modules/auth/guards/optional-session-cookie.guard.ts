import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionService } from '../services/session.service';
import { IUserSessionContext } from '../interfaces/session.interface';
import { getSessionTokenFromRequest } from '../utils/auth-cookie.util';
import { SESSION_PURPOSE_GOKWIK_CHECKOUT } from '../constants/session-purpose.constants';

/**
 * Resolves session when present (cookie or Bearer); does not throw when missing.
 * Use for endpoints that support both guest and authenticated users.
 * Ignores gokwik_checkout tokens (treat as unauthenticated for normal APIs).
 */
@Injectable()
export class OptionalSessionCookieGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: IUserSessionContext }>();

    const sessionToken = getSessionTokenFromRequest(request);
    if (!sessionToken) {
      return true;
    }

    try {
      const user = await this.sessionService.resolveSessionFromToken(sessionToken);
      if (user.purpose === SESSION_PURPOSE_GOKWIK_CHECKOUT) {
        return true;
      }
      request.user = user;
    } catch {
      // Invalid/expired session — treat as guest
    }

    return true;
  }
}
