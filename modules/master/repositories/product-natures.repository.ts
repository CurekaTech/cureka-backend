import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductNatureEntity } from '../entities/product-nature.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class ProductNaturesRepository {
  constructor(
    @InjectRepository(ProductNatureEntity)
    private readonly repo: Repository<ProductNatureEntity>,
  ) {}

  async create(data: Partial<ProductNatureEntity>): Promise<ProductNatureEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ProductNatureEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductNatureEntity>,
  ): Promise<ProductNatureEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: ProductNatureEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'productNature.createdAt',
      name: 'productNature.name',
      status: 'productNature.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'productNature.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('productNature')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('productNature.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
