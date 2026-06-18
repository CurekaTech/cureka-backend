import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthConcernEntity } from '../entities/health-concern.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class HealthConcernsRepository {
  constructor(
    @InjectRepository(HealthConcernEntity)
    private readonly repo: Repository<HealthConcernEntity>,
  ) {}

  async create(data: Partial<HealthConcernEntity>): Promise<HealthConcernEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRefId(refId: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<HealthConcernEntity>,
  ): Promise<HealthConcernEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<HealthConcernEntity>): Promise<HealthConcernEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: HealthConcernEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'healthConcern.createdAt',
      name: 'healthConcern.name',
      slug: 'healthConcern.slug',
      status: 'healthConcern.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'healthConcern.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('healthConcern')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('(healthConcern.name ILIKE :search OR healthConcern.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return (await this.repo.count({ where: { slug } })) > 0;
  }

  async existsBySlugExcluding(slug: string, excludeId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('healthConcern')
        .where('healthConcern.slug = :slug', { slug })
        .andWhere('healthConcern.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }
}
