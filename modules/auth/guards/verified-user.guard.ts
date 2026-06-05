import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { IUserSessionContext } from '../interfaces/session.interface';

/**
 * Strict guard for fully onboarded users.
 * Requires:
 *   - Valid session cookie (via SessionCookieGuard)
 *   - isGuest === false
 *   - isRegistered === true (completed profile)
 *   - status === ACTIVE
 *
 * Always compose AFTER SessionCookieGuard.
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IUserSessionContext }>();

    const sessionUser = request.user;

    if (!sessionUser?.sub) {
      throw new UnauthorizedException('Authentication required');
    }

    if (sessionUser.isGuest === true) {
      throw new ForbiddenException('Guest users cannot access this resource');
    }

    if (sessionUser.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Account is inactive');
    }

    if (!sessionUser.isRegistered) {
      throw new ForbiddenException(
        'Please complete your profile registration before accessing this resource',
      );
    }

    return true;
  }
}
