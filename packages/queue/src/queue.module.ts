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
          useFactory: (config: ConfigService) => ({
            connection: {
              host: config.get<string>('REDIS_HOST') ?? 'localhost',
              port: config.get<number>('REDIS_PORT') ?? 6379,
              password: config.get<string>('REDIS_PASSWORD'),
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 200,
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            },
          }),
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
