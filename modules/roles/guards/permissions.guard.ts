import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUserEntity } from '@modules/admin-users/entities/admin-user.entity';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { IAdminJwtPayload } from '@packages/auth';
import {
  PERMISSIONS_KEY,
  PERMISSIONS_MODE_KEY,
  type PermissionsMode,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AdminUserEntity)
    private readonly adminUsersRepository: Repository<AdminUserEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const mode =
      this.reflector.getAllAndOverride<PermissionsMode>(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'all';

    const request = context.switchToHttp().getRequest<{ user?: IAdminJwtPayload }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required');
    }

    if (user.role === AdminUserRole.SUPER_ADMIN) {
      return true;
    }

    const adminUser = await this.adminUsersRepository.findOne({
      where: { id: user.sub },
      relations: { roleRecord: { permissions: true } },
    });

    if (!adminUser?.roleRecord || adminUser.roleRecord.status !== MasterStatus.ACTIVE) {
      throw new ForbiddenException('Assigned role is inactive or missing');
    }

    const permissionCodes = new Set(
      (adminUser.roleRecord.permissions ?? [])
        .filter((permission) => permission.status === MasterStatus.ACTIVE)
        .map((permission) => permission.code),
    );

    const hasAccess =
      mode === 'any'
        ? requiredPermissions.some((permission) => permissionCodes.has(permission))
        : requiredPermissions.every((permission) => permissionCodes.has(permission));

    if (!hasAccess) {
      const joiner = mode === 'any' ? ' or ' : ', ';
      throw new ForbiddenException(
        `Access denied. Required permission(s): ${requiredPermissions.join(joiner)}`,
      );
    }

    return true;
  }
}
