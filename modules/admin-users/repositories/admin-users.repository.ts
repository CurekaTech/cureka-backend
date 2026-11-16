import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AdminUserEntity } from '../entities/admin-user.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class AdminUsersRepository {
  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly repo: Repository<AdminUserEntity>,
  ) {}

  async create(
    data: Partial<AdminUserEntity>,
    manager?: EntityManager,
  ): Promise<AdminUserEntity> {
    const repo = manager ? manager.getRepository(AdminUserEntity) : this.repo;
    const entity = repo.create(data);
    return repo.save(entity);
  }

  async findById(id: string): Promise<AdminUserEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: { roleRecord: { permissions: true } },
    });
  }

  async findByRefId(refId: string): Promise<AdminUserEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: { roleRecord: { permissions: true } },
    });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<AdminUserEntity>,
    manager?: EntityManager,
  ): Promise<AdminUserEntity | null> {
    const repo = manager ? manager.getRepository(AdminUserEntity) : this.repo;
    await repo.update({ refId }, data);
    if (manager) {
      return manager.getRepository(AdminUserEntity).findOne({
        where: { refId },
        relations: { roleRecord: { permissions: true } },
      });
    }
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AdminUserEntity) : this.repo;
    await repo.softDelete({ refId });
  }

  async findByEmail(email: string): Promise<AdminUserEntity | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<AdminUserEntity | null> {
    return this.passwordQuery().where('admin_user.email = :email', { email }).getOne();
  }

  async findByNormalizedEmailWithPassword(email: string): Promise<AdminUserEntity | null> {
    return this.passwordQuery()
      .where('LOWER(TRIM(admin_user.email)) = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  private passwordQuery() {
    return this.repo
      .createQueryBuilder('admin_user')
      .leftJoinAndSelect('admin_user.roleRecord', 'roleRecord')
      .leftJoinAndSelect('roleRecord.permissions', 'permission')
      .addSelect('admin_user.password');
  }

  async update(id: string, data: Partial<AdminUserEntity>): Promise<AdminUserEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: AdminUserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    // Allowlist prevents SQL injection from sortBy input
    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'admin_user.createdAt',
      fullName: 'admin_user.fullName',
      email: 'admin_user.email',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'admin_user.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('admin_user')
      .leftJoinAndSelect('admin_user.roleRecord', 'roleRecord')
      .leftJoinAndSelect('roleRecord.permissions', 'permission')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where(
        'admin_user.full_name ILIKE :search OR admin_user.email ILIKE :search',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repo.count({ where: { email } });
    return count > 0;
  }

  /**
   * Includes soft-deleted rows. The unique index on email is not partial,
   * so deleted admins still occupy the address even though list queries hide them.
   */
  async findByNormalizedEmailIncludingDeleted(
    email: string,
  ): Promise<AdminUserEntity | null> {
    return this.repo
      .createQueryBuilder('admin_user')
      .withDeleted()
      .where('LOWER(TRIM(admin_user.email)) = :email', {
        email: email.trim().toLowerCase(),
      })
      .getOne();
  }

  async restoreAndUpdate(
    id: string,
    data: Partial<AdminUserEntity>,
    manager?: EntityManager,
  ): Promise<AdminUserEntity | null> {
    const repo = manager ? manager.getRepository(AdminUserEntity) : this.repo;
    await repo.restore(id);
    await repo.update(id, data);
    if (manager) {
      return repo.findOne({
        where: { id },
        relations: { roleRecord: { permissions: true } },
      });
    }
    return this.findById(id);
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }
}
