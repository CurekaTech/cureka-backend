import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sanitizeHeadersForLog } from '@packages/logger';
import { normalizeMobileNumber } from '@modules/auth/utils/mobile-number.util';
import {
  IMsg91FlowSendPayload,
  IMsg91FlowSendResult,
} from '../interfaces/msg91-sms.interface';
import {
  checkDltVariableLengths,
  renderMsg91TemplatePreview,
} from '../utils/msg91-dlt.util';

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
  private readonly peId: string;
  private readonly passSenderInFlow: boolean;
  private readonly orderThankYouTemplateText: string;
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
    this.peId = this.configService.get<string>('msg91.peId') ?? '';
    this.passSenderInFlow = this.configService.get<boolean>('msg91.passSenderInFlow') ?? false;
    this.orderThankYouTemplateText =
      this.configService.get<string>('msg91.orderThankYouTemplateText') ?? '';
    this.otpTemplateId = this.configService.get<string>('msg91.otpTemplateId') ?? '';
    this.orderThankYouTemplateId =
      this.configService.get<string>('msg91.orderThankYouTemplateId') ?? '';

    this.logger.log(
      {
        MSG91_ENABLED: this.envPresence('MSG91_ENABLED'),
        MSG91_ENABLED_true: this.enabled,
        MSG91_AUTH_KEY: this.maskSecret(process.env['MSG91_AUTH_KEY'] ?? ''),
        otpTemplateId: this.otpTemplateId,
        orderThankYouTemplateId: this.orderThankYouTemplateId,
        dltTemplateId: this.dltTemplateId || null,
        peId: this.peId || null,
        senderId: this.senderId,
        passSenderInFlow: this.passSenderInFlow,
        orderThankYouTemplateText: this.orderThankYouTemplateText,
        baseUrl: this.baseUrl,
        readyToSend: this.isConfigured(),
        configSource: 'apps/api/config/msg91.constants.ts (static) + MSG91_ENABLED/MSG91_AUTH_KEY (env)',
        dltNote:
          'DLT_TE_ID + PE_ID + exact template text must match on MSG91 Flow panel; Flow API does not send DLT_TE_ID in body',
      },
      '[MSG91-SMS] Startup config check',
    );
  }

  isConfigured(): boolean {
    if (!this.enabled || !this.authKey || !this.baseUrl) {
      return false;
    }
    if (this.passSenderInFlow && !this.senderId) {
      return false;
    }
    return true;
  }

  getSenderId(): string {
    return this.senderId;
  }

  getPeId(): string {
    return this.peId;
  }

  shouldPassSenderInFlow(): boolean {
    return this.passSenderInFlow;
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
    /** Optional template text for local log preview only (never sent to MSG91). */
    templateTextPreview?: string;
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
    const dltVariableChecks = checkDltVariableLengths(params.variables);
    const previewText = params.templateTextPreview?.trim() || this.orderThankYouTemplateText;
    const renderedSmsPreview = previewText
      ? renderMsg91TemplatePreview(previewText, params.variables)
      : null;
    const oversizedVars = dltVariableChecks.filter((check) => !check.withinLimit);

    if (!this.peId && this.dltTemplateId) {
      this.logger.error(
        {
          dltTemplateId: this.dltTemplateId,
          flowId: this.orderThankYouTemplateId,
          senderId: this.senderId,
          action:
            'Set MSG91_STATIC.peId in msg91.constants.ts AND map PE ID + DLT template on MSG91 Flow panel',
        },
        '[MSG91-SMS] DLT risk — PE ID is not configured (DLT delivery may fail with "Template not matched")',
      );
    }

    if (this.passSenderInFlow && !sender) {
      this.logger.error(
        { ...params.context, reason: 'empty_sender_id', envKey: 'MSG91_SENDER_ID' },
        '[MSG91-SMS] Rejected — MSG91_SENDER_ID is empty but MSG91_PASS_SENDER_IN_FLOW=true',
      );
      throw new ServiceUnavailableException('MSG91_SENDER_ID is not configured');
    }

    if (oversizedVars.length) {
      this.logger.error(
        {
          ...params.context,
          reason: 'dlt_variable_too_long',
          oversizedVars,
          dltMaxPerVariable: 40,
        },
        '[MSG91-SMS] Rejected — DLT variable exceeds 40 characters',
      );
      throw new ServiceUnavailableException(
        'MSG91 template variable exceeds DLT 40-character limit',
      );
    }

    const payload: IMsg91FlowSendPayload = {
      flow_id: flowId,
      template_id: flowId,
      short_url: this.shortUrl,
      realTimeResponse: '1',
      recipients: [
        {
          mobiles,
          ...params.variables,
        },
      ],
    };

    if (this.passSenderInFlow && sender) {
      payload.sender = sender;
    }

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
      {
        ...params.context,
        stage: 'request',
        url,
        method,
        flowId,
        senderInPayload: payload.sender ?? null,
        senderEnv: sender || null,
        passSenderInFlow: this.passSenderInFlow,
        dltTemplateId: this.dltTemplateId || null,
        peId: this.peId || null,
        renderedSmsPreview,
        dltVariableChecks,
        phoneMasked: this.maskPhone(mobiles),
        variables: params.variables,
        shortUrl: this.shortUrl,
        headersLogged: {
          accept: headers.accept,
          'content-type': headers['content-type'],
          authkey: this.maskSecret(headers.authkey),
        },
        payload: this.payloadForLog(payload),
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
            phoneMasked: this.maskPhone(mobiles),
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
          senderInPayload: payload.sender ?? null,
          senderEnv: sender || null,
          passSenderInFlow: this.passSenderInFlow,
          dltTemplateId: this.dltTemplateId || null,
          peId: this.peId || null,
          renderedSmsPreview,
          requestId,
          providerStatus,
          elapsedMs,
          responseHeaders,
          dltDeliveryNote:
            'HTTP success only means MSG91 queued the SMS. Check MSG91 Logs for this requestId — if DLT says "Template not matched", fix Flow 66ab3a0ad6fc0541637a4a34 mapping on MSG91 panel (DLT ID 1207163584541815417, sender CUREKA, PE ID, exact template text, status Verified by DLT).',
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
          phoneMasked: this.maskPhone(mobiles),
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

  private payloadForLog(payload: IMsg91FlowSendPayload): Record<string, unknown> {
    return {
      flow_id: payload.flow_id,
      template_id: payload.template_id,
      short_url: payload.short_url,
      realTimeResponse: payload.realTimeResponse,
      sender: payload.sender,
      recipients: payload.recipients.map((recipient) => {
        const { mobiles: _mobiles, ...variables } = recipient;
        return {
          phoneMasked: this.maskPhone(recipient.mobiles),
          ...variables,
        };
      }),
    };
  }

  private headersToRecord(headers: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return sanitizeHeadersForLog(out);
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
