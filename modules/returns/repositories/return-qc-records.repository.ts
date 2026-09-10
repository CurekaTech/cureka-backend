import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ReturnQcRecordEntity } from '../entities/return-qc-record.entity';

@Injectable()
export class ReturnQcRecordsRepository {
  constructor(
    @InjectRepository(ReturnQcRecordEntity)
    private readonly repo: Repository<ReturnQcRecordEntity>,
  ) {}

  createMany(
    data: Partial<ReturnQcRecordEntity>[],
    manager?: EntityManager,
  ): Promise<ReturnQcRecordEntity[]> {
    const repository = manager?.getRepository(ReturnQcRecordEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  findByReturnRequestId(returnRequestId: string): Promise<ReturnQcRecordEntity[]> {
    return this.repo.find({ where: { returnRequestId }, order: { createdAt: 'ASC' } });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
