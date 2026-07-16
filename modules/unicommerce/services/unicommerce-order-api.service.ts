import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  IUnicommercePostOrderPayload,
  IUnicommercePostOrderResponse,
} from '../interfaces/unicommerce-order.interface';

/**
 * Thin HTTP client for UniCommerce's outbound "Post Orders" API.
 *   POST {baseUrl}{endpoint}
 * Auth via static headers (ClientId / merchantId / securitykey) — casing matches UniCommerce Postman docs.
 * Uses Node http(s) instead of fetch so header names are not forced to lowercase.
 */
@Injectable()
export class UnicommerceOrderApiService {
  private readonly logger = new Logger(UnicommerceOrderApiService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('unicommerceOrder.clientId') &&
      this.configService.get<string>('unicommerceOrder.merchantId') &&
      this.configService.get<string>('unicommerceOrder.securityKey'),
    );
  }

  async postOrder(payload: IUnicommercePostOrderPayload): Promise<IUnicommercePostOrderResponse> {
    const baseUrl = (
      this.configService.get<string>('unicommerceOrder.baseUrl') ??
      'https://genericproxy.unicommerce.com'
    ).replace(/\/+$/, '');
    const endpoint = this.configService.get<string>('unicommerceOrder.endpoint') ?? '/uc/v1/order';
    const clientId = this.configService.get<string>('unicommerceOrder.clientId') ?? '';
    const merchantId = this.configService.get<string>('unicommerceOrder.merchantId') ?? '';
    const securityKey = this.configService.get<string>('unicommerceOrder.securityKey') ?? '';
    const timeoutMs = this.configService.get<number>('unicommerceOrder.timeoutMs') ?? 15000;

    if (!clientId || !merchantId || !securityKey) {
      throw new ServiceUnavailableException(
        'UniCommerce Post Orders credentials are not configured',
      );
    }

    const url = `${baseUrl}${endpoint}`;
    const body = JSON.stringify(payload);

    this.logger.log(
      {
        url,
        orderId: payload.id,
        clientId,
        merchantId,
        clientIdLen: clientId.length,
        merchantIdLen: merchantId.length,
        securityKeyLen: securityKey.length,
        securityKeyPrefix: securityKey.slice(0, 8),
      },
      'UniCommerce Post Orders request',
    );

    try {
      const { statusCode, text } = await this.requestJson(url, body, {
        clientId,
        merchantId,
        securityKey,
        timeoutMs,
      });

      let data: IUnicommercePostOrderResponse = {};
      if (text) {
        try {
          data = JSON.parse(text) as IUnicommercePostOrderResponse;
        } catch {
          this.logger.error(
            { url, orderId: payload.id, httpStatus: statusCode, rawBody: text.slice(0, 500) },
            'UniCommerce Post Orders returned non-JSON response',
          );
          throw new ServiceUnavailableException(
            `UniCommerce Post Orders returned invalid JSON (HTTP ${statusCode})`,
          );
        }
      }

      this.logger.log(
        {
          url,
          orderId: payload.id,
          httpStatus: statusCode,
          responseStatus: data.status,
          responseMessage: data.message,
        },
        'UniCommerce Post Orders response',
      );

      if (statusCode < 200 || statusCode >= 300) {
        const message =
          data.message ?? `UniCommerce Post Orders failed with HTTP ${statusCode}`;
        this.logger.warn(
          { url, orderId: payload.id, httpStatus: statusCode, responseMessage: message },
          'UniCommerce Post Orders HTTP error',
        );
        throw new ServiceUnavailableException(message);
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        { orderId: payload.id, error: message },
        'UniCommerce Post Orders request failed (network/timeout)',
      );
      throw new ServiceUnavailableException('UniCommerce Post Orders API is unavailable');
    }
  }

  private requestJson(
    urlString: string,
    body: string,
    auth: {
      clientId: string;
      merchantId: string;
      securityKey: string;
      timeoutMs: number;
    },
  ): Promise<{ statusCode: number; text: string }> {
    const url = new URL(urlString);
    const transport = url.protocol === 'http:' ? http : https;

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            // Exact casing from UniCommerce Postman collection (case-sensitive gateway).
            ClientId: auth.clientId,
            merchantId: auth.merchantId,
            securitykey: auth.securityKey,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      req.setTimeout(auth.timeoutMs, () => {
        req.destroy(new Error(`UniCommerce Post Orders timed out after ${auth.timeoutMs}ms`));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
