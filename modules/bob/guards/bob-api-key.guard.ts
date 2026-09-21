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

const GUEST_HEADER = 'x-guest-id';
const LEGACY_HEADER = 'x-bob-api-key';
const GUEST_QUERY_KEYS = ['x-guest-id', 'guestId'] as const;

@Injectable()
export class BobApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(BobApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.expectedKey();
    const required = this.configService.get<boolean>('bob.authRequired') ?? false;
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.url;

    if (!expected) {
      if (required) {
        this.logger.error({ path }, '[BOB auth] BOB_GUEST_ID is not configured');
        throw new ServiceUnavailableException('BOB API key is not configured');
      }
      this.logger.warn({ path }, '[BOB auth] skipped — guest API key is empty');
      return true;
    }

    const provided = this.readProvidedKey(request);
    if (!provided || !this.matchesSecret(provided, expected)) {
      this.logger.warn({ path }, '[BOB auth] rejected');
      throw new UnauthorizedException('not authorized');
    }
    return true;
  }

  private expectedKey(): string {
    return (
      this.configService.get<string>('bob.guestId')?.trim() ||
      this.configService.get<string>('bob.apiKey')?.trim() ||
      ''
    );
  }

  private readProvidedKey(request: FastifyRequest): string {
    return (
      this.readHeader(request, GUEST_HEADER) ||
      this.readHeader(request, LEGACY_HEADER) ||
      this.readQuery(request, GUEST_QUERY_KEYS[0]) ||
      this.readQuery(request, GUEST_QUERY_KEYS[1])
    );
  }

  private readHeader(request: FastifyRequest, name: string): string {
    const provided = request.headers[name];
    const value = Array.isArray(provided) ? provided[0] : provided;
    return typeof value === 'string' ? value.trim() : '';
  }

  private readQuery(request: FastifyRequest, name: string): string {
    const query = request.query as Record<string, unknown> | undefined;
    const provided = query?.[name];
    const value = Array.isArray(provided) ? provided[0] : provided;
    return typeof value === 'string' ? value.trim() : '';
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
