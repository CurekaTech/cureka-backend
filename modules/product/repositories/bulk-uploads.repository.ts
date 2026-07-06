import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BulkUploadEntity } from '../entities/bulk-upload.entity';

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

  async countActiveJobs(manager?: EntityManager): Promise<number> {
    const repository = manager ? manager.getRepository(BulkUploadEntity) : this.repo;
    return repository.count({
      where: [
        { status: 'validating' as any },
        { status: 'queued' as any },
        { status: 'processing' as any },
      ],
    });
  }

  async findHistory(page = 1, limit = 20): Promise<[BulkUploadEntity[], number]> {
    return this.repo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
