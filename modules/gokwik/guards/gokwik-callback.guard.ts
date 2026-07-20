import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';

const CALLBACK_SECRET_HEADER = 'x-gokwik-callback-secret';

/**
 * Shared-secret protection for merchant callbacks. Production fails closed.
 */
@Injectable()
export class GokwikCallbackGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('gokwik.callbackSecret')?.trim();
    const required = this.configService.get<boolean>('gokwik.callbackAuthRequired') ?? false;
    if (!expected) {
      if (required) {
        throw new ServiceUnavailableException('GoKwik callback authentication is not configured');
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const provided = request.headers[CALLBACK_SECRET_HEADER];
    const value = Array.isArray(provided) ? provided[0] : provided;

    if (!value || !this.matchesSecret(value, expected)) {
      throw new UnauthorizedException('not authorized');
    }

    return true;
  }

  private matchesSecret(provided: string, expected: string): boolean {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }
}
