import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MAX_ITEMS = 32;
const MAX_LENGTH = 256;

export interface StorefrontRevalidateInput {
  tags?: string[];
  paths?: string[];
}

@Injectable()
export class StorefrontRevalidateService {
  private readonly logger = new Logger(StorefrontRevalidateService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * POST /api/revalidate on the storefront after an admin commit.
   * A failed purge is logged and never thrown.
   */
  async purge(input: StorefrontRevalidateInput): Promise<void> {
    const secret = this.configService.get<string>('REVALIDATE_SECRET')?.trim();
    if (!secret) {
      this.logger.warn('Skipping storefront revalidate: REVALIDATE_SECRET is not set');
      return;
    }

    const storefrontUrl = this.configService.get<string>('STOREFRONT_URL')?.trim().replace(/\/+$/, '');
    if (!storefrontUrl) {
      this.logger.warn('Skipping storefront revalidate: STOREFRONT_URL is not set');
      return;
    }

    const body = {
      tags: clampItems(input.tags ?? []),
      paths: clampItems(input.paths ?? []).filter((path) => path.startsWith('/')),
    };
    if (body.tags.length === 0 && body.paths.length === 0) return;

    try {
      const response = await fetch(`${storefrontUrl}/api/revalidate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': secret,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      this.logger.log(
        `Storefront revalidate status=${response.status} tags=${body.tags.join(',')} paths=${body.paths.join(',')} body=${text.slice(0, 500)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Storefront revalidate failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

const clampItems = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value || value.length > MAX_LENGTH || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= MAX_ITEMS) break;
  }
  return result;
};
