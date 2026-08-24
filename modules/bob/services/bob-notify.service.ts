import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

const RESPONSE_PREVIEW_CHARS = 1500;

@Injectable()
export class BobNotifyService implements OnModuleInit {
  private readonly logger = new Logger(BobNotifyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    const base = this.notifyBase();
    const legacySendUrl = (process.env['WHATSAPP_SEND_URL'] ?? '').trim();
    const legacyEnabled = process.env['WHATSAPP_ENABLED'] === 'true';
    this.logger.log(
      {
        notifyConfigured: Boolean(base),
        guestIdConfigured: Boolean(this.guestId()),
        notifyHost: this.hostOf(base),
        timeoutMs: this.configService.get<number>('bob.timeoutMs') ?? 15000,
        channel: 'notifications-api',
        wabizSendUsed: false,
      },
      '[BOB notify] config on startup — WhatsApp goes through /orders-create, never /wabiz/send',
    );
    if (!base) {
      this.logger.warn(
        '[BOB notify] BOB_NOTIFY_URL is empty — order WhatsApp will not send',
      );
    }
    if (legacySendUrl || legacyEnabled) {
      this.logger.warn(
        {
          WHATSAPP_ENABLED: legacyEnabled,
          hasWhatsappSendUrl: Boolean(legacySendUrl),
        },
        '[BOB notify] WHATSAPP_* env is ignored — delete it. Cureka does not call /wabiz/send',
      );
    }
  }

  async post(path: string, payload: object): Promise<void> {
    const base = this.notifyBase();
    const guestId = this.guestId();
    if (!base) {
      this.logger.warn({ path }, '[BOB notify] skipped — BOB_NOTIFY_URL is not set');
      return;
    }
    if (!guestId) {
      this.logger.warn({ path }, '[BOB notify] skipped — BOB_GUEST_ID is not set');
      return;
    }

    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const timeout = this.configService.get<number>('bob.timeoutMs') ?? 15000;
    const started = Date.now();
    const summary = this.payloadSummary(payload);

    this.logger.log(
      {
        path,
        url,
        timeoutMs: timeout,
        payloadKeys: Object.keys(payload),
        authHeaders: ['x-guest-id', 'x-api-key'],
        wabizSendUsed: false,
        ...summary,
      },
      '[BOB notify] posting Notifications API — BOB sends WhatsApp after this',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout,
          headers: {
            'content-type': 'application/json',
            // Docs: x-guest-id. customstore.bonb.io gateway also requires X-API-Key.
            'x-guest-id': guestId,
            'x-api-key': guestId,
            'X-API-Key': guestId,
          },
          validateStatus: () => true,
        }),
      );

      const httpStatus = response.status;
      const body = response.data;
      const bobStatus = this.readString(body, 'status');
      const bobStatusCode = this.readNumber(body, 'statusCode');
      const bobError = this.readString(body, 'error') || this.readString(body, 'message');
      const elapsedMs = Date.now() - started;
      const rejected = this.isRejected(httpStatus, body);

      const logPayload = {
        path,
        url,
        httpStatus,
        elapsedMs,
        bobStatus,
        bobStatusCode,
        bobError,
        contentType: String(response.headers?.['content-type'] ?? ''),
        bodyPreview: this.previewBody(body),
        ...summary,
      };

      if (rejected) {
        this.logger.warn(
          logPayload,
          '[BOB notify] BOB rejected Notifications API — WhatsApp will not send',
        );
        return;
      }

      this.logger.log(
        logPayload,
        '[BOB notify] posted — BOB accepted (expected { status: "success", statusCode: 200 })',
      );
    } catch (error) {
      this.logger.warn(
        {
          path,
          url,
          elapsedMs: Date.now() - started,
          ...summary,
          ...this.axiosErrorFields(error),
        },
        '[BOB notify] failed (non-blocking) — WhatsApp will not send',
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

  private isRejected(httpStatus: number, body: unknown): boolean {
    if (httpStatus >= 400) return true;
    const row = this.asRecord(body);
    const status = typeof row?.['status'] === 'string' ? row['status'].toLowerCase() : '';
    if (status === 'failure' || status === 'failed') return true;
    const code = this.readNumber(body, 'statusCode');
    return code != null && code >= 400;
  }

  private hostOf(url: string): string | null {
    if (!url) return null;
    try {
      return new URL(url).host;
    } catch {
      return 'invalid-url';
    }
  }

  private payloadSummary(payload: object): {
    orderId?: string;
    orderName?: string;
    phoneMasked?: string | null;
    hasEmail?: boolean;
    lineItemCount?: number;
    fulfillmentStatus?: string;
  } {
    const row = payload as Record<string, unknown>;
    const shipping = this.asRecord(row['shippingAddress']);
    const customer = this.asRecord(row['customer']);
    const phone = String(
      shipping?.['phone'] ?? customer?.['phone'] ?? row['phone'] ?? '',
    );
    const email = String(row['email'] ?? customer?.['email'] ?? '');
    const lineItems = row['lineItems'] ?? row['line_items'];
    return {
      orderId: row['id'] != null ? String(row['id']) : undefined,
      orderName: row['name'] != null ? String(row['name']) : undefined,
      phoneMasked: this.maskPhone(phone),
      hasEmail: Boolean(email.trim()),
      lineItemCount: Array.isArray(lineItems) ? lineItems.length : undefined,
      fulfillmentStatus:
        typeof row['status'] === 'string' ? row['status'] : undefined,
    };
  }

  private maskPhone(phone: string): string | null {
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 4) return '****';
    return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
  }

  private previewBody(data: unknown): string {
    if (data == null) return '';
    if (typeof data === 'string') return data.slice(0, RESPONSE_PREVIEW_CHARS);
    try {
      return JSON.stringify(data).slice(0, RESPONSE_PREVIEW_CHARS);
    } catch {
      return String(data).slice(0, 500);
    }
  }

  private readString(body: unknown, key: string): string | undefined {
    const row = this.asRecord(body);
    const value = row?.[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private readNumber(body: unknown, key: string): number | undefined {
    const row = this.asRecord(body);
    const value = row?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  private axiosErrorFields(error: unknown): {
    error: string;
    axiosCode?: string;
    httpStatus?: number;
    bodyPreview?: string;
  } {
    if (error instanceof AxiosError) {
      return {
        error: error.message,
        axiosCode: error.code,
        httpStatus: error.response?.status,
        bodyPreview: this.previewBody(error.response?.data),
      };
    }
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
