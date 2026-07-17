import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import {
  IUnicommerceCatalogProduct,
  IUnicommerceProductPushResponse,
} from '../interfaces/unicommerce-catalog.interface';

@Injectable()
export class UnicommerceProductApiService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('unicommerceProduct.endpoint') &&
      this.configService.get<string>('unicommerceProduct.clientId') &&
      this.configService.get<string>('unicommerceProduct.merchantId') &&
      this.configService.get<string>('unicommerceProduct.securityKey'),
    );
  }

  async postProduct(
    product: IUnicommerceCatalogProduct,
  ): Promise<IUnicommerceProductPushResponse> {
    const baseUrl = (
      this.configService.get<string>('unicommerceProduct.baseUrl') ??
      'https://genericproxy.unicommerce.com'
    ).replace(/\/+$/, '');
    const endpoint = this.configService.get<string>('unicommerceProduct.endpoint') ?? '';
    const clientId = this.configService.get<string>('unicommerceProduct.clientId') ?? '';
    const merchantId = this.configService.get<string>('unicommerceProduct.merchantId') ?? '';
    const securityKey = this.configService.get<string>('unicommerceProduct.securityKey') ?? '';
    const timeoutMs =
      this.configService.get<number>('unicommerceProduct.timeoutMs') ?? 15000;

    if (!endpoint || !clientId || !merchantId || !securityKey) {
      throw new ServiceUnavailableException(
        'UniCommerce product push endpoint or credentials are not configured',
      );
    }

    const response = await this.requestJson(
      `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`,
      JSON.stringify({ products: [product] }),
      { clientId, merchantId, securityKey, timeoutMs },
    );

    let data: IUnicommerceProductPushResponse = {};
    if (response.text) {
      try {
        data = JSON.parse(response.text) as IUnicommerceProductPushResponse;
      } catch {
        throw new ServiceUnavailableException(
          `UniCommerce product push returned invalid JSON (HTTP ${response.statusCode})`,
        );
      }
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new ServiceUnavailableException(
        data.message ??
          `UniCommerce product push failed with HTTP ${response.statusCode}`,
      );
    }

    return data;
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
        req.destroy(
          new Error(`UniCommerce product push timed out after ${auth.timeoutMs}ms`),
        );
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
