import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { AdminLoginDto } from '../dto/auth.dto';
import { IAdminAuthResponse } from '../interfaces/auth.interface';
import { IJwtPayload } from '@packages/auth';
import { comparePasswords } from '@packages/common';
import { mapAdminUserEntityToResponse } from '@modules/admin-users/mappers/admin-user.mapper';
import { mapRoleEntityToResponse } from '@modules/roles/mappers/role.mapper';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: AdminLoginDto): Promise<IAdminAuthResponse> {
    const entity = await this.adminUsersService.findByEmailWithPassword(dto.email);
    if (!entity) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await comparePasswords(dto.password, entity.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!entity.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    if (
      entity.role !== AdminUserRole.SUPER_ADMIN &&
      entity.roleRecord &&
      entity.roleRecord.status !== MasterStatus.ACTIVE
    ) {
      throw new UnauthorizedException('Assigned role is inactive');
    }

    await this.adminUsersService.recordLogin(entity.id);

    const payload: IJwtPayload = {
      sub: entity.id,
      email: entity.email,
      role: entity.role,
      roleId: entity.roleId,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: mapAdminUserEntityToResponse(entity),
      role: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
      permissions: this.resolvePermissionCodes(entity),
    };
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

    return (entity.roleRecord?.permissions ?? [])
      .filter((permission) => permission.status === MasterStatus.ACTIVE)
      .map((permission) => permission.code);
  }
}
