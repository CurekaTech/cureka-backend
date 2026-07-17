import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Payment/refund webhooks remain closed until GoKwik supplies the exact
 * signature header, canonical payload, timestamp tolerance, and HMAC formula.
 * Do not replace this with a guessed verification scheme.
 */
@Injectable()
export class GokwikWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const enabled = this.configService.get<boolean>('gokwik.webhookEnabled') ?? false;
    const secret = this.configService.get<string>('gokwik.webhookSecret')?.trim();
    if (!enabled || !secret) {
      throw new ServiceUnavailableException('GoKwik payment webhooks are disabled');
    }

    throw new ServiceUnavailableException(
      'GoKwik webhook HMAC verification is pending the provider signing contract',
    );
  }
}
