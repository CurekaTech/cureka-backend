import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { createJobLogger } from '@packages/logger';
import { QUEUE_NAMES } from '@packages/queue';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { IMAGE_PIPELINE_JOB_NAMES } from '../constants/image-pipeline.constants';
import { IImageProcessJobData } from '../interfaces/image-pipeline.interface';
import { ImagePipelineService } from '../services/image-pipeline.service';
import { ImageProcessingError } from '../services/image-processor.service';
import { sanitizeErrorMessage } from '../utils/redact-storage-url.util';

const workerConcurrency = Math.min(
  Math.max(parseInt(process.env['IMAGE_WORKER_CONCURRENCY'] ?? '1', 10) || 1, 1),
  8,
);

@Injectable()
@Processor(QUEUE_NAMES.IMAGE_PIPELINE, { concurrency: workerConcurrency })
export class ImagePipelineProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ImagePipelineProcessor.name);

  constructor(
    private readonly pinoLogger: PinoLogger,
    private readonly configService: ConfigService,
    private readonly pipeline: ImagePipelineService,
    @InjectQueue(QUEUE_NAMES.IMAGE_PIPELINE) private readonly queue: Queue,
  ) {
    super();
    this.pinoLogger.setContext(ImagePipelineProcessor.name);
  }

  async onModuleInit(): Promise<void> {
    if (!this.pipeline.isWorkerEnabled()) return;

    const intervalMs =
      this.configService.get<number>('imagePipeline.reconcileIntervalMs') ?? 300_000;
    await this.queue.add(
      IMAGE_PIPELINE_JOB_NAMES.RECONCILE_PENDING,
      {},
      {
        repeat: { every: intervalMs },
        jobId: 'image-pipeline-reconcile',
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
  }

  async process(job: Job): Promise<void> {
    const logger = createJobLogger(this.pinoLogger, {
      jobId: job.id,
      jobName: job.name,
      queue: QUEUE_NAMES.IMAGE_PIPELINE,
      attempt: job.attemptsMade + 1,
    });

    if (job.name === IMAGE_PIPELINE_JOB_NAMES.RECONCILE_PENDING) {
      const queued = await this.pipeline.reconcilePending();
      logger.log({ queued }, 'Image pipeline reconcile completed');
      return;
    }

    const data = job.data as IImageProcessJobData;
    logger.log({ sourceKey: data.sourceKey, attempt: job.attemptsMade + 1 }, 'Image process started');

    try {
      await this.pipeline.processJob(data);
    } catch (error) {
      if (error instanceof ImageProcessingError && error.permanent) {
        throw new UnrecoverableError(sanitizeErrorMessage(error));
      }
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.warn(
      `Image pipeline job failed id=${job?.id ?? 'unknown'} name=${job?.name ?? 'unknown'} sourceKey=${(job?.data as IImageProcessJobData | undefined)?.sourceKey ?? 'n/a'} err=${sanitizeErrorMessage(error)}`,
    );
  }
}
