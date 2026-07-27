import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  IUnicommerceCreateItemTypesPayload,
  IUnicommerceCreateItemTypesResponse,
  IUnicommerceCreateChannelItemPayload,
  IUnicommerceCreateChannelItemResponse,
} from '../interfaces/unicommerce-catalog.interface';
import { IUnicommerceOAuthTokenResponse } from '../interfaces/unicommerce-order.interface';

/**
 * HTTP client for Unicommerce's official tenant product APIs.
 *
 * Auth:    OAuth 2.0 password grant  GET /oauth/token
 * Catalog: POST /services/rest/v1/catalog/itemTypes/createOrEdit
 * Channel: POST /services/rest/v1/catalog/channel/itemType/createOrEdit
 *
 * Tenant URL: https://{tenant}.unicommerce.com
 */
@Injectable()
export class UnicommerceProductApiService {
  private readonly logger = new Logger(UnicommerceProductApiService.name);

  /** Shared in-memory token cache. Cleared on 401 to force re-auth. */
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('unicommerceProduct.tenant') &&
        this.configService.get<string>('unicommerceProduct.username') &&
        this.configService.get<string>('unicommerceProduct.password'),
    );
  }

  private getBaseUrl(): string {
    const tenant = this.configService.get<string>('unicommerceProduct.tenant') ?? 'stgcureka';
    return `https://${tenant}.unicommerce.com`;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const baseUrl = this.getBaseUrl();
    const username = this.configService.get<string>('unicommerceProduct.username') ?? '';
    const password = this.configService.get<string>('unicommerceProduct.password') ?? '';
    const timeoutMs = this.configService.get<number>('unicommerceProduct.timeoutMs') ?? 15_000;

    const tokenUrl =
      `${baseUrl}/oauth/token` +
      `?grant_type=password` +
      `&client_id=my-trusted-client` +
      `&username=${encodeURIComponent(username)}` +
      `&password=${encodeURIComponent(password)}`;

    this.logger.log({ baseUrl, username }, 'Fetching Unicommerce OAuth token (product)');

    const { statusCode, text } = await this.httpRequest(tokenUrl, null, {}, timeoutMs);

    if (statusCode < 200 || statusCode >= 300) {
      this.logger.error(
        { statusCode, rawBody: text.slice(0, 300) },
        'Unicommerce OAuth token request failed (product)',
      );
      throw new ServiceUnavailableException(
        `Unicommerce OAuth token request failed with HTTP ${statusCode}`,
      );
    }

    let tokenData: IUnicommerceOAuthTokenResponse;
    try {
      tokenData = JSON.parse(text) as IUnicommerceOAuthTokenResponse;
    } catch {
      throw new ServiceUnavailableException('Unicommerce OAuth returned invalid JSON (product)');
    }

    if (!tokenData.access_token) {
      throw new ServiceUnavailableException(
        'Unicommerce OAuth response missing access_token (product)',
      );
    }

    const expiresIn = tokenData.expires_in ?? 3600;
    this.cachedToken = { token: tokenData.access_token, expiresAt: now + expiresIn * 1000 };

    this.logger.log(
      { expiresIn, tokenPrefix: tokenData.access_token.slice(0, 8) },
      'Unicommerce OAuth token acquired (product)',
    );

    return tokenData.access_token;
  }

  /**
   * Creates or updates multiple catalog item types in bulk.
   * POST /services/rest/v1/catalog/itemTypes/createOrEdit
   */
  async createOrUpdateItemTypes(
    payload: IUnicommerceCreateItemTypesPayload,
  ): Promise<IUnicommerceCreateItemTypesResponse> {
    const accessToken = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/services/rest/v1/catalog/itemTypes/createOrEdit`;
    const timeoutMs = this.configService.get<number>('unicommerceProduct.timeoutMs') ?? 15_000;

    const skus = payload.itemTypes.map((i) => i.skuCode);
    this.logger.log({ url, skuCount: skus.length, skus }, 'Unicommerce createOrUpdateItemTypes request');

    const { statusCode, text } = await this.httpRequest(
      url,
      JSON.stringify(payload),
      { 'Content-Type': 'application/json', Authorization: `bearer ${accessToken}` },
      timeoutMs,
    );

    if (statusCode === 401) {
      this.cachedToken = null;
      throw new ServiceUnavailableException('Unicommerce auth failed (401) during itemTypes push; token cleared');
    }

    return this.parseJsonResponse<IUnicommerceCreateItemTypesResponse>(
      text,
      statusCode,
      url,
      'createOrUpdateItemTypes',
    );
  }

  /**
   * Maps a catalog SKU to a channel (CUSTOM).
   * POST /services/rest/v1/channel/createChannelItem
   */
  async createChannelItem(
    payload: IUnicommerceCreateChannelItemPayload,
  ): Promise<IUnicommerceCreateChannelItemResponse> {
    const accessToken = await this.getAccessToken();
    const url = `${this.getBaseUrl()}/services/rest/v1/channel/createChannelItem`;
    const timeoutMs = this.configService.get<number>('unicommerceProduct.timeoutMs') ?? 15_000;

    const { skuCode, channelCode } = payload.channelItemType;
    this.logger.log(
      { url, skuCode, channelCode },
      'Unicommerce createChannelItem request',
    );

    const { statusCode, text } = await this.httpRequest(
      url,
      JSON.stringify(payload),
      { 'Content-Type': 'application/json', Authorization: `bearer ${accessToken}` },
      timeoutMs,
    );

    if (statusCode === 401) {
      this.cachedToken = null;
      throw new ServiceUnavailableException('Unicommerce auth failed (401) during channel item creation; token cleared');
    }

    return this.parseJsonResponse<IUnicommerceCreateChannelItemResponse>(
      text,
      statusCode,
      url,
      'createChannelItem',
    );
  }

  private parseJsonResponse<T extends { successful?: boolean; message?: string }>(
    text: string,
    statusCode: number,
    url: string,
    operation: string,
  ): T {
    let data: T = { successful: false } as T;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        this.logger.error(
          { url, operation, httpStatus: statusCode, rawBody: text.slice(0, 500) },
          'Unicommerce returned non-JSON response',
        );
        throw new ServiceUnavailableException(
          `Unicommerce ${operation} returned invalid JSON (HTTP ${statusCode})`,
        );
      }
    }

    this.logger.log(
      { url, operation, httpStatus: statusCode, successful: data.successful, message: data.message },
      `Unicommerce ${operation} response`,
    );

    return data;
  }

  private httpRequest(
    urlString: string,
    body: string | null,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ statusCode: number; text: string }> {
    const url = new URL(urlString);
    const transport = url.protocol === 'http:' ? http : https;
    const method = body !== null ? 'POST' : 'GET';

    const allHeaders: Record<string, string | number> = { ...headers };
    if (body !== null) {
      allHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method,
          headers: allHeaders,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({ statusCode: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }),
          );
        },
      );

      req.setTimeout(timeoutMs, () =>
        req.destroy(new Error(`Unicommerce request timed out after ${timeoutMs}ms`)),
      );
      req.on('error', reject);
      if (body !== null) req.write(body);
      req.end();
    });
  }
}
