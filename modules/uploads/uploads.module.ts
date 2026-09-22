import { Module } from '@nestjs/common';
import { StorageModule } from '@packages/storage';
import { UploadsController } from './controllers/uploads.controller';
import { UploadsService } from './services/uploads.service';
import { MultipartFormService } from './services/multipart-form.service';
import { StorageUrlEnricher } from './services/storage-url.enricher';
import { PublicMediaService } from './services/public-media.service';

@Module({
  imports: [StorageModule.forRoot()],
  controllers: [UploadsController],
  providers: [UploadsService, MultipartFormService, StorageUrlEnricher, PublicMediaService],
  exports: [
    UploadsService,
    MultipartFormService,
    StorageUrlEnricher,
    PublicMediaService,
    StorageModule,
  ],
})
export class UploadsModule {}
