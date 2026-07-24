import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionService } from '../services/session.service';
import { IUserSessionContext } from '../interfaces/session.interface';
import { getSessionTokenFromRequest } from '../utils/auth-cookie.util';

/**
 * Resolves session when present (cookie or Bearer); does not throw when missing.
 * Use for endpoints that support both guest and authenticated users.
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
      request.user = await this.sessionService.resolveSessionFromToken(sessionToken);
    } catch {
      // Invalid/expired session — treat as guest
    }

    return true;
  }
}
