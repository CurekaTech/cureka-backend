import { Module } from '@nestjs/common';
import { StorageModule } from '@packages/storage';
import { UploadsController } from './controllers/uploads.controller';
import { UploadsService } from './services/uploads.service';
import { MultipartFormService } from './services/multipart-form.service';

@Module({
  imports: [StorageModule.forRoot()],
  controllers: [UploadsController],
  providers: [UploadsService, MultipartFormService],
  exports: [UploadsService, MultipartFormService, StorageModule],
})
export class UploadsModule {}
