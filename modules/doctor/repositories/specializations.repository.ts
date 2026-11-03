import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { SpecializationEntity } from '../entities/specialization.entity';

@Injectable()
export class SpecializationsRepository {
  constructor(
    @InjectRepository(SpecializationEntity)
    private readonly repo: Repository<SpecializationEntity>,
  ) {}

  create(data: Partial<SpecializationEntity>) {
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

  async existsBySlug(slug: string, excludeRefId?: string) {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.slug = :slug', { slug })
      .andWhere('s.deletedAt IS NULL');
    if (excludeRefId) qb.andWhere('s.refId != :excludeRefId', { excludeRefId });
    return (await qb.getCount()) > 0;
  }

  async existsByName(name: string, excludeRefId?: string) {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('LOWER(s.name) = LOWER(:name)', { name })
      .andWhere('s.deletedAt IS NULL');
    if (excludeRefId) qb.andWhere('s.refId != :excludeRefId', { excludeRefId });
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(refId: string, data: Partial<SpecializationEntity>) {
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
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo.createQueryBuilder('s').skip(skip).take(take);
    qb.orderBy(
      options.sortBy === 'name' ? 's.name' : 's.createdAt',
      options.sortOrder ?? 'DESC',
    );
    if (options.search) {
      qb.andWhere('(s.name ILIKE :search OR s.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }
    if (options.status) qb.andWhere('s.status = :status', { status: options.status });
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
