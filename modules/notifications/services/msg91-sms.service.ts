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
  private readonly senderId: string;
  private readonly dltTemplateId: string;
  private readonly otpTemplateId: string;
  private readonly orderThankYouTemplateId: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled = this.configService.get<boolean>('msg91.enabled') ?? false;
    this.authKey = this.configService.get<string>('msg91.authKey') ?? '';
    this.baseUrl = (
      this.configService.get<string>('msg91.baseUrl') ?? 'https://control.msg91.com/api/v5'
    ).replace(/\/$/, '');
    this.timeoutMs = this.configService.get<number>('msg91.timeoutMs') ?? 15000;
    this.shortUrl = this.configService.get<string>('msg91.shortUrl') ?? '0';
    this.senderId = (this.configService.get<string>('msg91.senderId') ?? '').trim().toUpperCase();
    this.dltTemplateId = this.configService.get<string>('msg91.dltTemplateId') ?? '';
    this.otpTemplateId = this.configService.get<string>('msg91.otpTemplateId') ?? '';
    this.orderThankYouTemplateId =
      this.configService.get<string>('msg91.orderThankYouTemplateId') ?? '';

    this.logger.log(
      {
        MSG91_ENABLED: this.envPresence('MSG91_ENABLED'),
        MSG91_ENABLED_true: this.enabled,
        MSG91_AUTH_KEY: this.maskSecret(process.env['MSG91_AUTH_KEY'] ?? ''),
        MSG91_OTP_TEMPLATE_ID: this.envPresence('MSG91_OTP_TEMPLATE_ID'),
        MSG91_OTP_TEMPLATE_ID_value: this.otpTemplateId || null,
        MSG91_ORDER_THANKYOU_TEMPLATE_ID: this.envPresence('MSG91_ORDER_THANKYOU_TEMPLATE_ID'),
        MSG91_ORDER_THANKYOU_TEMPLATE_ID_value: this.orderThankYouTemplateId || null,
        MSG91_ORDER_THANKYOU_VARS: this.envPresence('MSG91_ORDER_THANKYOU_VARS'),
        MSG91_SENDER_ID: this.envPresence('MSG91_SENDER_ID'),
        MSG91_SENDER_ID_resolved: this.senderId,
        MSG91_DLT_TEMPLATE_ID: this.envPresence('MSG91_DLT_TEMPLATE_ID'),
        MSG91_DLT_TEMPLATE_ID_value: this.dltTemplateId || null,
        MSG91_SHORT_URL: this.envPresence('MSG91_SHORT_URL'),
        MSG91_BASE_URL: this.envPresence('MSG91_BASE_URL'),
        MSG91_BASE_URL_value: this.baseUrl,
        MSG91_TIMEOUT_MS: this.envPresence('MSG91_TIMEOUT_MS'),
        MSG91_FLOW_ID: this.envPresence('MSG91_FLOW_ID'),
        MSG91_ORDER_FLOW_ID: this.envPresence('MSG91_ORDER_FLOW_ID'),
        MSG91_SENDER: this.envPresence('MSG91_SENDER'),
        readyToSend: this.isConfigured(),
        note:
          'OTP path does not call MSG91 yet; order SMS uses Flow template_id + optional sender',
      },
      '[MSG91-SMS] Env presence / masked secrets check',
    );
  }

  isConfigured(): boolean {
    return (
      this.enabled &&
      Boolean(this.authKey) &&
      Boolean(this.baseUrl) &&
      Boolean(this.senderId)
    );
  }

  getSenderId(): string {
    return this.senderId;
  }

  getDltTemplateId(): string {
    return this.dltTemplateId;
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
    /** Template placeholders, e.g. { var1: 'ORD123', var2: 'Processing' } */
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

    const flowId = params.templateId.trim();
    const sender = this.senderId;

    if (!sender) {
      this.logger.error(
        { ...params.context, reason: 'empty_sender_id', envKey: 'MSG91_SENDER_ID' },
        '[MSG91-SMS] Rejected — MSG91_SENDER_ID is empty',
      );
      throw new ServiceUnavailableException('MSG91_SENDER_ID is not configured');
    }

    const payload: IMsg91FlowSendPayload = {
      template_id: flowId,
      short_url: this.shortUrl,
      realTimeResponse: '1',
      sender,
      recipients: [
        {
          mobiles,
          ...params.variables,
        },
      ],
    };

    const url = `${this.baseUrl}/flow`;
    const method = 'POST';
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      authkey: this.authKey,
    };
    const requestBodyJson = JSON.stringify(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = Date.now();

    this.logger.log(
      [
        '',
        '==================== MSG91 REQUEST ====================',
        `URL:\n${url}`,
        `Method:\n${method}`,
        `Headers:\n${JSON.stringify(
          {
            accept: headers.accept,
            'content-type': headers['content-type'],
            authkey: this.maskSecret(headers.authkey),
          },
          null,
          2,
        )}`,
        `Payload:\n${JSON.stringify(
          {
            ...payload,
            // keep full payload in log; auth is only in headers
          },
          null,
          2,
        )}`,
        `Flow ID:\n${flowId}`,
        `Sender:\n${sender}`,
        `DLT Template ID (portal mapping, not in body):\n${this.dltTemplateId || '(not configured)'}`,
        `Mobile:\n${mobiles}`,
        `Variables:\n${Object.entries(params.variables)
          .map(([key, value]) => `${key}:\n${value}`)
          .join('\n')}`,
        '=======================================================',
      ].join('\n'),
    );

    this.logger.log(
      {
        ...params.context,
        stage: 'request',
        url,
        method,
        flowId,
        sender,
        dltTemplateId: this.dltTemplateId || null,
        phone: mobiles,
        phoneMasked: this.maskPhone(mobiles),
        variables: params.variables,
        shortUrl: this.shortUrl,
        headersLogged: {
          accept: headers.accept,
          'content-type': headers['content-type'],
          authkey: this.maskSecret(headers.authkey),
        },
        payload,
      },
      '[MSG91-SMS] Sending Flow SMS (structured)',
    );

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBodyJson,
        signal: controller.signal,
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { rawBody: text.slice(0, 2000) };
      }

      const responseHeaders = this.headersToRecord(response.headers);
      const requestId = this.extractRequestId(parsed);
      const providerStatus = this.extractProviderStatus(parsed);
      const failureReason = this.extractFailureReason(parsed);
      const elapsedMs = Date.now() - startedAt;
      const result: IMsg91FlowSendResult = {
        httpStatus: response.status,
        body: parsed,
        requestId,
        providerStatus,
        rawBody: text,
        responseHeaders,
      };

      this.logger.log(
        [
          '',
          '==================== MSG91 RESPONSE ====================',
          `Status:\n${response.status}`,
          `Request ID:\n${requestId ?? '(none)'}`,
          `Provider status:\n${providerStatus ?? '(none)'}`,
          `Failure reason:\n${failureReason ?? '(none)'}`,
          `Elapsed ms:\n${elapsedMs}`,
          `Response headers:\n${JSON.stringify(responseHeaders, null, 2)}`,
          `Raw response body:\n${text}`,
          `Parsed response body:\n${JSON.stringify(parsed, null, 2)}`,
          '=======================================================',
        ].join('\n'),
      );

      if (!response.ok) {
        this.logger.error(
          {
            ...params.context,
            stage: 'response_error',
            flowId,
            sender,
            dltTemplateId: this.dltTemplateId || null,
            templateId: flowId,
            variables: params.variables,
            phone: this.maskPhone(mobiles),
            elapsedMs,
            httpStatus: response.status,
            requestId,
            providerStatus,
            failureReason,
            responseHeaders,
            rawBody: text,
            body: parsed,
            stack: new Error('MSG91 Flow SMS HTTP failure').stack,
          },
          '[MSG91-SMS] Flow SMS rejected by provider',
        );
        throw new ServiceUnavailableException(
          `MSG91 Flow SMS failed with HTTP ${response.status}`,
        );
      }

      if (failureReason || (providerStatus && providerStatus.toLowerCase() === 'error')) {
        this.logger.error(
          {
            ...params.context,
            stage: 'provider_logical_error',
            flowId,
            sender,
            dltTemplateId: this.dltTemplateId || null,
            variables: params.variables,
            httpStatus: response.status,
            requestId,
            providerStatus,
            failureReason,
            body: parsed,
            rawBody: text,
          },
          '[MSG91-SMS] Flow SMS accepted HTTP but provider reported error',
        );
      }

      this.logger.log(
        {
          ...params.context,
          stage: 'response',
          flowId,
          sender,
          templateId: flowId,
          phone: this.maskPhone(mobiles),
          elapsedMs,
          httpStatus: response.status,
          requestId,
          providerStatus,
          failureReason,
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
          flowId,
          sender,
          dltTemplateId: this.dltTemplateId || null,
          templateId: flowId,
          variables: params.variables,
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

  private envPresence(key: string): boolean {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
  }

  private maskSecret(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '(empty)';
    if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****`;
    return `${trimmed.slice(0, 4)}********${trimmed.slice(-4)}`;
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
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

  private extractFailureReason(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const record = body as Record<string, unknown>;
    const candidates = [
      record['failureReason'],
      record['failure_reason'],
      record['error'],
      record['errors'],
      record['description'],
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === 'object') {
        return JSON.stringify(candidate);
      }
    }
    if (record['type'] === 'error' && typeof record['message'] === 'string') {
      return record['message'];
    }
    return null;
  }

  private maskPhone(phone: string): string {
    if (phone.length < 6) return '***';
    return `${phone.slice(0, 4)}****${phone.slice(-2)}`;
  }
}
