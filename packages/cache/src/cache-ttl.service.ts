import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheModuleName } from './enums/cache-module.enum';

@Injectable()
export class CacheTtlService {
  private readonly moduleEnvMap: Record<CacheModuleName, string> = {
    [CacheModuleName.DEFAULT]: 'CACHE_TTL',
    [CacheModuleName.ATTRIBUTE]: 'ATTRIBUTE_CACHE_TTL',
    [CacheModuleName.BRAND]: 'BRAND_CACHE_TTL',
    [CacheModuleName.CATEGORY]: 'CATEGORY_CACHE_TTL',
    [CacheModuleName.PRODUCT]: 'PRODUCT_CACHE_TTL',
    [CacheModuleName.HOMEPAGE]: 'HOMEPAGE_CACHE_TTL',
    [CacheModuleName.OTP]: 'OTP_RESEND_COOLDOWN_SECONDS',
  };

  constructor(private readonly configService: ConfigService) {}

  forModule(module: CacheModuleName = CacheModuleName.DEFAULT): number {
    const envKey = this.moduleEnvMap[module];
    const fallback = this.configService.get<number>('CACHE_TTL', 300);
    return this.configService.get<number>(envKey, fallback);
  }
}
