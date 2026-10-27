import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@packages/queue/queue.constants';
import { Job } from 'bullmq';
import {
  TYPESENSE_JOB_NAMES,
  TypesenseReindexJobData,
} from '../constants/typesense-queue.constants';
import { TypesenseIndexerService } from '../services/typesense-indexer.service';

@Injectable()
@Processor(QUEUE_NAMES.TYPESENSE, { concurrency: 1 })
export class TypesenseProcessor extends WorkerHost {
  private readonly logger = new Logger(TypesenseProcessor.name);

  constructor(private readonly indexer: TypesenseIndexerService) {
    super();
  }

  async process(job: Job<TypesenseReindexJobData>): Promise<void> {
    const { refId } = job.data;
    this.logger.log(`Typesense ${job.name} started refId=${refId}`);

    switch (job.name) {
      case TYPESENSE_JOB_NAMES.REINDEX_CATEGORY:
        await this.indexer.reindexByCategoryRefId(refId);
        return;
      case TYPESENSE_JOB_NAMES.REINDEX_BRAND:
        await this.indexer.reindexByBrandRefId(refId);
        return;
      default:
        this.logger.warn(`Unknown Typesense job ${job.name}`);
    }
  }
}
