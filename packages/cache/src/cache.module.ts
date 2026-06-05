import { Logger, Module, DynamicModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheTtlService } from './cache-ttl.service';
import { RedisConnectionService } from './redis-connection.service';
import { CacheInvalidationService } from './cache-invalidation.service';
import { CacheStrategyService } from './cache-strategy.service';
import { RedisHealthService } from './health/redis-health.service';
import { buildRedisClientOptions } from './redis-options.util';
import { probeRedis } from './redis-probe.util';

@Module({})
export class AppCacheModule {
  private static readonly logger = new Logger(AppCacheModule.name);

  static forRoot(): DynamicModule {
    return {
      module: AppCacheModule,
      imports: [
        CacheModule.registerAsync({
          isGlobal: true,
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (config: ConfigService) => {
            const redisHost = config.get<string>('REDIS_HOST');
            const redisPort = config.get<number>('REDIS_PORT') ?? 6379;
            const defaultTtl = config.get<number>('CACHE_TTL') ?? 300;
            const password = config.get<string>('REDIS_PASSWORD') || undefined;
            const username = config.get<string>('REDIS_USERNAME') || undefined;
            const tls = config.get<string>('REDIS_TLS', 'false') === 'true';
            const connectTimeoutMs = config.get<number>('REDIS_CONNECT_TIMEOUT_MS') ?? 5000;

            if (!redisHost) {
              AppCacheModule.logger.warn(
                'REDIS_HOST is not set — using in-memory cache fallback.',
              );
              return { ttl: defaultTtl * 1000 };
            }

            const reachable = await probeRedis({
              host: redisHost,
              port: redisPort,
              password,
              username,
              tls,
              timeoutMs: connectTimeoutMs,
            });
            if (!reachable) {
              AppCacheModule.logger.warn(
                `Redis not reachable at ${redisHost}:${redisPort}. Using in-memory cache fallback. Start Redis: npm run redis:dev`,
              );
              return { ttl: defaultTtl * 1000 };
            }

            const { redisStore } = await import('cache-manager-ioredis-yet');
            AppCacheModule.logger.log(`Redis cache store configured at ${redisHost}:${redisPort}`);

            return {
              store: redisStore,
              ...buildRedisClientOptions({
                host: redisHost,
                port: redisPort,
                password,
                username,
                tls,
                connectTimeoutMs,
              }),
              ttl: defaultTtl * 1000,
            };
          },
        }),
      ],
      providers: [
        RedisConnectionService,
        CacheService,
        CacheTtlService,
        CacheInvalidationService,
        CacheStrategyService,
        RedisHealthService,
      ],
      exports: [
        CacheModule,
        RedisConnectionService,
        CacheService,
        CacheTtlService,
        CacheInvalidationService,
        CacheStrategyService,
        RedisHealthService,
      ],
      global: true,
    };
  }
}
