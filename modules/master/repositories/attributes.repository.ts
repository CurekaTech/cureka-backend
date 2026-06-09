import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttributeEntity } from '../entities/attribute.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class AttributesRepository {
  constructor(
    @InjectRepository(AttributeEntity)
    private readonly repo: Repository<AttributeEntity>,
  ) {}

  async create(data: Partial<AttributeEntity>): Promise<AttributeEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AttributeEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRefId(refId: string): Promise<AttributeEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<AttributeEntity>): Promise<AttributeEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<AttributeEntity>): Promise<AttributeEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: AttributeEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    // Allowlist prevents SQL injection from sortBy input
    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'attribute.createdAt',
      name: 'attribute.name',
      status: 'attribute.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'attribute.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('attribute')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('attribute.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
