import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UnauthorizedException } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { FastifyRequest } from 'fastify';
import { IJwtPayload } from '@packages/auth';
import { AdminSessionsRepository } from '../repositories/admin-sessions.repository';
import { isSuperAdminSessionAccount } from '../utils/super-admin-session.util';

@Injectable()
export class AdminSuperadminSessionInterceptor implements NestInterceptor {
  constructor(private readonly adminSessionsRepository: AdminSessionsRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: IJwtPayload }>();
    const user = request.user;
    if (!user || !isSuperAdminSessionAccount(user.email)) return next.handle();
    if (this.isAdminLogout(request)) return next.handle();

    return from(this.assertActiveSession(user)).pipe(switchMap(() => next.handle()));
  }

  private isAdminLogout(request: FastifyRequest): boolean {
    const path = request.routeOptions?.url ?? request.url ?? '';
    return request.method === 'POST' && path.includes('/auth/admin/logout');
  }

  private async assertActiveSession(user: IJwtPayload): Promise<void> {
    if (!user.sessionId || !user.sub) {
      throw new UnauthorizedException('Admin session is not active');
    }
    const active = await this.adminSessionsRepository.isActiveForAdmin(user.sessionId, user.sub);
    if (!active) {
      throw new UnauthorizedException('Admin session is not active');
    }
  }
}
