import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';

const CALLBACK_SECRET_HEADER = 'x-gokwik-callback-secret';

/**
 * When GOKWIK_CALLBACK_SECRET is set, require a matching header.
 * When unset, allow all requests (BRD authMethod: none).
 */
@Injectable()
export class GokwikCallbackGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('GOKWIK_CALLBACK_SECRET')?.trim();
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = request.headers[CALLBACK_SECRET_HEADER];
    const value = Array.isArray(provided) ? provided[0] : provided;

    if (!value || value !== expected) {
      throw new UnauthorizedException('not authorized');
    }

    return true;
  }
}
