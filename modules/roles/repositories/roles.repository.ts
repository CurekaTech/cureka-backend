import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';
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

  async create(data: Partial<RoleEntity>, manager?: EntityManager): Promise<RoleEntity> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.repo;
    const entity = repo.create(data);
    return repo.save(entity);
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

  async findByRefId(refId: string, manager?: EntityManager): Promise<RoleEntity | null> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.repo;
    return repo.findOne({
      where: { refId },
      relations: { permissions: true },
      order: { permissions: { module: 'ASC', action: 'ASC', name: 'ASC' } },
    });
  }

  async findBySlug(slug: string): Promise<RoleEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async updateByRefId(
    refId: string,
    data: Partial<RoleEntity>,
    manager?: EntityManager,
  ): Promise<RoleEntity | null> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.repo;
    const existing = await this.findByRefId(refId, manager);
    if (!existing) {
      return null;
    }

    const { permissions, ...columns } = data;
    const columnUpdate = Object.fromEntries(
      Object.entries(columns).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(columnUpdate).length > 0) {
      await repo.update(
        { id: existing.id },
        columnUpdate as QueryDeepPartialEntity<RoleEntity>,
      );
    }

    // save() on an already-loaded role does not replace role_permissions rows.
    // Sync the join table explicitly so checked permissions are what gets stored.
    if (permissions) {
      const nextIds = [...new Set(permissions.map((permission) => permission.id))];
      const currentIds = (existing.permissions ?? []).map((permission) => permission.id);
      const nextIdSet = new Set(nextIds);
      const currentIdSet = new Set(currentIds);
      const toAdd = nextIds.filter((id) => !currentIdSet.has(id));
      const toRemove = currentIds.filter((id) => !nextIdSet.has(id));

      if (toAdd.length > 0 || toRemove.length > 0) {
        await (manager ?? repo.manager)
          .createQueryBuilder()
          .relation(RoleEntity, 'permissions')
          .of(existing.id)
          .addAndRemove(toAdd, toRemove);
      }
    }

    return this.findByRefId(refId, manager);
  }

  async softDeleteByRefId(refId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(RoleEntity) : this.repo;
    await repo.softDelete({ refId });
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
