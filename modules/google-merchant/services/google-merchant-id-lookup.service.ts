import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface LookupFile {
  byExternalProductId?: Record<string, string>;
  stats?: Record<string, number>;
}

@Injectable()
export class GoogleMerchantIdLookupService implements OnModuleInit {
  private readonly logger = new Logger(GoogleMerchantIdLookupService.name);
  private map = new Map<string, string>();

  onModuleInit(): void {
    this.reload();
  }

  reload(): void {
    const candidates = [
      path.resolve(process.cwd(), 'modules/google-merchant/data/google-merchant-id-lookup.json'),
      path.resolve(__dirname, '../data/google-merchant-id-lookup.json'),
    ];

    const filePath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      this.logger.warn(
        'google-merchant-id-lookup.json not found — all g:id values will be generated',
      );
      this.map = new Map();
      return;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as LookupFile;
    const entries = parsed.byExternalProductId ?? {};
    this.map = new Map(Object.entries(entries));
    this.logger.log(
      `Loaded Google Merchant id lookup (${this.map.size} ids) from ${filePath}`,
    );
  }

  getMap(): Map<string, string> {
    return this.map;
  }

  resolveSheetId(externalProductId: string | null | undefined): string | null {
    const key = externalProductId?.trim();
    if (!key) return null;
    return this.map.get(key) ?? null;
  }
}
