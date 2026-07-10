import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IUnicommercePostOrderPayload,
  IUnicommercePostOrderResponse,
} from '../interfaces/unicommerce-order.interface';

/**
 * Thin HTTP client for UniCommerce's outbound "Post Orders" API.
 *   POST {baseUrl}{endpoint}
 * Auth via static headers (clientid / merchantid / securitykey) issued by UniCommerce.
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    this.logger.log({ url, orderId: payload.id }, 'UniCommerce Post Orders request');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          clientid: clientId,
          merchantid: merchantId,
          securitykey: securityKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const text = await response.text();
      const data: IUnicommercePostOrderResponse = text ? JSON.parse(text) : {};

      this.logger.log(
        { url, orderId: payload.id, status: response.status, body: data },
        'UniCommerce Post Orders response',
      );

      if (!response.ok) {
        const message =
          data.message ?? `UniCommerce Post Orders failed with HTTP ${response.status}`;
        throw new ServiceUnavailableException(message);
      }

      return data;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`UniCommerce Post Orders request failed: ${message}`);
      throw new ServiceUnavailableException('UniCommerce Post Orders API is unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
