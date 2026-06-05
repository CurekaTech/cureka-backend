import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersService } from '@modules/admin-users/services/admin-users.service';
import { AdminLoginDto } from '../dto/auth.dto';
import { IAdminAuthResponse } from '../interfaces/auth.interface';
import { IJwtPayload } from '@packages/auth';
import { comparePasswords } from '@packages/common';
import { mapAdminUserEntityToResponse } from '@modules/admin-users/mappers/admin-user.mapper';

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

    await this.adminUsersService.recordLogin(entity.id);

    const payload: IJwtPayload = {
      sub: entity.id,
      email: entity.email,
      role: entity.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: mapAdminUserEntityToResponse(entity),
    };
  }
}
