import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class BobNotifyService {
  private readonly logger = new Logger(BobNotifyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async post(path: string, payload: object): Promise<void> {
    const base = this.notifyBase();
    const guestId = this.guestId();
    if (!base) {
      return;
    }
    if (!guestId) {
      this.logger.warn({ path }, '[BOB notify] skipped — BOB_GUEST_ID is not set');
      return;
    }

    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const timeout = this.configService.get<number>('bob.timeoutMs') ?? 15000;

    try {
      await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout,
          headers: {
            'content-type': 'application/json',
            'x-guest-id': guestId,
          },
        }),
      );
    } catch (error) {
      this.logger.warn(
        {
          path,
          error: error instanceof Error ? error.message : String(error),
        },
        '[BOB notify] failed (non-blocking)',
      );
    }
  }

  private notifyBase(): string {
    const raw = this.configService.get<string>('bob.notifyUrl')?.trim() ?? '';
    if (!raw) return '';
    return raw
      .replace(/\/+$/, '')
      .replace(
        /\/(orders-create|orders-cancelled|fulfillments-create|fulfillments-events-create|abandoned-cart)$/i,
        '',
      );
  }

  private guestId(): string {
    return (
      this.configService.get<string>('bob.guestId')?.trim() ||
      this.configService.get<string>('bob.apiKey')?.trim() ||
      ''
    );
  }
}
