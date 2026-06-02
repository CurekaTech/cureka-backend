import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminUsersRepository } from '@modules/admin-users/repositories/admin-users.repository';
import { AdminLoginDto } from '../dto/auth.dto';
import { IAdminAuthResponse, IJwtPayload } from '../interfaces/auth.interface';
import { comparePasswords } from '@packages/common';
import { mapAdminUserEntityToResponse } from '@modules/admin-users/mappers/admin-user.mapper';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly adminUsersRepository: AdminUsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: AdminLoginDto): Promise<IAdminAuthResponse> {
    const entity = await this.adminUsersRepository.findByEmailWithPassword(dto.email);
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

    await this.adminUsersRepository.updateLastLoginAt(entity.id);

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
