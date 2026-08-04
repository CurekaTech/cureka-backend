import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMobileNumber } from '@modules/auth/utils/mobile-number.util';
import {
  IMsg91FlowSendPayload,
  IMsg91FlowSendResult,
} from '../interfaces/msg91-sms.interface';

/**
 * MSG91 SMS client — Flow API for transactional SMS (thank-you, etc.).
 * Docs: https://docs.msg91.com/sms/send-sms
 * Endpoint: POST https://control.msg91.com/api/v5/flow
 */
@Injectable()
export class Msg91SmsService {
  private readonly logger = new Logger(Msg91SmsService.name);
  private readonly enabled: boolean;
  private readonly authKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly shortUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('msg91.enabled') ?? false;
    this.authKey = this.configService.get<string>('msg91.authKey') ?? '';
    this.baseUrl = (
      this.configService.get<string>('msg91.baseUrl') ?? 'https://control.msg91.com/api/v5'
    ).replace(/\/$/, '');
    this.timeoutMs = this.configService.get<number>('msg91.timeoutMs') ?? 15000;
    this.shortUrl = this.configService.get<string>('msg91.shortUrl') ?? '0';

    const hasEnv = (key: string) => {
      const value = process.env[key];
      return typeof value === 'string' && value.trim().length > 0;
    };

    this.logger.log(
      {
        MSG91_ENABLED: hasEnv('MSG91_ENABLED'),
        MSG91_ENABLED_true: this.enabled,
        MSG91_AUTH_KEY: hasEnv('MSG91_AUTH_KEY'),
        MSG91_OTP_TEMPLATE_ID: hasEnv('MSG91_OTP_TEMPLATE_ID'),
        MSG91_ORDER_THANKYOU_TEMPLATE_ID: hasEnv('MSG91_ORDER_THANKYOU_TEMPLATE_ID'),
        MSG91_ORDER_THANKYOU_VARS: hasEnv('MSG91_ORDER_THANKYOU_VARS'),
        MSG91_SHORT_URL: hasEnv('MSG91_SHORT_URL'),
        MSG91_BASE_URL: hasEnv('MSG91_BASE_URL'),
        MSG91_TIMEOUT_MS: hasEnv('MSG91_TIMEOUT_MS'),
        readyToSend: this.isConfigured(),
      },
      '[MSG91-SMS] Env presence check (true/false only)',
    );
  }

  isConfigured(): boolean {
    return this.enabled && Boolean(this.authKey) && Boolean(this.baseUrl);
  }

  /** Formats Indian mobile as 91XXXXXXXXXX (MSG91 international format). */
  toMsg91Mobile(phoneNumber: string): string {
    const digits = normalizeMobileNumber(phoneNumber);
    if (digits.startsWith('91') && digits.length === 12) return digits;
    if (digits.length === 10) return `91${digits}`;
    return digits;
  }

  async sendFlowSms(params: {
    templateId: string;
    phone: string;
    /** Template placeholders, e.g. { var: 'Dinesh', var1: 'ORD123' } */
    variables: Record<string, string>;
    /** Optional correlation fields for logs (order number, source, etc.). */
    context?: Record<string, string | number | boolean | null | undefined>;
  }): Promise<IMsg91FlowSendResult> {
    if (!this.isConfigured()) {
      this.logger.warn(
        {
          ...params.context,
          enabled: this.enabled,
          authKeyConfigured: Boolean(this.authKey),
          reason: 'not_configured',
        },
        '[MSG91-SMS] Skipped — disabled or auth key missing',
      );
      return { httpStatus: 0, body: { skipped: true }, skipped: true };
    }

    if (!params.templateId?.trim()) {
      this.logger.error(
        { ...params.context, reason: 'empty_template_id' },
        '[MSG91-SMS] Rejected — template_id is empty',
      );
      throw new ServiceUnavailableException('MSG91 Flow template_id is empty');
    }

    const mobiles = this.toMsg91Mobile(params.phone);
    if (!mobiles) {
      this.logger.error(
        { ...params.context, reason: 'empty_mobile' },
        '[MSG91-SMS] Rejected — mobile number is empty',
      );
      throw new ServiceUnavailableException('MSG91 mobile number is empty');
    }

    const payload: IMsg91FlowSendPayload = {
      template_id: params.templateId.trim(),
      short_url: this.shortUrl,
      realTimeResponse: '1',
      recipients: [
        {
          mobiles,
          ...params.variables,
        },
      ],
    };

    const url = `${this.baseUrl}/flow`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();
    const variableSummary = Object.fromEntries(
      Object.entries(params.variables).map(([key, value]) => [
        key,
        { length: value?.length ?? 0, empty: !value?.trim() },
      ]),
    );

    this.logger.log(
      {
        ...params.context,
        stage: 'request',
        url,
        templateId: params.templateId.trim(),
        phone: this.maskPhone(mobiles),
        variableKeys: Object.keys(params.variables),
        variableSummary,
        shortUrl: this.shortUrl,
      },
      '[MSG91-SMS] Sending Flow SMS',
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authkey: this.authKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { rawBody: text.slice(0, 500) };
      }

      const requestId = this.extractRequestId(parsed);
      const providerStatus = this.extractProviderStatus(parsed);
      const elapsedMs = Date.now() - startedAt;
      const result: IMsg91FlowSendResult = {
        httpStatus: response.status,
        body: parsed,
        requestId,
        providerStatus,
      };

      if (!response.ok) {
        this.logger.error(
          {
            ...params.context,
            stage: 'response',
            templateId: params.templateId.trim(),
            phone: this.maskPhone(mobiles),
            elapsedMs,
            httpStatus: response.status,
            requestId,
            providerStatus,
            body: parsed,
          },
          '[MSG91-SMS] Flow SMS rejected by provider',
        );
        throw new ServiceUnavailableException(
          `MSG91 Flow SMS failed with HTTP ${response.status}`,
        );
      }

      this.logger.log(
        {
          ...params.context,
          stage: 'response',
          templateId: params.templateId.trim(),
          phone: this.maskPhone(mobiles),
          elapsedMs,
          httpStatus: response.status,
          requestId,
          providerStatus,
          body: parsed,
        },
        '[MSG91-SMS] Flow SMS sent successfully',
      );

      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const isAbort = error instanceof Error && error.name === 'AbortError';
      this.logger.error(
        {
          ...params.context,
          stage: 'error',
          templateId: params.templateId.trim(),
          phone: this.maskPhone(mobiles),
          elapsedMs: Date.now() - startedAt,
          timedOut: isAbort,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { message: String(error) },
        },
        isAbort ? '[MSG91-SMS] Flow SMS timed out' : '[MSG91-SMS] Flow SMS request failed',
      );
      throw new ServiceUnavailableException(
        isAbort
          ? `MSG91 Flow SMS timed out after ${this.timeoutMs}ms`
          : 'MSG91 SMS API is unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractRequestId(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    const value = record['request_id'] ?? record['requestId'] ?? record['message'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private extractProviderStatus(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    const value = record['type'] ?? record['status'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private maskPhone(phone: string): string {
    if (phone.length < 6) return '***';
    return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
  }
}
