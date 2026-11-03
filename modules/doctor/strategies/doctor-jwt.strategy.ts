import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { FastifyRequest } from 'fastify';
import '@fastify/cookie';
import { IDoctorJwtPayload } from '../interfaces/doctor-jwt-payload.interface';

import { DOCTOR_ACCESS_COOKIE } from '../constants/doctor-auth.constants';

@Injectable()
export class DoctorJwtStrategy extends PassportStrategy(Strategy, 'doctor-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: FastifyRequest) => (req?.cookies?.[DOCTOR_ACCESS_COOKIE] as string) ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: IDoctorJwtPayload & { type?: string }): IDoctorJwtPayload {
    if (payload.type !== 'doctor') {
      throw new UnauthorizedException('Invalid doctor token');
    }
    if (!payload.sessionId) {
      throw new UnauthorizedException('Invalid doctor session');
    }
    return {
      sub: payload.sub,
      type: 'doctor',
      sessionId: payload.sessionId,
      category: payload.category,
      email: payload.email,
    };
  }
}
