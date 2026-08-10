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
  'x-gokwik-webhook-secret',
  'x-gokwik-callback-secret',
  'x-webhook-secret',
] as const;

/**
 * Accepts GoKwik payment/refund webhook *events* when enabled.
 * Optional shared-secret header check when GOKWIK_WEBHOOK_SECRET is set.
 * Body `hmac` is logged/stored with the event; full HMAC verification can be
 * added later once GoKwik confirms the signing formula.
 */
@Injectable()
export class GokwikWebhookGuard implements CanActivate {
  private readonly logger = new Logger(GokwikWebhookGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = String(request.url ?? '').split('?')[0];
    const method = String(request.method ?? '').toUpperCase();
    const enabled = this.configService.get<boolean>('gokwik.webhookEnabled') ?? false;
    const expectedSecret = this.configService.get<string>('gokwik.webhookSecret')?.trim() ?? '';

    if (!enabled) {
      this.logger.warn(
        {
          method,
          path,
          requestId: request.id,
          reason: 'GOKWIK_WEBHOOK_ENABLED is not true',
        },
        '[GoKwik-Webhook] Rejected — webhooks disabled',
      );
      throw new ServiceUnavailableException('GoKwik payment webhooks are disabled');
    }

    if (expectedSecret) {
      const provided = this.readProvidedSecret(request);
      if (!provided || !this.matchesSecret(provided, expectedSecret)) {
        this.logger.warn(
          {
            method,
            path,
            requestId: request.id,
            reason: 'webhook secret header missing or invalid',
          },
          '[GoKwik-Webhook] Rejected — unauthorized',
        );
        throw new UnauthorizedException('not authorized');
      }
    } else {
      this.logger.warn(
        {
          method,
          path,
          requestId: request.id,
        },
        '[GoKwik-Webhook] Accepted without shared secret — set GOKWIK_WEBHOOK_SECRET when available',
      );
    }

    this.logger.log(
      {
        method,
        path,
        requestId: request.id,
        secretChecked: Boolean(expectedSecret),
      },
      '[GoKwik-Webhook] Auth passed — accepting event',
    );
    return true;
  }

  private readProvidedSecret(request: FastifyRequest): string | null {
    for (const header of WEBHOOK_SECRET_HEADERS) {
      const raw = request.headers[header];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    const auth = request.headers.authorization;
    if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice(7).trim();
    }
    return null;
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
