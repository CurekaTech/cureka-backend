import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { canonicalizeIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { CodBlocklistEntryEntity } from '../entities/cod-blocklist-entry.entity';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';
import { toIlikeContains } from '../utils/ilike-escape.util';

export type CodBlocklistListOptions = PaginationOptions & {
  type?: CodBlocklistType;
  isActive?: boolean;
};

const SORTABLE: Record<string, string> = {
  createdAt: 'entry.createdAt',
  updatedAt: 'entry.updatedAt',
  type: 'entry.type',
  pincode: 'entry.pincode',
  mobileNumber: 'entry.mobileNumber',
  isActive: 'entry.isActive',
};

@Injectable()
export class CodBlocklistRepository {
  constructor(
    @InjectRepository(CodBlocklistEntryEntity)
    private readonly repo: Repository<CodBlocklistEntryEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  create(
    data: Partial<CodBlocklistEntryEntity>,
    manager?: EntityManager,
  ): Promise<CodBlocklistEntryEntity> {
    const repository = manager?.getRepository(CodBlocklistEntryEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string): Promise<CodBlocklistEntryEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: { customer: true },
    });
  }

  findByIdOrRefId(idOrRefId: string): Promise<CodBlocklistEntryEntity | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idOrRefId,
    );
    return this.repo.findOne({
      where: isUuid ? { id: idOrRefId } : { refId: idOrRefId.trim().toUpperCase() },
      relations: { customer: true },
    });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findActivePincode(pincode: string, excludingId?: string): Promise<CodBlocklistEntryEntity | null> {
    const qb = this.repo
      .createQueryBuilder('entry')
      .where('entry.type = :type', { type: CodBlocklistType.PINCODE })
      .andWhere('entry.isActive = true')
      .andWhere('entry.pincode = :pincode', { pincode });
    if (excludingId) {
      qb.andWhere('entry.id != :excludingId', { excludingId });
    }
    return qb.getOne();
  }

  /** Any non-deleted PINCODE row for upsert matching (active or inactive). */
  findPincodeEntry(pincode: string): Promise<CodBlocklistEntryEntity | null> {
    return this.repo
      .createQueryBuilder('entry')
      .where('entry.type = :type', { type: CodBlocklistType.PINCODE })
      .andWhere('entry.pincode = :pincode', { pincode })
      .orderBy('entry.updatedAt', 'DESC')
      .getOne();
  }

  /** Any non-deleted CUSTOMER row matched by mobile and/or customerId (active or inactive). */
  findCustomerEntry(params: {
    customerId?: string | null;
    mobileNumber?: string | null;
  }): Promise<CodBlocklistEntryEntity | null> {
    const qb = this.repo
      .createQueryBuilder('entry')
      .where('entry.type = :type', { type: CodBlocklistType.CUSTOMER });

    const clauses: string[] = [];
    if (params.customerId) {
      clauses.push('entry.customerId = :customerId');
    }
    if (params.mobileNumber) {
      clauses.push('entry.mobileNumber = :mobileNumber');
    }
    if (!clauses.length) {
      return Promise.resolve(null);
    }
    qb.andWhere(`(${clauses.join(' OR ')})`, {
      customerId: params.customerId ?? null,
      mobileNumber: params.mobileNumber ?? null,
    });
    return qb.orderBy('entry.updatedAt', 'DESC').getOne();
  }

  findActiveCustomer(
    params: { customerId?: string | null; mobileNumber?: string | null },
    excludingId?: string,
  ): Promise<CodBlocklistEntryEntity | null> {
    const qb = this.repo
      .createQueryBuilder('entry')
      .where('entry.type = :type', { type: CodBlocklistType.CUSTOMER })
      .andWhere('entry.isActive = true');

    const clauses: string[] = [];
    if (params.customerId) {
      clauses.push('entry.customerId = :customerId');
    }
    if (params.mobileNumber) {
      clauses.push('entry.mobileNumber = :mobileNumber');
    }
    if (!clauses.length) {
      return Promise.resolve(null);
    }
    qb.andWhere(`(${clauses.join(' OR ')})`, {
      customerId: params.customerId ?? null,
      mobileNumber: params.mobileNumber ?? null,
    });
    if (excludingId) {
      qb.andWhere('entry.id != :excludingId', { excludingId });
    }
    return qb.getOne();
  }

  async updateById(id: string, data: Partial<CodBlocklistEntryEntity>): Promise<void> {
    await this.repo.update({ id }, data as QueryDeepPartialEntity<CodBlocklistEntryEntity>);
  }

  async softDeleteById(id: string): Promise<void> {
    await this.repo.softDelete({ id });
  }

  async findAllPaginated(
    options: CodBlocklistListOptions,
  ): Promise<{ data: CodBlocklistEntryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const sortColumn = (options.sortBy && SORTABLE[options.sortBy]) ?? 'entry.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.customer', 'customer')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('entry.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.type) {
      qb.andWhere('entry.type = :type', { type: options.type });
    }
    if (options.isActive !== undefined) {
      qb.andWhere('entry.isActive = :isActive', { isActive: options.isActive });
    }
    if (options.search?.trim()) {
      const rawSearch = options.search.trim();
      const search = toIlikeContains(rawSearch);
      const canonicalMobile = canonicalizeIndianMobileNumber(rawSearch);
      const digitSearch = rawSearch.replace(/\D/g, '');
      const mobileSearch =
        canonicalMobile ?? (digitSearch.length >= 4 ? digitSearch : null);

      if (mobileSearch) {
        qb.andWhere(
          `(entry.pincode ILIKE :search ESCAPE '\\'
            OR entry.mobileNumber ILIKE :search ESCAPE '\\'
            OR entry.mobileNumber ILIKE :mobileSearch ESCAPE '\\'
            OR entry.reason ILIKE :search ESCAPE '\\'
            OR entry.customerNameSnapshot ILIKE :search ESCAPE '\\'
            OR customer.firstName ILIKE :search ESCAPE '\\'
            OR customer.lastName ILIKE :search ESCAPE '\\'
            OR TRIM(CONCAT(COALESCE(customer.firstName, ''), ' ', COALESCE(customer.lastName, ''))) ILIKE :search ESCAPE '\\')`,
          { search, mobileSearch: toIlikeContains(mobileSearch) },
        );
      } else {
        qb.andWhere(
          `(entry.pincode ILIKE :search ESCAPE '\\'
            OR entry.mobileNumber ILIKE :search ESCAPE '\\'
            OR entry.reason ILIKE :search ESCAPE '\\'
            OR entry.customerNameSnapshot ILIKE :search ESCAPE '\\'
            OR customer.firstName ILIKE :search ESCAPE '\\'
            OR customer.lastName ILIKE :search ESCAPE '\\'
            OR TRIM(CONCAT(COALESCE(customer.firstName, ''), ' ', COALESCE(customer.lastName, ''))) ILIKE :search ESCAPE '\\')`,
          { search },
        );
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async searchCustomers(params: {
    search: string;
    page: number;
    limit: number;
  }): Promise<{ data: UserEntity[]; total: number; blockedByUserId: Map<string, string> }> {
    const { skip, take } = buildSkipTake(params.page, params.limit);
    const search = toIlikeContains(params.search);
    const digits = params.search.replace(/\D/g, '');
    const mobileSearch = digits.length >= 4 ? toIlikeContains(digits) : null;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.CUSTOMER });

    if (mobileSearch) {
      qb.andWhere(
        `(user.firstName ILIKE :search ESCAPE '\\'
          OR user.lastName ILIKE :search ESCAPE '\\'
          OR TRIM(CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, ''))) ILIKE :search ESCAPE '\\'
          OR user.mobileNumber ILIKE :search ESCAPE '\\'
          OR user.mobileNumber ILIKE :mobileSearch ESCAPE '\\')`,
        { search, mobileSearch },
      );
    } else {
      qb.andWhere(
        `(user.firstName ILIKE :search ESCAPE '\\'
          OR user.lastName ILIKE :search ESCAPE '\\'
          OR TRIM(CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, ''))) ILIKE :search ESCAPE '\\'
          OR user.mobileNumber ILIKE :search ESCAPE '\\')`,
        { search },
      );
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();
    const ids = data.map((user) => user.id);
    const mobiles = [
      ...new Set(
        data
          .map((user) =>
            user.mobileNumber ? canonicalizeIndianMobileNumber(user.mobileNumber) : null,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const blockedByUserId = new Map<string, string>();
    if (ids.length) {
      const blockQb = this.repo
        .createQueryBuilder('entry')
        .select(['entry.id', 'entry.customerId', 'entry.mobileNumber'])
        .where('entry.type = :type', { type: CodBlocklistType.CUSTOMER })
        .andWhere('entry.isActive = true')
        .andWhere(
          mobiles.length
            ? '(entry.customerId IN (:...ids) OR entry.mobileNumber IN (:...mobiles))'
            : 'entry.customerId IN (:...ids)',
          mobiles.length ? { ids, mobiles } : { ids },
        );
      const blocks = await blockQb.getMany();
      const mobileToUserId = new Map(
        data
          .map((user) => {
            const mobile = user.mobileNumber
              ? canonicalizeIndianMobileNumber(user.mobileNumber)
              : null;
            return mobile ? ([mobile, user.id] as const) : null;
          })
          .filter((value): value is readonly [string, string] => Boolean(value)),
      );
      for (const block of blocks) {
        if (block.customerId) {
          blockedByUserId.set(block.customerId, block.id);
        }
        if (block.mobileNumber) {
          const userId = mobileToUserId.get(block.mobileNumber);
          if (userId && !blockedByUserId.has(userId)) {
            blockedByUserId.set(userId, block.id);
          }
        }
      }
    }
    return { data, total, blockedByUserId };
  }
}
