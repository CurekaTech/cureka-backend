import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  GokwikUpdateOrderRequest,
  GokwikUpdateOrderResponse,
} from '../dto/gokwik-update-order.dto';

/**
 * Outbound GoKwik API client (Cureka → GoKwik).
 * Auth headers: gk-app-id, gk-app-secret (per GoKwik Update Order docs).
 */
@Injectable()
export class GokwikApiService {
  private readonly logger = new Logger(GokwikApiService.name);
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly merchantId: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = (this.configService.get<string>('gokwik.baseUrl') ?? '').replace(/\/+$/, '');
    this.appId = this.configService.get<string>('gokwik.appId') ?? '';
    this.appSecret = this.configService.get<string>('gokwik.appSecret') ?? '';
    this.merchantId = this.configService.get<string>('gokwik.merchantId') ?? '';
    this.timeoutMs = this.configService.get<number>('gokwik.timeoutMs') ?? 15000;
  }

  /**
   * POST /v3/orders/update — notify GoKwik of order / AWB / refund updates.
   */
  async updateOrder(payload: GokwikUpdateOrderRequest): Promise<GokwikUpdateOrderResponse> {
    this.assertConfigured();

    if (!payload?.merchant_order_id?.trim()) {
      throw new HttpException('merchant_order_id is required', HttpStatus.BAD_REQUEST);
    }

    const body: GokwikUpdateOrderRequest = {
      merchant_order_id: payload.merchant_order_id.trim(),
      order_note: this.resolveOrderNote(payload),
      ...(payload.order_status !== undefined ? { order_status: payload.order_status } : {}),
      ...(payload.awb_number !== undefined ? { awb_number: payload.awb_number } : {}),
      ...(payload.awb_status !== undefined ? { awb_status: payload.awb_status } : {}),
      ...(payload.shipping_provider !== undefined
        ? { shipping_provider: payload.shipping_provider }
        : {}),
      ...(payload.refund_amount !== undefined ? { refund_amount: payload.refund_amount } : {}),
    };

    this.logger.log(
      {
        url: `${this.baseUrl}/v3/orders/update`,
        merchant_order_id: body.merchant_order_id,
        order_status: body.order_status,
        awb_number: body.awb_number,
        shipping_provider: body.shipping_provider,
        has_refund_amount: body.refund_amount !== undefined,
        payload: body,
      },
      'Calling GoKwik Update Order',
    );

    const response = await this.request<GokwikUpdateOrderResponse>('POST', '/v3/orders/update', body);

    if (response?.success === false) {
      const message = response.error ?? response.errors ?? 'GoKwik Update Order failed';
      this.logger.warn(
        {
          merchant_order_id: body.merchant_order_id,
          status_code: response.status_code,
          error: message,
          response,
        },
        'GoKwik Update Order returned success=false',
      );
      throw new BadGatewayException(message);
    }

    this.logger.log(
      {
        merchant_order_id: body.merchant_order_id,
        status_code: response?.status_code,
        success: response?.success,
        response,
      },
      'GoKwik Update Order succeeded',
    );

    return response;
  }

  /** POST /v3/orders/split */
  splitOrder<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', '/v3/orders/split', payload);
  }

  /** POST /v3/product/update-product-details */
  async syncProducts(payload: Record<string, unknown>): Promise<{
    success?: boolean;
    status_code?: number;
    error?: string;
    errors?: string;
  }> {
    const response = await this.request<{
      success?: boolean;
      status_code?: number;
      error?: string;
      errors?: string;
    }>('POST', '/v3/product/update-product-details', payload);

    if (response?.success === false) {
      const message = response.error ?? response.errors ?? 'GoKwik Sync Product failed';
      this.logger.warn(
        { path: '/v3/product/update-product-details', status_code: response.status_code, error: message },
        'GoKwik Sync Product returned success=false',
      );
      throw new BadGatewayException(message);
    }

    return response;
  }

  /** POST /v3/collection/update-collection */
  async syncCollections(payload: Record<string, unknown>): Promise<{
    success?: boolean;
    status_code?: number;
    error?: string;
    errors?: string;
  }> {
    const response = await this.request<{
      success?: boolean;
      status_code?: number;
      error?: string;
      errors?: string;
    }>('POST', '/v3/collection/update-collection', payload);

    if (response?.success === false) {
      const message = response.error ?? response.errors ?? 'GoKwik Sync Collection failed';
      this.logger.warn(
        {
          path: '/v3/collection/update-collection',
          status_code: response.status_code,
          error: message,
        },
        'GoKwik Sync Collection returned success=false',
      );
      throw new BadGatewayException(message);
    }

    return response;
  }

  /** GoKwik requires order_note on Update Order — never send an empty body field. */
  private resolveOrderNote(payload: GokwikUpdateOrderRequest): string {
    const orderId = payload.merchant_order_id.trim();
    let note = payload.order_note?.trim() ?? '';

    if (!note) {
      if (payload.order_status === 'Confirmed') note = 'Order confirmed';
      else if (payload.order_status === 'Cancelled') note = 'Order cancelled';
      else if (payload.order_status === 'Failed') note = 'Order failed';
      else if (payload.order_status === 'Pending') note = 'Order pending';
      else if (payload.awb_number) {
        note = payload.shipping_provider
          ? `Shipment updated via ${payload.shipping_provider}`
          : 'Shipment updated';
      } else if (payload.refund_amount != null) note = 'Refund initiated';
      else note = 'Order updated';
    }

    if (orderId && !note.includes(orderId)) {
      note = `${note} | order_id=${orderId}`;
    }
    return note;
  }

  private assertConfigured(): void {
    if (!this.baseUrl) {
      throw new ServiceUnavailableException('GoKwik API is not configured (missing GOKWIK_BASE_URL)');
    }
    if (!this.appId || !this.appSecret) {
      throw new ServiceUnavailableException(
        'GoKwik API is not configured (missing GOKWIK_APP_ID or GOKWIK_APP_SECRET)',
      );
    }
  }

  /** Auth headers attached to every outbound GoKwik request. */
  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'gk-app-id': this.appId,
      'gk-app-secret': this.appSecret,
    };
    if (this.merchantId) {
      headers['gk-merchant-id'] = this.merchantId;
    }
    return headers;
  }

  /**
   * Shared HTTP helper. Automatically merges GoKwik authentication headers
   * and throws Nest HTTP exceptions for non-2xx responses.
   */
  protected async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    this.assertConfigured();

    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    this.logger.debug({ method, url }, 'GoKwik outbound request');

    try {
      const response = await firstValueFrom(
        this.httpService.request<T>({
          ...config,
          method,
          url,
          data,
          timeout: config?.timeout ?? this.timeoutMs,
          headers: {
            ...this.buildAuthHeaders(),
            ...(config?.headers ?? {}),
          },
          validateStatus: (status) => status >= 200 && status < 300,
        }),
      );

      return response.data;
    } catch (error) {
      throw this.toHttpException(error, method, path);
    }
  }

  private toHttpException(error: unknown, method: string, path: string): HttpException {
    if (error instanceof HttpException) {
      return error;
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status ?? HttpStatus.BAD_GATEWAY;
      const data = error.response?.data as
        | { error?: string; errors?: string; message?: string; status_code?: number }
        | undefined;
      const message =
        data?.error ??
        data?.errors ??
        data?.message ??
        error.message ??
        `GoKwik ${method} ${path} failed`;

      this.logger.error(
        {
          method,
          path,
          status,
          message,
          response: data,
        },
        'GoKwik API request failed',
      );

      if (status >= 400 && status < 500) {
        return new HttpException(message, status);
      }

      return new BadGatewayException(message);
    }

    const message = error instanceof Error ? error.message : 'GoKwik API request failed';
    this.logger.error({ method, path, message }, 'GoKwik API unexpected error');
    return new BadGatewayException(message);
  }
}
