import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgeGroupEntity } from '../entities/age-group.entity';
import { buildSkipTake } from '@packages/database';
import { MasterListOptions } from '../utils/master-list-query.util';

@Injectable()
export class AgeGroupsRepository {
  constructor(
    @InjectRepository(AgeGroupEntity)
    private readonly repo: Repository<AgeGroupEntity>,
  ) {}

  async create(data: Partial<AgeGroupEntity>): Promise<AgeGroupEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AgeGroupEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRefId(refId: string): Promise<AgeGroupEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<AgeGroupEntity>): Promise<AgeGroupEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<AgeGroupEntity>): Promise<AgeGroupEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: AgeGroupEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'ageGroup.createdAt',
      name: 'ageGroup.name',
      status: 'ageGroup.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'ageGroup.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('ageGroup')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('ageGroup.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('ageGroup.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

}
