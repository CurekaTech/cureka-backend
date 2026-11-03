import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { QualificationEntity } from '../entities/qualification.entity';

@Injectable()
export class QualificationsRepository {
  constructor(
    @InjectRepository(QualificationEntity)
    private readonly repo: Repository<QualificationEntity>,
  ) {}

  create(data: Partial<QualificationEntity>) {
    return this.repo.save(this.repo.create(data));
  }

  findByRefId(refId: string) {
    return this.repo.findOne({ where: { refId } });
  }

  findById(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  existsByRefId(refId: string) {
    return this.repo.exists({ where: { refId } });
  }

  async existsByName(name: string, excludeRefId?: string) {
    const qb = this.repo
      .createQueryBuilder('q')
      .where('LOWER(q.name) = LOWER(:name)', { name })
      .andWhere('q.deletedAt IS NULL');
    if (excludeRefId) qb.andWhere('q.refId != :excludeRefId', { excludeRefId });
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(refId: string, data: Partial<QualificationEntity>) {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  softDeleteByRefId(refId: string) {
    return this.repo.softDelete({ refId });
  }

  async findAllPaginated(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: MasterStatus;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo
      .createQueryBuilder('q')
      .orderBy('q.createdAt', options.sortOrder ?? 'DESC')
      .skip(skip)
      .take(take);
    if (options.search) {
      qb.andWhere('q.name ILIKE :search', { search: `%${options.search}%` });
    }
    if (options.status) qb.andWhere('q.status = :status', { status: options.status });
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
