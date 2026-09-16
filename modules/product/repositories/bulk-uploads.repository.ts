import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BulkUploadEntity } from '../entities/bulk-upload.entity';
import { BulkUploadStatus } from '../enums/bulk-upload-status.enum';
import { BulkUploadType } from '../enums/bulk-upload-type.enum';

@Injectable()
export class BulkUploadsRepository {
  constructor(
    @InjectRepository(BulkUploadEntity)
    private readonly repo: Repository<BulkUploadEntity>,
  ) {}

  create(data: Partial<BulkUploadEntity>, manager?: EntityManager): Promise<BulkUploadEntity> {
    const repository = manager ? manager.getRepository(BulkUploadEntity) : this.repo;
    const entity = repository.create(data);
    return repository.save(entity);
  }

  async findByRefId(refId: string, manager?: EntityManager): Promise<BulkUploadEntity | null> {
    const repository = manager ? manager.getRepository(BulkUploadEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  async updateFieldsByRefId(
    refId: string,
    fields: Partial<BulkUploadEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(BulkUploadEntity) : this.repo;
    await repository.update({ refId }, fields);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { refId } });
    return count > 0;
  }

  async countActiveJobs(
    uploadType?: BulkUploadType,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager ? manager.getRepository(BulkUploadEntity) : this.repo;
    const activeStatuses = [
      BulkUploadStatus.VALIDATING,
      BulkUploadStatus.QUEUED,
      BulkUploadStatus.PROCESSING,
    ];

    const qb = repository
      .createQueryBuilder('job')
      .where('job.status IN (:...statuses)', { statuses: activeStatuses });

    if (uploadType) {
      qb.andWhere('job.uploadType = :uploadType', { uploadType });
    }

    return qb.getCount();
  }

  async findHistory(
    page = 1,
    limit = 20,
    uploadType: BulkUploadType = BulkUploadType.PRODUCT,
  ): Promise<[BulkUploadEntity[], number]> {
    return this.repo.findAndCount({
      where: { uploadType },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
