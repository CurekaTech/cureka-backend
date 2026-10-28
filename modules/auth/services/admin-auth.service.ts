import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '@modules/master/services/audit.service';
import { getAuditActor } from '@modules/master/utils/audit-actor.context';
import { auditIdempotency } from '@modules/master/utils/audit-idempotency.util';
import { maskAuditEmail } from '@modules/master/utils/audit-redact.util';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { AdminLoginDto } from '../dto/auth.dto';
import { IAdminAuthResponse } from '../interfaces/auth.interface';
import { IJwtPayload } from '@packages/auth';
import { comparePasswords } from '@packages/common';
import { mapAdminUserEntityToResponse } from '@modules/admin-users/mappers/admin-user.mapper';
import { mapRoleEntityToResponse } from '@modules/roles/mappers/role.mapper';
import { AdminSessionsRepository } from '../repositories/admin-sessions.repository';
import {
  isSuperAdminSessionAccount,
  parseJwtExpiresInToMilliseconds,
} from '../utils/super-admin-session.util';
import { isPromotionalOffersEnabled } from '@modules/promotional-offers/utils/promotional-offers-enabled.util';
import { isSubscriptionsModuleEnabled } from '@modules/subscription/utils/subscriptions-module.util';
import {
  expandScopedPermissionCodes,
  scopedMenuRequiredPermissions,
} from '@modules/roles/constants/menu-permission-scopes.constants';

import { MENU_HIERARCHY, type MenuItem } from '../constants/admin-menu.constants';

export { MENU_HIERARCHY, type MenuItem };

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly adminSessionsRepository: AdminSessionsRepository,
  ) { }

  async login(dto: AdminLoginDto): Promise<IAdminAuthResponse> {
    const entity = isSuperAdminSessionAccount(dto.email)
      ? await this.adminUsersService.findByNormalizedEmailWithPassword(dto.email)
      : await this.adminUsersService.findByEmailWithPassword(dto.email);
    if (!entity) {
      this.logger.warn('Admin login failed: user not found');
      await this.auditLoginFailure(dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await comparePasswords(dto.password, entity.password);
    if (!passwordMatches) {
      this.logger.warn('Admin login failed: invalid password');
      await this.auditLoginFailure(dto.email);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!entity.isActive) {
      this.logger.warn('Admin login failed: account inactive');
      await this.auditLoginFailure(dto.email);
      throw new UnauthorizedException('Account is inactive');
    }

    if (
      entity.role !== AdminUserRole.SUPER_ADMIN &&
      entity.roleRecord &&
      entity.roleRecord.status !== MasterStatus.ACTIVE
    ) {
      this.logger.warn('Admin login failed: assigned role inactive');
      await this.auditLoginFailure(dto.email);
      throw new UnauthorizedException('Assigned role is inactive');
    }

    const sessionId = isSuperAdminSessionAccount(entity.email)
      ? await this.adminSessionsRepository.allocate(entity.id, this.accessTokenExpiresAt())
      : undefined;

    let accessToken: string;
    try {
      const payload: IJwtPayload = {
        sub: entity.id,
        email: entity.email,
        role: entity.role,
        roleId: entity.roleId,
        ...(sessionId ? { sessionId } : {}),
      };
      accessToken = this.jwtService.sign(payload);
    } catch (error) {
      if (sessionId) {
        await this.adminSessionsRepository.revoke(sessionId, entity.id).catch((revokeError) => {
          this.logger.error(
            `Failed to revoke super admin session after JWT sign failure: ${revokeError instanceof Error ? revokeError.message : String(revokeError)
            }`,
          );
        });
      }
      throw error;
    }

    await this.adminUsersService.recordLogin(entity.id);
    await this.auditService.persistCritical({
      entityType: 'admin_auth',
      entityId: entity.id,
      entityRefId: entity.refId,
      action: 'login_success',
      performedBy: entity.email,
      actorType: 'ADMIN',
      actorId: entity.id,
      idempotencyKey: auditIdempotency.authSuccess('login', entity.id, this.requestId()),
      details: { outcome: 'success' },
    });

    this.logger.log({ role: entity.role }, 'Admin login success');

    return {
      accessToken,
      user: mapAdminUserEntityToResponse(entity),
      role: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
      permissions: this.resolvePermissionCodes(entity),
      menu: await this.getMenuForUser(entity.id),
    };
  }

  /**
   * Cookie clearing stays in the controller. This account also revokes its server session.
   * A second logout revokes nothing and still writes the audit.
   */
  async recordCookieLogout(user: { sub: string; email?: string; sessionId?: string }): Promise<void> {
    let serverSessionRevoked = false;
    if (isSuperAdminSessionAccount(user.email) && user.sessionId) {
      serverSessionRevoked = await this.adminSessionsRepository.revoke(user.sessionId, user.sub);
    }
    await this.auditService.persistCritical({
      entityType: 'admin_auth',
      entityId: user.sub,
      action: 'logout',
      performedBy: user.email ?? user.sub,
      actorType: 'ADMIN',
      actorId: user.sub,
      idempotencyKey: auditIdempotency.authSuccess('logout', user.sub, this.requestId()),
      details: { cookieCleared: true, serverSessionRevoked },
    });
  }

  private accessTokenExpiresAt(): Date {
    const configured = this.configService.get<string>('jwt.expiresIn', '7d');
    const lifetimeMs = parseJwtExpiresInToMilliseconds(configured);
    if (lifetimeMs === undefined || lifetimeMs <= 0) {
      throw new BadRequestException('Admin login is unavailable');
    }
    return new Date(Date.now() + lifetimeMs);
  }

  private async auditLoginFailure(email: string): Promise<void> {
    const requestId = this.requestId();
    await this.auditService.persistCritical({
      entityType: 'admin_auth',
      entityId: null,
      entityRefId: requestId,
      action: 'login_failed',
      performedBy: 'anonymous',
      actorType: 'ANONYMOUS',
      actorId: null,
      idempotencyKey: auditIdempotency.authFailure('admin', maskAuditEmail(email), requestId),
      details: { email: maskAuditEmail(email), outcome: 'failure' },
    });
  }

  private requestId(): string {
    return getAuditActor()?.requestId ?? randomUUID();
  }

  async me(adminUserId: string): Promise<Omit<IAdminAuthResponse, 'accessToken'>> {
    const entity = await this.adminUsersService.findEntityById(adminUserId);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Account is inactive or not found');
    }

    return {
      user: mapAdminUserEntityToResponse(entity),
      role: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
      permissions: this.resolvePermissionCodes(entity),
      menu: await this.getMenuForUser(entity.id),
    };
  }

  private resolvePermissionCodes(entity: {
    role: string;
    roleRecord?: {
      permissions?: { code: string; status: MasterStatus }[];
    };
  }): string[] {
    if (entity.role === AdminUserRole.SUPER_ADMIN) {
      return ['*'];
    }

    return [
      ...expandScopedPermissionCodes(
        (entity.roleRecord?.permissions ?? [])
      .filter((permission) => permission.status === MasterStatus.ACTIVE)
          .map((permission) => permission.code),
      ),
    ];
  }

  async getMenuForUser(adminUserId: string): Promise<MenuItem[]> {
    const entity = await this.adminUsersService.findEntityById(adminUserId);
    if (!entity || !entity.isActive) {
      throw new UnauthorizedException('Account is inactive or not found');
    }

    const permissions = this.resolvePermissionCodes(entity);
    const hasWildcard = permissions.includes('*');
    const userPermissionsSet = new Set(permissions);

    const filterItems = (items: MenuItem[]): MenuItem[] => {
      return items
        .map((item) => {
          let hasAccess = false;
          const requiredPermissions =
            scopedMenuRequiredPermissions(item.key) ?? item.requiredPermissions;

          if (requiredPermissions && requiredPermissions.length > 0) {
            hasAccess = hasWildcard || requiredPermissions.some((p) => userPermissionsSet.has(p));
          } else {
            hasAccess = true;
          }

          if (item.subItems) {
            const filteredSub = filterItems(item.subItems);
            if (filteredSub.length > 0) {
              return {
                name: item.name,
                key: item.key,
                icon: item.icon,
                ...(item.href ? { href: item.href } : {}),
                subItems: filteredSub,
              };
            }
            return null;
          }

          return hasAccess
            ? {
              name: item.name,
              key: item.key,
              icon: item.icon,
              href: item.href,
            }
            : null;
        })
        .filter(Boolean) as MenuItem[];
    };

    const offersEnabled = isPromotionalOffersEnabled(this.configService);
    const withModules = menuForSubscriptionsModule(isSubscriptionsModuleEnabled(this.configService));
    const visible = offersEnabled
      ? withModules
      : withModules.map((item) =>
          item.subItems
            ? { ...item, subItems: item.subItems.filter((sub) => sub.key !== 'masters-promotional-offers') }
            : item,
        );
    return filterItems(visible);
  }
}

function menuForSubscriptionsModule(enabled: boolean): MenuItem[] {
  if (enabled) return MENU_HIERARCHY;
  return MENU_HIERARCHY.flatMap((item) => {
    if (item.key === 'subscriptions') return [];
    if (!item.subItems?.length) return [item];
    return [
      {
        ...item,
        subItems: item.subItems.filter((sub) => sub.key !== 'masters-subscription-frequency'),
      },
    ];
  });
}
