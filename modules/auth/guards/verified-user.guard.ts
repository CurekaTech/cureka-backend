import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { UsersService } from '@modules/users/services/users.service';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { IJwtPayload } from '../interfaces/auth.interface';

/**
 * Strict guard for fully onboarded users.
 * Requires:
 *   - Valid JWT (user must already be authenticated via JwtAuthGuard)
 *   - isGuest === false
 *   - isRegistered === true (completed profile)
 *   - status === ACTIVE
 *
 * Always compose AFTER JwtAuthGuard: `@UseGuards(JwtAuthGuard, VerifiedUserGuard)`
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IJwtPayload }>();

    const jwtUser = request.user;

    if (!jwtUser?.sub) {
      throw new UnauthorizedException('Authentication required');
    }

    if (jwtUser.isGuest === true) {
      throw new ForbiddenException('Guest users cannot access this resource');
    }

    const user = await this.usersService.findById(jwtUser.sub);

    if (user.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Account is inactive');
    }

    if (!user.isRegistered) {
      throw new ForbiddenException(
        'Please complete your profile registration before accessing this resource',
      );
    }

    return true;
  }
}
