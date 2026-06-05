import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import { IJwtPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Try httpOnly cookie first (admin sessions)
        (req: FastifyRequest) => (req?.cookies?.['admin_token'] as string) ?? null,
        // 2. Try httpOnly cookie (user/guest sessions)
        (req: FastifyRequest) => (req?.cookies?.['user_token'] as string) ?? null,
        // 3. Fall back to Authorization: Bearer <token>
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: IJwtPayload): IJwtPayload {
    return {
      sub: payload.sub,
      isGuest: payload.isGuest,
      email: payload.email,
      role: payload.role,
    };
  }
}
