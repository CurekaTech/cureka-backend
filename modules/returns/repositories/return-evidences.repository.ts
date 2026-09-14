import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ReturnEvidenceMediaType } from '../enums/return-evidence.enum';
import { ReturnEvidenceEntity } from '../entities/return-evidence.entity';

@Injectable()
export class ReturnEvidencesRepository {
  constructor(
    @InjectRepository(ReturnEvidenceEntity)
    private readonly repo: Repository<ReturnEvidenceEntity>,
  ) {}

  createMany(
    data: Partial<ReturnEvidenceEntity>[],
    manager?: EntityManager,
  ): Promise<ReturnEvidenceEntity[]> {
    const repository = manager?.getRepository(ReturnEvidenceEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  findByReturnRequestId(returnRequestId: string): Promise<ReturnEvidenceEntity[]> {
    return this.repo.find({
      where: { returnRequestId },
      order: { createdAt: 'ASC' },
    });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async countByMediaType(
    returnRequestId: string,
    manager?: EntityManager,
  ): Promise<Record<ReturnEvidenceMediaType, number>> {
    const repository = manager?.getRepository(ReturnEvidenceEntity) ?? this.repo;
    const rows = await repository
      .createQueryBuilder('evidence')
      .select('evidence.mediaType', 'mediaType')
      .addSelect('COUNT(*)', 'total')
      .where('evidence.returnRequestId = :returnRequestId', { returnRequestId })
      .groupBy('evidence.mediaType')
      .getRawMany<{ mediaType: ReturnEvidenceMediaType; total: string }>();

    return {
      [ReturnEvidenceMediaType.IMAGE]:
        Number(rows.find((row) => row.mediaType === ReturnEvidenceMediaType.IMAGE)?.total ?? 0),
      [ReturnEvidenceMediaType.VIDEO]:
        Number(rows.find((row) => row.mediaType === ReturnEvidenceMediaType.VIDEO)?.total ?? 0),
    };
  }
}
