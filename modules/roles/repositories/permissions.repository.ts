import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { PermissionEntity } from '../entities/permission.entity';

@Injectable()
export class PermissionsRepository {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly repo: Repository<PermissionEntity>,
  ) {}

  async create(data: Partial<PermissionEntity>): Promise<PermissionEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByCode(code: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('permission')
      .where('LOWER(permission.code) = LOWER(:code)', { code })
      .andWhere('permission.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('permission.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async findByRefId(refId: string): Promise<PermissionEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findByRefIds(refIds: string[]): Promise<PermissionEntity[]> {
    if (refIds.length === 0) {
      return [];
    }

    return this.repo.find({
      where: { refId: In(refIds) },
      order: { module: 'ASC', action: 'ASC', name: 'ASC' },
    });
  }

  async findAll(): Promise<PermissionEntity[]> {
    return this.repo.find({
      order: { module: 'ASC', action: 'ASC', name: 'ASC' },
    });
  }

  async updateByRefId(
    refId: string,
    data: Partial<PermissionEntity>,
  ): Promise<PermissionEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: PermissionEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const sortableColumns: Record<string, string> = {
      createdAt: 'permission.createdAt',
      name: 'permission.name',
      code: 'permission.code',
      module: 'permission.module',
      action: 'permission.action',
      status: 'permission.status',
    };
    const sortColumn = (options.sortBy && sortableColumns[options.sortBy]) ?? 'permission.module';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('permission')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('permission.action', 'ASC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where(
        'permission.name ILIKE :search OR permission.code ILIKE :search OR permission.module ILIKE :search',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
