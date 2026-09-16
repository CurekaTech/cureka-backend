import { applyMasterListOrdering } from '../utils/master-list-query.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';
import { CategoryFilterEntity } from '../entities/category-filter.entity';
import { MasterStatus } from '../enums/master-status.enum';

interface CategoryFilterFindOptions extends PaginationOptions {
  categoryId?: string;
  status?: MasterStatus;
}

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

  async findActiveByIds(ids: string[]): Promise<CategoryFilterEntity[]> {
    if (!ids.length) return [];
    return this.repo.find({
      where: { id: In([...new Set(ids)]), status: MasterStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  async findByRefIds(refIds: string[]): Promise<CategoryFilterEntity[]> {
    if (!refIds.length) return [];
    return this.repo.find({
      where: { refId: In([...new Set(refIds)]) },
      relations: { categories: true },
      select: {
        id: true,
        refId: true,
        name: true,
        status: true,
        values: true,
        categories: {
          id: true,
        },
      },
    });
  }

  async findAllActiveOrderedByName(): Promise<CategoryFilterEntity[]> {
    return this.repo.find({
      where: { status: MasterStatus.ACTIVE },
      relations: { categories: true },
      order: { name: 'ASC' },
      select: {
        id: true,
        refId: true,
        name: true,
        values: true,
        status: true,
        categories: {
          id: true,
        },
      },
    });
  }

  async findByRefIdsOrNames(keys: string[]): Promise<CategoryFilterEntity[]> {
    const normalizedKeys = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
    if (!normalizedKeys.length) return [];

    const loweredNames = normalizedKeys.map((key) => key.toLowerCase());
    return this.repo
      .createQueryBuilder('categoryFilter')
      .leftJoinAndSelect('categoryFilter.categories', 'category')
      .where('categoryFilter.refId IN (:...keys)', { keys: normalizedKeys })
      .orWhere('LOWER(categoryFilter.name) IN (:...loweredNames)', { loweredNames })
      .select([
        'categoryFilter.id',
        'categoryFilter.refId',
        'categoryFilter.name',
        'categoryFilter.status',
        'categoryFilter.values',
        'category.id',
      ])
      .getMany();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'categoryFilter', name, excludeRefId);
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
    options: CategoryFilterFindOptions,
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
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'categoryFilter', options.status, sortColumn, sortOrder);

    if (options.categoryId) {
      qb.innerJoin('categoryFilter.categories', 'category').andWhere(
        'category.id = :categoryId',
        { categoryId: options.categoryId },
      );
    }

    if (options.search) {
      qb.andWhere('categoryFilter.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('categoryFilter.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
