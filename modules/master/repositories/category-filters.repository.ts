import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { CategoryFilterEntity } from '../entities/category-filter.entity';

@Injectable()
export class CategoryFiltersRepository {
  constructor(
    @InjectRepository(CategoryFilterEntity)
    private readonly repo: Repository<CategoryFilterEntity>,
  ) {}

  async create(data: Partial<CategoryFilterEntity>): Promise<CategoryFilterEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<CategoryFilterEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<CategoryFilterEntity>,
  ): Promise<CategoryFilterEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: CategoryFilterEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'categoryFilter.createdAt',
      name: 'categoryFilter.name',
      status: 'categoryFilter.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'categoryFilter.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('categoryFilter')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('categoryFilter.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
