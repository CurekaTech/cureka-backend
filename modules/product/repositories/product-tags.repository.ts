import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions, CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '@modules/master/utils/master-cursor-query.util';
import { buildSkipTake } from '@packages/database';
import { ProductTagEntity } from '../entities/product-tag.entity';
import { ProductTagMappingEntity } from '../entities/product-tag-mapping.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Injectable()
export class ProductTagsRepository {
  constructor(
    @InjectRepository(ProductTagEntity)
    private readonly repo: Repository<ProductTagEntity>,
    @InjectRepository(ProductTagMappingEntity)
    private readonly mappingRepo: Repository<ProductTagMappingEntity>,
  ) {}

  async create(data: Partial<ProductTagEntity>): Promise<ProductTagEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ProductTagEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('tag')
      .where('tag.name = :name', { name })
      .andWhere('tag.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('tag.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('tag')
      .where('tag.slug = :slug', { slug })
      .andWhere('tag.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('tag.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductTagEntity>,
  ): Promise<ProductTagEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async countProductMappings(tagId: string): Promise<number> {
    return this.mappingRepo.count({ where: { tagId } });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: ProductTagEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'tag.createdAt',
      name: 'tag.name',
      status: 'tag.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'tag.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('tag')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('tag.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<ProductTagEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'tag',
      sortableColumns: {
        createdAt: 'tag.createdAt',
        name: 'tag.name',
        status: 'tag.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: 'tag.name ILIKE :search',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<ProductTagEntity[]> {
    const qb = this.repo.createQueryBuilder('tag').orderBy('tag.name', 'ASC');
    if (status) {
      qb.where('tag.status = :status', { status });
    }
    return qb.getMany();
  }
}
