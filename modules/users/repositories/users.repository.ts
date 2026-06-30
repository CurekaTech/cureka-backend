import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { id }, relations: { roleRecord: true } });
  }

  async findByRefId(refId: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { refId }, relations: { roleRecord: true } });
  }

  async findByMobileNumber(mobileNumber: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { mobileNumber }, relations: { roleRecord: true } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { email }, relations: { roleRecord: true } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.repo.exists({ where: { email } });
  }

  async existsByMobileNumber(mobileNumber: string): Promise<boolean> {
    return this.repo.exists({ where: { mobileNumber } });
  }

  async isEmailTakenByOther(email: string, userId: string): Promise<boolean> {
    return this.repo
      .createQueryBuilder('user')
      .where('user.email = :email', { email })
      .andWhere('user.id != :userId', { userId })
      .getExists();
  }

  async isMobileTakenByOther(mobileNumber: string, userId: string): Promise<boolean> {
    return this.repo
      .createQueryBuilder('user')
      .where('user.mobileNumber = :mobileNumber', { mobileNumber })
      .andWhere('user.id != :userId', { userId })
      .getExists();
  }

  /** PK update in a single round-trip (no pre-fetch). */
  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    const entity = await this.repo.save({ id, ...data });
    return entity;
  }

  async updateByRefId(refId: string, data: Partial<UserEntity>): Promise<UserEntity | null> {
    const existing = await this.findByRefId(refId);
    if (!existing) return null;
    return this.update(existing.id, data);
  }

  async updateLastLoginAt(id: string): Promise<void> {
    await this.repo.update(id, { lastLoginAt: new Date() });
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: UserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const sortOrder = options.sortOrder ?? 'DESC';

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'user.createdAt',
      firstName: 'user.firstName',
      lastName: 'user.lastName',
      email: 'user.email',
      status: 'user.status',
      lastLoginAt: 'user.lastLoginAt',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'user.createdAt';

    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleRecord', 'roleRecord')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        `(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.mobileNumber ILIKE :search OR user.refId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return { data, total };
  }

  async findCustomersPaginated(
    options: PaginationOptions,
  ): Promise<{ data: UserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const sortOrder = options.sortOrder ?? 'DESC';

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'user.createdAt',
      firstName: 'user.firstName',
      lastName: 'user.lastName',
      email: 'user.email',
      status: 'user.status',
      lastLoginAt: 'user.lastLoginAt',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'user.createdAt';

    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleRecord', 'roleRecord')
      .select([
        'user.id',
        'user.refId',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.mobileNumber',
        'user.isGuest',
        'user.isRegistered',
        'user.status',
        'user.role',
        'user.roleId',
        'user.createdAt',
        'roleRecord.id',
        'roleRecord.refId',
        'roleRecord.name',
        'roleRecord.slug',
        'roleRecord.status',
      ])
      .where('user.role = :role', { role: UserRole.CUSTOMER })
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        `(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.mobileNumber ILIKE :search OR user.refId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return { data, total };
  }

  async findStaffPaginated(options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    roles: string[];
  }): Promise<{ data: UserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleRecord', 'roleRecord')
      .where('user.role IN (:...roles)', { roles: options.roles })
      .orderBy('user.createdAt', sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        `(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.mobileNumber ILIKE :search OR user.refId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
