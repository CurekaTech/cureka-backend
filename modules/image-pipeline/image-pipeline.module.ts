import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueModule } from '@packages/queue';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { STORAGE_UPLOAD_HOOK } from '@packages/storage';
import { UploadsModule } from '@modules/uploads/uploads.module';
import { ImageAssetEntity } from './entities/image-asset.entity';
import { ImagePipelineCheckpointEntity } from './entities/image-pipeline-checkpoint.entity';
import { ImageAssetRepository } from './repositories/image-asset.repository';
import { ImagePipelineCheckpointRepository } from './repositories/image-pipeline-checkpoint.repository';
import { ImageProcessorService } from './services/image-processor.service';
import { ImagePipelineService } from './services/image-pipeline.service';
import { ImageDeliveryService } from './services/image-delivery.service';
import { ImageBackfillService } from './services/image-backfill.service';
import { ImagePipelineProcessor } from './processors/image-pipeline.processor';

const IMAGE_WORKER_ENABLED =
  (process.env['IMAGE_WORKER_ENABLED'] ?? 'false').toLowerCase() === 'true';

@Global()
@Module({
  imports: [
    UploadsModule,
    QueueModule.registerQueue(QUEUE_NAMES.IMAGE_PIPELINE),
    TypeOrmModule.forFeature([ImageAssetEntity, ImagePipelineCheckpointEntity]),
  ],
  providers: [
    ImageAssetRepository,
    ImagePipelineCheckpointRepository,
    ImageProcessorService,
    ImagePipelineService,
    ImageDeliveryService,
    ImageBackfillService,
    {
      provide: STORAGE_UPLOAD_HOOK,
      useExisting: ImagePipelineService,
    },
    ...(IMAGE_WORKER_ENABLED ? [ImagePipelineProcessor] : []),
  ],
  exports: [ImagePipelineService, ImageDeliveryService, ImageBackfillService],
})
export class ImagePipelineModule {}
