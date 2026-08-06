import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { VendorListSortField } from '../constants/vendor-list.constants';
import { VendorEntity } from '../entities/vendor.entity';
import { VendorStatus } from '../enums/vendor-status.enum';

export type VendorListOptions = PaginationOptions & {
  status?: VendorStatus;
};

const VENDOR_SORTABLE_COLUMNS: Record<VendorListSortField, string> = {
  createdAt: 'vendor.createdAt',
  updatedAt: 'vendor.updatedAt',
  companyName: 'vendor.companyName',
  contactPerson: 'vendor.contactPerson',
  email: 'vendor.email',
  mobileNumber: 'vendor.mobileNumber',
  status: 'vendor.status',
  source: 'vendor.source',
  gstNumber: 'vendor.gstNumber',
  panNumber: 'vendor.panNumber',
  warehousePincode: 'vendor.warehousePincode',
  refId: 'vendor.refId',
};

@Injectable()
export class VendorsRepository {
  constructor(
    @InjectRepository(VendorEntity)
    private readonly repo: Repository<VendorEntity>,
  ) {}

  private getRepo(manager?: EntityManager): Repository<VendorEntity> {
    return manager ? manager.getRepository(VendorEntity) : this.repo;
  }

  async create(data: Partial<VendorEntity>, manager?: EntityManager): Promise<VendorEntity> {
    const repo = this.getRepo(manager);
    const entity = repo.create(data);
    return repo.save(entity);
  }

  async existsByRefId(refId: string, manager?: EntityManager): Promise<boolean> {
    return this.getRepo(manager).exists({ where: { refId } });
  }

  async findByRefId(refId: string): Promise<VendorEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: { user: true },
    });
  }

  async updateByRefId(
    refId: string,
    data: Partial<VendorEntity>,
    manager?: EntityManager,
  ): Promise<VendorEntity | null> {
    const repo = this.getRepo(manager);
    const existing = await repo.findOne({ where: { refId } });
    if (!existing) return null;
    Object.assign(existing, data);
    await repo.save(existing);
    return repo.findOne({
      where: { refId },
      relations: { user: true },
    });
  }

  async findAllPaginated(
    options: VendorListOptions,
  ): Promise<{ data: VendorEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page ?? 1, options.limit ?? 20);
    const qb = this.repo
      .createQueryBuilder('vendor')
      .leftJoinAndSelect('vendor.user', 'user')
      .where('vendor.deletedAt IS NULL');

    if (options.status) {
      qb.andWhere('vendor.status = :status', { status: options.status });
    }

    if (options.search?.trim()) {
      const search = `%${options.search.trim()}%`;
      qb.andWhere(
        `(
          vendor.companyName ILIKE :search
          OR vendor.contactPerson ILIKE :search
          OR vendor.email ILIKE :search
          OR vendor.mobileNumber ILIKE :search
          OR vendor.refId ILIKE :search
          OR vendor.gstNumber ILIKE :search
          OR vendor.panNumber ILIKE :search
          OR vendor.warehousePincode ILIKE :search
          OR vendor.warehouseAddress ILIKE :search
          OR vendor.businessAddress ILIKE :search
          OR vendor.brandDetails ILIKE :search
        )`,
        { search },
      );
    }

    const sortKey = (options.sortBy?.trim() || 'createdAt') as VendorListSortField;
    const sortColumn = VENDOR_SORTABLE_COLUMNS[sortKey] ?? VENDOR_SORTABLE_COLUMNS.createdAt;
    const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(sortColumn, sortOrder).addOrderBy('vendor.createdAt', 'DESC').skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
