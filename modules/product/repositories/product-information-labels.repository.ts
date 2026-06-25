import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { ProductInformationLabelEntity } from '../entities/product-information-label.entity';

@Injectable()
export class ProductInformationLabelsRepository {
  constructor(
    @InjectRepository(ProductInformationLabelEntity)
    private readonly repo: Repository<ProductInformationLabelEntity>,
  ) {}

  async create(data: Partial<ProductInformationLabelEntity>): Promise<ProductInformationLabelEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ProductInformationLabelEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('label')
      .where('label.name = :name', { name })
      .andWhere('label.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('label.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductInformationLabelEntity>,
  ): Promise<ProductInformationLabelEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: ProductInformationLabelEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'label.createdAt',
      name: 'label.name',
      status: 'label.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'label.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('label')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('label.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
