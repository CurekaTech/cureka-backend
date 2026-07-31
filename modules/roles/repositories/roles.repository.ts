import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { RoleEntity } from '../entities/role.entity';

export type RoleListOptions = PaginationOptions & {
  status?: MasterStatus;
};

@Injectable()
export class RolesRepository {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly repo: Repository<RoleEntity>,
  ) {}

  async create(data: Partial<RoleEntity>): Promise<RoleEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('role')
      .where('LOWER(role.slug) = LOWER(:slug)', { slug })
      .andWhere('role.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('role.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async findByRefId(refId: string): Promise<RoleEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: { permissions: true },
      order: { permissions: { module: 'ASC', action: 'ASC', name: 'ASC' } },
    });
  }

  async findBySlug(slug: string): Promise<RoleEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async updateByRefId(refId: string, data: Partial<RoleEntity>): Promise<RoleEntity | null> {
    const existing = await this.findByRefId(refId);
    if (!existing) {
      return null;
    }

    await this.repo.save({ ...existing, ...data });
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: RoleListOptions,
  ): Promise<{ data: RoleEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const sortableColumns: Record<string, string> = {
      createdAt: 'role.createdAt',
      name: 'role.name',
      slug: 'role.slug',
      status: 'role.status',
    };
    const sortColumn = (options.sortBy && sortableColumns[options.sortBy]) ?? 'role.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('(role.name ILIKE :search OR role.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    if (options.status) {
      qb.andWhere('role.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
