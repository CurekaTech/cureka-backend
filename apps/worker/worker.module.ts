import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from 'nestjs-pino';
import { appConfig, databaseConfig, shipwayConfig, storageConfig, unicommerceOrderConfig } from '../api/config';
import { DatabaseModule } from '@database/database.module';
import { ProductModule } from '@modules/product/product.module';
import { QueueModule } from '@packages/queue';
import { ShippingWorkerModule } from '@modules/shipping/shipping-worker.module';
import { UnicommerceOrderWorkerModule } from '@modules/unicommerce/unicommerce-order-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, storageConfig, shipwayConfig, unicommerceOrderConfig],
      envFilePath: '.env',
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
      },
    }),
    DatabaseModule,
    QueueModule.forRoot(),
    ProductModule,
    ShippingWorkerModule,
    UnicommerceOrderWorkerModule,
  ],
})
export class WorkerModule {}
