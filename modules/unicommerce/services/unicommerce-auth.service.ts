import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnicommerceAuthDto } from '../dto/unicommerce-auth.dto';
import { IUnicommerceAuthResponse } from '../interfaces/unicommerce-auth.interface';

// Token valid for 48 hours as recommended by Unicommerce spec
const UNICOMMERCE_TOKEN_EXPIRY = '48h';

@Injectable()
export class UnicommerceAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  authenticate(dto: UnicommerceAuthDto): IUnicommerceAuthResponse {
    const validUsername = this.configService.get<string>('UNICOMMERCE_USERNAME');
    const validPassword = this.configService.get<string>('UNICOMMERCE_PASSWORD');
    const username = dto.username?.trim() || dto.merchantID?.trim();

    if (
      !validUsername ||
      !validPassword ||
      !username ||
      username !== validUsername ||
      dto.password !== validPassword
    ) {
      return { status: 'INVALID_CREDENTIALS' };
    }

    const accessToken = this.jwtService.sign(
      { sub: username, type: 'unicommerce' },
      { expiresIn: UNICOMMERCE_TOKEN_EXPIRY },
    );

    return { status: 'SUCCESS', accessToken };
  }
}
