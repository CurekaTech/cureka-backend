import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgeGroupEntity } from '../entities/age-group.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

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

  async update(id: string, data: Partial<AgeGroupEntity>): Promise<AgeGroupEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
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
      qb.where('ageGroup.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsByName(name: string): Promise<boolean> {
    return (await this.repo.count({ where: { name } })) > 0;
  }

  async existsByNameExcluding(name: string, excludeId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('ageGroup')
        .where('ageGroup.name = :name', { name })
        .andWhere('ageGroup.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }
}
