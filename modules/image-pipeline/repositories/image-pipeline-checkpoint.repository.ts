import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImagePipelineCheckpointEntity } from '../entities/image-pipeline-checkpoint.entity';
import { IImageBackfillCounts } from '../interfaces/image-pipeline.interface';

const EMPTY_COUNTS: IImageBackfillCounts = {
  scanned: 0,
  eligible: 0,
  alreadyComplete: 0,
  queued: 0,
  unsupported: 0,
  missingSource: 0,
  failed: 0,
  skippedDuplicate: 0,
};

@Injectable()
export class ImagePipelineCheckpointRepository {
  constructor(
    @InjectRepository(ImagePipelineCheckpointEntity)
    private readonly repo: Repository<ImagePipelineCheckpointEntity>,
  ) {}

  async get(id: string): Promise<ImagePipelineCheckpointEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async saveProgress(input: {
    id: string;
    cursorId: string | null;
    entityType: string | null;
    stats: IImageBackfillCounts;
  }): Promise<void> {
    await this.repo.save({
      id: input.id,
      cursorId: input.cursorId,
      entityType: input.entityType,
      stats: input.stats,
    });
  }

  emptyStats(): IImageBackfillCounts {
    return { ...EMPTY_COUNTS };
  }
}
