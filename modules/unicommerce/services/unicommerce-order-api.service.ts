import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  IUnicommerceOAuthTokenResponse,
  IUnicommerceSaleOrderPayload,
  IUnicommerceCreateSaleOrderResponse,
} from '../interfaces/unicommerce-order.interface';

/**
 * HTTP client for Unicommerce's official tenant API.
 *
 * Authentication: OAuth 2.0 password grant (GET /oauth/token).
 * Order creation: POST /services/rest/v1/oms/saleOrder/create
 *   - Header Authorization: bearer {access_token}
 *   - Header Facility: {facilityCode}
 *
 * Tenant URL: https://{tenant}.unicommerce.com
 */
@Injectable()
export class UnicommerceOrderApiService {
  private readonly logger = new Logger(UnicommerceOrderApiService.name);

  /** In-memory token cache. Cleared on 401 so the next call re-authenticates. */
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('unicommerceOrder.tenant') &&
      this.configService.get<string>('unicommerceOrder.username') &&
      this.configService.get<string>('unicommerceOrder.password'),
    );
  }

  private getBaseUrl(): string {
    const tenant = this.configService.get<string>('unicommerceOrder.tenant') ?? 'stgcureka';
    return `https://${tenant}.unicommerce.com`;
  }

  /** Fetches or returns a cached OAuth access token. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token with a 60-second safety buffer before expiry.
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const baseUrl = this.getBaseUrl();
    const username = this.configService.get<string>('unicommerceOrder.username') ?? '';
    const password = this.configService.get<string>('unicommerceOrder.password') ?? '';
    const timeoutMs = this.configService.get<number>('unicommerceOrder.timeoutMs') ?? 15_000;

    const tokenUrl =
      `${baseUrl}/oauth/token` +
      `?grant_type=password` +
      `&client_id=my-trusted-client` +
      `&username=${encodeURIComponent(username)}` +
      `&password=${encodeURIComponent(password)}`;

    this.logger.log({ baseUrl, username }, 'Fetching Unicommerce OAuth token');

    const { statusCode, text } = await this.httpRequest(tokenUrl, null, {}, timeoutMs);

    if (statusCode < 200 || statusCode >= 300) {
      this.logger.error(
        { statusCode, rawBody: text.slice(0, 300) },
        'Unicommerce OAuth token request failed',
      );
      throw new ServiceUnavailableException(
        `Unicommerce OAuth token request failed with HTTP ${statusCode}`,
      );
    }

    let tokenData: IUnicommerceOAuthTokenResponse;
    try {
      tokenData = JSON.parse(text) as IUnicommerceOAuthTokenResponse;
    } catch {
      throw new ServiceUnavailableException('Unicommerce OAuth returned invalid JSON');
    }

    if (!tokenData.access_token) {
      throw new ServiceUnavailableException('Unicommerce OAuth response missing access_token');
    }

    const expiresIn = tokenData.expires_in ?? 3600;
    this.cachedToken = {
      token: tokenData.access_token,
      expiresAt: now + expiresIn * 1000,
    };

    this.logger.log(
      { expiresIn, tokenPrefix: tokenData.access_token.slice(0, 8) },
      'Unicommerce OAuth token acquired',
    );

    return tokenData.access_token;
  }

  async createSaleOrder(
    payload: IUnicommerceSaleOrderPayload,
  ): Promise<IUnicommerceCreateSaleOrderResponse> {
    const baseUrl = this.getBaseUrl();
    const facilityCode = this.configService.get<string>('unicommerceOrder.facilityCode') ?? '';
    const timeoutMs = this.configService.get<number>('unicommerceOrder.timeoutMs') ?? 15_000;

    const accessToken = await this.getAccessToken();

    const url = `${baseUrl}/services/rest/v1/oms/saleOrder/create`;
    const body = JSON.stringify(payload);
    const orderCode = payload.saleOrder.code;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `bearer ${accessToken}`,
    };
    if (facilityCode) {
      headers['Facility'] = facilityCode;
    }

    this.logger.log(
      { url, orderCode, facilityCode, channel: payload.saleOrder.channel },
      'Unicommerce createSaleOrder request',
    );

    const { statusCode, text } = await this.httpRequest(url, body, headers, timeoutMs);

    // A 401 means the cached token is stale — clear it so the next attempt re-authenticates.
    if (statusCode === 401) {
      this.cachedToken = null;
      throw new ServiceUnavailableException(
        'Unicommerce authentication failed (401); token cleared for retry',
      );
    }

    let data: IUnicommerceCreateSaleOrderResponse = { successful: false };
    if (text) {
      try {
        data = JSON.parse(text) as IUnicommerceCreateSaleOrderResponse;
      } catch {
        this.logger.error(
          { url, orderCode, httpStatus: statusCode, rawBody: text.slice(0, 500) },
          'Unicommerce createSaleOrder returned non-JSON response',
        );
        throw new ServiceUnavailableException(
          `Unicommerce createSaleOrder returned invalid JSON (HTTP ${statusCode})`,
        );
      }
    }

    this.logger.log(
      {
        url,
        orderCode,
        httpStatus: statusCode,
        successful: data.successful,
        message: data.message,
        errors: data.errors,
      },
      'Unicommerce createSaleOrder response',
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
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Unicommerce request timed out after ${timeoutMs}ms`));
      });
      req.on('error', reject);
      if (body !== null) req.write(body);
      req.end();
    });
  }
}
