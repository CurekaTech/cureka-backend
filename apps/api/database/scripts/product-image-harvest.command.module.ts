import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { LoggerOptions } from 'typeorm';
import {
  appConfig,
  databaseConfig,
  storageConfig,
  envValidationSchema,
} from '../../config';
import { LoggerModule } from '@packages/logger';
import { StorageModule } from '@packages/storage';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';

/**
 * Minimal Nest context for product:harvest-images.
 * DB is used only to exclude sheet IDs already present as external_product_id.
 * No HTTP server, BullMQ, GoKwik, BOB, Unicommerce, SMS, Typesense, or abandoned-cart.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, storageConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
      cache: true,
    }),
    LoggerModule,
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('database.url');
        if (!url) {
          throw new Error('DATABASE_URL is not configured');
        }
        return {
          type: 'postgres' as const,
          url,
          entities: [
            join(
              __dirname,
              '..',
              '..',
              '..',
              '..',
              'modules',
              '**',
              'entities',
              '*.entity.{ts,js}',
            ),
          ],
          synchronize: false,
          logging: configService.get<LoggerOptions>('database.logging') ?? ['error'],
          ssl:
            configService.get<string>('app.nodeEnv') === 'production'
              ? { rejectUnauthorized: false }
              : false,
          extra: {
            statement_timeout: 30_000,
            query_timeout: 30_000,
          },
          poolSize: 5,
          connectTimeoutMS: 10_000,
        };
      },
    }),
    StorageModule.forRoot(),
    TypeOrmModule.forFeature([ProductEntity, ProductVariantEntity]),
  ],
})
export class ProductImageHarvestCommandModule {}
