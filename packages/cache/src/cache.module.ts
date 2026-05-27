import { Module, DynamicModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({})
export class AppCacheModule {
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

            if (!redisHost) {
              // In-memory cache fallback for development without Redis
              return { ttl: 300 };
            }

            const { redisStore } = await import('cache-manager-ioredis-yet');
            return {
              store: redisStore,
              host: redisHost,
              port: config.get<number>('REDIS_PORT') ?? 6379,
              password: config.get<string>('REDIS_PASSWORD'),
              ttl: config.get<number>('CACHE_TTL') ?? 300,
            };
          },
        }),
      ],
      exports: [CacheModule],
      global: true,
    };
  }
}
