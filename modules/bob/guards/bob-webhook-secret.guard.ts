import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { FastifyRequest } from 'fastify';

const WEBHOOK_SECRET_HEADERS = [
  'x-bob-webhook-secret',
  'x-webhook-secret',
] as const;

/**
 * Protects BOB webhook endpoints. Caller must send `x-bob-webhook-secret`
 * matching `BOB_WEBHOOK_SECRET`. Independent of GoKwik and of `x-guest-id`.
 */
@Injectable()
export class BobWebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(BobWebhookSecretGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('bob.webhookSecret')?.trim() ?? '';
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.url;

    if (!expected) {
      this.logger.error({ path }, '[BOB webhook] BOB_WEBHOOK_SECRET is not configured');
      throw new ServiceUnavailableException('BOB webhook secret is not configured');
    }

    const provided = this.readSecret(request);
    if (!provided || !this.matchesSecret(provided, expected)) {
      this.logger.warn({ path }, '[BOB webhook] rejected — invalid or missing secret');
      throw new UnauthorizedException('not authorized');
    }
    return true;
  }

  private readSecret(request: FastifyRequest): string {
    for (const name of WEBHOOK_SECRET_HEADERS) {
      const provided = request.headers[name];
      const value = Array.isArray(provided) ? provided[0] : provided;
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return '';
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
