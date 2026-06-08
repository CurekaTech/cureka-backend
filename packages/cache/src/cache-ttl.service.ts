import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheModuleName } from './enums/cache-module.enum';

@Injectable()
export class CacheTtlService {
  constructor(private readonly configService: ConfigService) {}

  /** Returns the shared cache TTL in seconds. Module is kept for logging/metadata only. */
  forModule(_module: CacheModuleName = CacheModuleName.DEFAULT): number {
    return this.configService.get<number>('CACHE_TTL', 300);
  }
}
