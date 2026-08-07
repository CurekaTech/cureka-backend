import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { IUserOrderMetrics, IUserRecentOrder } from '../interfaces/user.interface';

type UserListOptions = PaginationOptions & {
  status?: UserStatus;
  isGuest?: boolean;
};

const USER_SORTABLE_COLUMNS: Record<string, string> = {
  createdAt: 'user.createdAt',
  updatedAt: 'user.updatedAt',
  firstName: 'user.firstName',
  lastName: 'user.lastName',
  email: 'user.email',
  mobileNumber: 'user.mobileNumber',
  refId: 'user.refId',
  status: 'user.status',
  lastLoginAt: 'user.lastLoginAt',
  isGuest: 'user.isGuest',
  isRegistered: 'user.isRegistered',
  role: 'user.role',
};

const ORDER_METRICS_SORT_EXPRESSIONS: Record<string, string> = {
  totalOrders:
    '(SELECT COUNT(*)::int FROM orders o WHERE o.user_id = "user"."id" AND o.deleted_at IS NULL)',
  totalSpend:
    '(SELECT COALESCE(SUM(o.grand_total::numeric), 0) FROM orders o WHERE o.user_id = "user"."id" AND o.deleted_at IS NULL)',
  lastOrderAt:
    '(SELECT MAX(COALESCE(o.placed_at, o.created_at)) FROM orders o WHERE o.user_id = "user"."id" AND o.deleted_at IS NULL)',
};

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
    options: UserListOptions,
  ): Promise<{ data: UserEntity[]; total: number }> {
    // Admin "users" list = storefront customers only (vendors/staff excluded).
    return this.findUsersPaginated(options, { role: UserRole.CUSTOMER });
  }

  async findCustomersPaginated(
    options: UserListOptions,
  ): Promise<{ data: UserEntity[]; total: number }> {
    return this.findUsersPaginated(options, { role: UserRole.CUSTOMER });
  }

  /**
   * Paginate without joining relations so metric ORDER BY subqueries work.
   * Role records are loaded in a second query and reattached in page order.
   */
  private async findUsersPaginated(
    options: UserListOptions,
    extras?: { role?: UserRole },
  ): Promise<{ data: UserEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const sortOrder = this.normalizeSortOrder(options.sortOrder);
    const sortBy = options.sortBy?.trim() || 'createdAt';

    const qb = this.repo.createQueryBuilder('user').select(['user.id']);

    if (extras?.role) {
      qb.where('user.role = :role', { role: extras.role });
    }

    this.applyUserListFilters(qb, options);
    this.applyUserListSort(qb, sortBy, sortOrder);
    qb.addOrderBy('user.createdAt', 'DESC').skip(skip).take(take);

    const [pageRows, total] = await qb.getManyAndCount();
    const ids = pageRows.map((row) => row.id);

    if (!ids.length) {
      return { data: [], total };
    }

    const entities = await this.repo.find({
      where: { id: In(ids) },
      relations: { roleRecord: true },
    });
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((entity): entity is UserEntity => Boolean(entity));

    return { data, total };
  }

  private normalizeSortOrder(sortOrder?: string): 'ASC' | 'DESC' {
    return sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  }

  /**
   * Metric sorts use correlated subqueries in ORDER BY — avoids TypeORM entity
   * metadata errors from joining a raw subquery alias.
   */
  private applyUserListSort(
    qb: SelectQueryBuilder<UserEntity>,
    sortBy: string,
    sortOrder: 'ASC' | 'DESC',
  ): void {
    const metricsExpression = ORDER_METRICS_SORT_EXPRESSIONS[sortBy];
    if (metricsExpression) {
      qb.orderBy(metricsExpression, sortOrder, 'NULLS LAST');
      return;
    }

    const sortColumn = USER_SORTABLE_COLUMNS[sortBy] ?? USER_SORTABLE_COLUMNS.createdAt;
    qb.orderBy(sortColumn, sortOrder);
  }

  private applyUserListFilters(
    qb: SelectQueryBuilder<UserEntity>,
    options: UserListOptions,
  ): void {
    if (options.status) {
      qb.andWhere('user.status = :status', { status: options.status });
    }

    if (options.isGuest !== undefined) {
      qb.andWhere('user.isGuest = :isGuest', { isGuest: options.isGuest });
    }

    if (options.search) {
      qb.andWhere(
        `(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.mobileNumber ILIKE :search OR user.refId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }
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

  /**
   * Batch order aggregates for admin users list/detail.
   * Counts all non-deleted orders; spend is SUM(grand_total).
   */
  async findOrderMetricsByUserIds(
    userIds: string[],
  ): Promise<Map<string, IUserOrderMetrics>> {
    const result = new Map<string, IUserOrderMetrics>();
    if (!userIds.length) return result;

    const rows = await this.repo.manager.query<
      Array<{
        userId: string;
        totalOrders: string;
        totalSpend: string;
        lastOrderAt: Date | null;
      }>
    >(
      `
      SELECT
        o.user_id AS "userId",
        COUNT(*)::int AS "totalOrders",
        COALESCE(SUM(o.grand_total::numeric), 0)::float AS "totalSpend",
        MAX(COALESCE(o.placed_at, o.created_at)) AS "lastOrderAt"
      FROM orders o
      WHERE o.user_id = ANY($1)
        AND o.deleted_at IS NULL
      GROUP BY o.user_id
      `,
      [userIds],
    );

    for (const row of rows) {
      result.set(row.userId, {
        totalOrders: Number(row.totalOrders) || 0,
        totalSpend: Math.round((Number(row.totalSpend) || 0) * 100) / 100,
        lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt) : null,
      });
    }

    return result;
  }

  async findRecentOrdersByUserId(
    userId: string,
    limit = 10,
  ): Promise<IUserRecentOrder[]> {
    const rows = await this.repo.manager.query<
      Array<{
        id: string;
        refId: string;
        createdAt: Date;
        status: string;
        paymentStatus: string;
        total: string;
      }>
    >(
      `
      SELECT
        o.id AS "id",
        o.order_number AS "refId",
        COALESCE(o.placed_at, o.created_at) AS "createdAt",
        o.order_status AS "status",
        o.payment_status AS "paymentStatus",
        o.grand_total::float AS "total"
      FROM orders o
      WHERE o.user_id = $1
        AND o.deleted_at IS NULL
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC NULLS LAST
      LIMIT $2
      `,
      [userId, limit],
    );

    return rows.map((row) => ({
      id: row.refId,
      refId: row.refId,
      createdAt: new Date(row.createdAt),
      status: row.status,
      paymentStatus: row.paymentStatus,
      total: Math.round((Number(row.total) || 0) * 100) / 100,
    }));
  }
}
