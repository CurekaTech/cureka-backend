import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { CartEntity } from '../entities/cart.entity';
import {
  AbandonedCartListOptions,
  AbandonedCartListRow,
} from '../interfaces/abandoned-cart.interface';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAST_ACTIVITY_SQL = 'GREATEST(cart.updated_at, MAX(items.updated_at))';
const TOTAL_AMOUNT_SQL =
  'COALESCE(SUM(items.quantity * CAST(variant.selling_price AS DECIMAL)), 0)';
const CUSTOMER_NAME_SQL =
  "TRIM(CONCAT(COALESCE(user.first_name, ''), ' ', COALESCE(user.last_name, '')))";

@Injectable()
export class CartsRepository {
  constructor(
    @InjectRepository(CartEntity)
    private readonly repo: Repository<CartEntity>,
  ) {}

  private readonly activeCartRelations = {
    coupon: true,
    items: {
      product: { media: true },
      variant: {
        attributeValues: {
          attribute: true,
        },
      },
    },
  } as const;

  findActiveByUserId(userId: string, manager?: EntityManager): Promise<CartEntity | null> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.findOne({
      where: { userId, isActive: true },
      relations: this.activeCartRelations,
      order: { items: { createdAt: 'ASC' } },
    });
  }

  findActiveById(id: string, manager?: EntityManager): Promise<CartEntity | null> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.findOne({
      where: { id, isActive: true },
      relations: this.activeCartRelations,
      order: { items: { createdAt: 'ASC' } },
    });
  }

  /** Lookup by id regardless of isActive (used by GoKwik session_key checks). */
  findById(id: string, manager?: EntityManager): Promise<CartEntity | null> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  create(data: Partial<CartEntity>, manager?: EntityManager): Promise<CartEntity> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  updateById(id: string, data: Partial<CartEntity>, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    return repository.update({ id }, data).then(() => undefined);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findActiveByIdOrRefId(idOrRefId: string, manager?: EntityManager): Promise<CartEntity | null> {
    const repository = manager ? manager.getRepository(CartEntity) : this.repo;
    const isUuid = UUID_RE.test(idOrRefId);
    return repository.findOne({
      where: isUuid ? { id: idOrRefId, isActive: true } : { refId: idOrRefId, isActive: true },
      relations: this.activeCartRelations,
      order: { items: { createdAt: 'ASC' } },
    });
  }

  async findAbandonedPaginated(
    options: AbandonedCartListOptions,
  ): Promise<{ data: AbandonedCartListRow[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortOrder = options.sortOrder ?? 'DESC';
    const SORTABLE: Record<string, string> = {
      lastActivityAt: LAST_ACTIVITY_SQL,
      totalAmount: TOTAL_AMOUNT_SQL,
      customerName: CUSTOMER_NAME_SQL,
      mobileNumber: 'user.mobile_number',
      createdAt: 'cart.created_at',
    };
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? SORTABLE.lastActivityAt;

    const countQb = this.buildAbandonedBaseQb(options)
      .select('cart.id', 'id')
      .groupBy('cart.id');
    this.applyAbandonedHaving(countQb, options);

    const [countSql, countParams] = countQb.getQueryAndParameters();
    const countRows = (await this.repo.query(
      `SELECT COUNT(*)::int AS "cnt" FROM (${countSql}) AS abandoned_carts`,
      countParams,
    )) as Array<{ cnt: number }>;
    const total = Number(countRows[0]?.cnt ?? 0);

    const dataQb = this.buildAbandonedBaseQb(options)
      .select('cart.id', 'id')
      .addSelect('cart.refId', 'refId')
      .addSelect('cart.userId', 'userId')
      .addSelect('cart.createdAt', 'createdAt')
      .addSelect('cart.updatedAt', 'updatedAt')
      .addSelect('user.refId', 'userRefId')
      .addSelect('user.firstName', 'firstName')
      .addSelect('user.lastName', 'lastName')
      .addSelect('user.mobileNumber', 'mobileNumber')
      .addSelect('user.email', 'email')
      .addSelect('user.isGuest', 'isGuest')
      .addSelect('COALESCE(SUM(items.quantity), 0)', 'itemCount')
      .addSelect(TOTAL_AMOUNT_SQL, 'totalAmount')
      .addSelect(LAST_ACTIVITY_SQL, 'lastActivityAt')
      .groupBy('cart.id')
      .addGroupBy('user.id')
      .orderBy(sortColumn, sortOrder, 'NULLS LAST')
      .offset(skip)
      .limit(take);
    this.applyAbandonedHaving(dataQb, options);

    const rawRows = await dataQb.getRawMany<Record<string, unknown>>();
    return { data: rawRows.map((row) => this.mapAbandonedRawRow(row)), total };
  }

  private buildAbandonedBaseQb(
    options: AbandonedCartListOptions,
  ): SelectQueryBuilder<CartEntity> {
    const qb = this.repo
      .createQueryBuilder('cart')
      .innerJoin('cart.user', 'user')
      .innerJoin('cart.items', 'items')
      .leftJoin('items.variant', 'variant')
      .where('cart.isActive = :isActive', { isActive: true });

    const search = options.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.firstName ILIKE :search
          OR user.lastName ILIKE :search
          OR CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, '')) ILIKE :search
          OR user.mobileNumber ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb;
  }

  private applyAbandonedHaving(
    qb: SelectQueryBuilder<CartEntity>,
    options: AbandonedCartListOptions,
  ): void {
    if (options.fromDate) {
      qb.andHaving(`${LAST_ACTIVITY_SQL} >= :fromDate`, {
        fromDate: this.toRangeStart(options.fromDate),
      });
    }
    if (options.toDate) {
      qb.andHaving(`${LAST_ACTIVITY_SQL} <= :toDate`, {
        toDate: this.toRangeEnd(options.toDate),
      });
    }
    if (options.minAmount != null) {
      qb.andHaving(`${TOTAL_AMOUNT_SQL} >= :minAmount`, { minAmount: options.minAmount });
    }
    if (options.maxAmount != null) {
      qb.andHaving(`${TOTAL_AMOUNT_SQL} <= :maxAmount`, { maxAmount: options.maxAmount });
    }
  }

  private toRangeStart(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  }

  private toRangeEnd(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  }

  private mapAbandonedRawRow(row: Record<string, unknown>): AbandonedCartListRow {
    const pick = (...keys: string[]): unknown => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null) return row[key];
      }
      return null;
    };

    const toDate = (value: unknown): Date =>
      value instanceof Date ? value : new Date(String(value ?? ''));
    const toBool = (value: unknown): boolean =>
      value === true || value === 'true' || value === 't' || value === 1 || value === '1';

    return {
      id: String(pick('id', 'cart_id') ?? ''),
      refId: String(pick('refId', 'cart_refId', 'ref_id') ?? ''),
      userId: String(pick('userId', 'cart_userId', 'user_id') ?? ''),
      userRefId: String(pick('userRefId', 'user_refId', 'user_ref_id') ?? ''),
      firstName: (pick('firstName', 'user_firstName', 'first_name') as string | null) ?? null,
      lastName: (pick('lastName', 'user_lastName', 'last_name') as string | null) ?? null,
      mobileNumber:
        (pick('mobileNumber', 'user_mobileNumber', 'mobile_number') as string | null) ?? null,
      email: (pick('email', 'user_email') as string | null) ?? null,
      isGuest: toBool(pick('isGuest', 'user_isGuest', 'is_guest')),
      itemCount: Number(pick('itemCount', 'item_count') ?? 0),
      totalAmount: Number(pick('totalAmount', 'total_amount') ?? 0),
      lastActivityAt: toDate(pick('lastActivityAt', 'last_activity_at')),
      createdAt: toDate(pick('createdAt', 'cart_createdAt', 'created_at')),
      updatedAt: toDate(pick('updatedAt', 'cart_updatedAt', 'updated_at')),
    };
  }
}
