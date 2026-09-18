import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, storageConfig, envValidationSchema } from '../../config';
import { LoggerModule } from '@packages/logger';
import { StorageModule } from '@packages/storage';

/**
 * Minimal Nest context for product:harvest-images (Config + Storage only).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, storageConfig],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
      cache: true,
    }),
    LoggerModule,
    StorageModule.forRoot(),
  ],
})
export class ProductImageHarvestCommandModule {}
