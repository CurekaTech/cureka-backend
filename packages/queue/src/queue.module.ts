import { Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export interface QueueModuleOptions {
  queues: string[];
}

@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const redisPort = Number(config.get<string | number>('REDIS_PORT') ?? 6379);
            const redisUsername = config.get<string>('REDIS_USERNAME') || undefined;
            const redisPassword = config.get<string>('REDIS_PASSWORD') || undefined;
            const redisTlsEnabled = config.get<string>('REDIS_TLS') === 'true';

            return {
              connection: {
                host: config.get<string>('REDIS_HOST') ?? 'localhost',
                port: Number.isFinite(redisPort) ? redisPort : 6379,
                username: redisUsername,
                password: redisPassword,
                tls: redisTlsEnabled ? {} : undefined,
              },
              defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 200,
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              },
            };
          },
        }),
      ],
      exports: [BullModule],
      global: true,
    };
  }

  static registerQueue(...names: string[]): DynamicModule {
    return BullModule.registerQueue(...names.map((name) => ({ name })));
  }
}
