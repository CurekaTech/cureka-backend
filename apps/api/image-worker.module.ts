import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  storageConfig,
  sitemapConfig,
  imagePipelineConfig,
  envValidationSchema,
} from './config';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from '@packages/logger';
import { QueueModule } from '@packages/queue';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { ImagePipelineModule } from '@modules/image-pipeline/image-pipeline.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        storageConfig,
        sitemapConfig,
        imagePipelineConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
      cache: true,
    }),
    LoggerModule,
    QueueModule.forRoot(),
    DatabaseModule,
    UploadsModule,
    ImagePipelineModule,
  ],
})
export class ImageWorkerModule {}
